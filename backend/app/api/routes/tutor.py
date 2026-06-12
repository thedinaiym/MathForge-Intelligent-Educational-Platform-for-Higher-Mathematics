"""
Voice AI Tutor route — multi-turn conversation.

POST /api/tutor/chat
  Request:  {
      messages: [{ role: "user" | "assistant", content: str }],
      language: "en" | "ru" | "kg"
  }
  Response: { reply: str, language: str }

Accepts a full message history so the tutor can maintain context across
turns.  The client maintains the history array and appends each new
user message before calling this endpoint.

No token cost — teaching aid, not a graded task.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from groq import AsyncGroq
from pydantic import BaseModel, Field, field_validator

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.schemas import TokenPayload

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)
    language: Literal["en", "ru", "kg"] = "ru"

    @field_validator("language", mode="before")
    @classmethod
    def normalise_language(cls, v: object) -> object:
        """Accept BCP-47 variants (ky, ky-KG, ru-RU, en-US) and map to our codes."""
        if isinstance(v, str):
            code = v.lower().split("-")[0]
            return {"ky": "kg"}.get(code, code)
        return v


class ChatResponse(BaseModel):
    reply:    str
    language: str


# ── System prompts per language ───────────────────────────────────────────────

_SYSTEM: dict[str, str] = {
    "en": (
        "You are Aida, a warm and patient math tutor for school students. "
        "Answer in English. Keep responses concise — 2 to 4 sentences. "
        "Guide the student to think rather than just giving the answer. "
        "Use encouraging, conversational language. "
        "If the student's message is unclear, ask a clarifying question."
    ),
    "ru": (
        "Ты — Айда, тёплый и терпеливый репетитор по математике для школьников. "
        "Отвечай на русском языке. Ответы краткие — 2–4 предложения. "
        "Помогай ученику думать, а не просто давай ответ. "
        "Используй ободряющий, разговорный тон. "
        "Если вопрос неясен, задай уточняющий вопрос."
    ),
    "kg": (
        "Сен — Айда, мектеп окуучулары үчүн жылуу жана сабырдуу математика репетиторусуң. "
        "Кыргыз тилинде жооп бер. Жооптор кыска болсун — 2–4 сүйлөм. "
        "Окуучуга өзү ойлонуусуна жардам бер, жообун эле берме. "
        "Мактоочу, сүйлөшмө тилде жаз. "
        "Суроо түшүнүксүз болсо, тактоочу суроо бер."
    ),
}

_LANGUAGE_INSTRUCTION: dict[str, str] = {
    "en": "Answer only in English.",
    "ru": "Отвечай только на русском языке.",
    "kg": "Кыргыз тилинде гана жооп бер.",
}

# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: TokenPayload = Depends(get_current_user),
) -> ChatResponse:
    """
    Multi-turn voice tutor chat.  The client sends the full message history
    so the tutor can maintain conversational context.
    """
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI tutoring is not configured on this server.",
        )

    system_prompt = _SYSTEM.get(body.language, _SYSTEM["ru"])
    language_instruction = _LANGUAGE_INSTRUCTION.get(body.language, _LANGUAGE_INSTRUCTION["ru"])

    # Build messages for Groq — system prompt first, then conversation history
    groq_messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": language_instruction},
    ]
    for msg in body.messages:
        groq_messages.append({"role": msg.role, "content": msg.content})

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=groq_messages,
            max_tokens=250,
            temperature=0.7,
        )
        reply = (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.exception("Groq tutor chat error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {exc}",
        )

    return ChatResponse(reply=reply, language=body.language)
