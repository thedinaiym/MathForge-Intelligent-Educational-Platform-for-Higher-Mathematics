"""
Avatar AI Teacher route.

POST /api/avatar/explain
  Request:  { question: str, language: "en" | "ru" | "kg" }
  Response: { explanation: str, language: str }

The endpoint calls Groq Llama-3 with a math-teacher persona in the requested
language.  The frontend then feeds the returned text to the TTS microservice
to produce spoken audio for the 3-D avatar.

No token cost — it is a teaching aid, not a graded task.
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

class ExplainRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1_000)
    language: Literal["en", "ru", "kg"] = "ru"

    @field_validator("question")
    @classmethod
    def strip_question(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("question must not be blank")
        return v

    @field_validator("language", mode="before")
    @classmethod
    def normalise_language(cls, v: object) -> object:
        """Accept BCP-47 variants (ky, ky-KG, ru-RU, en-US) and map to our codes."""
        if isinstance(v, str):
            code = v.lower().split("-")[0]
            return {"ky": "kg"}.get(code, code)
        return v


class ExplainResponse(BaseModel):
    explanation: str
    language:    str


# ── System prompts per language ───────────────────────────────────────────────

_SYSTEM: dict[str, str] = {
    "en": (
        "You are Aida, a friendly and enthusiastic math tutor for school students. "
        "Explain math concepts clearly and step-by-step in English. "
        "Use simple language. Keep answers concise — 3 to 5 sentences max. "
        "Encourage the student. Never just give the answer — guide them to think."
    ),
    "ru": (
        "Ты — Айда, дружелюбный и увлечённый репетитор по математике для школьников. "
        "Объясняй математические понятия чётко и пошагово на русском языке. "
        "Используй простой язык. Ответы должны быть краткими — максимум 3–5 предложений. "
        "Подбадривай ученика. Никогда не давай просто ответ — помогай ему думать самому."
    ),
    "kg": (
        "Сен — Айда, мектеп окуучулары үчүн достук мамиледе жана кызыгуу менен "
        "математика сабагын берген мугалимсиң. "
        "Математикалык түшүнүктөрдү кыргыз тилинде ачык жана кадам-кадам менен түшүндүр. "
        "Жөнөкөй тил колдон. Жооптор кыскача болсун — максимум 3–5 сүйлөм. "
        "Окуучуну мактап коюп жактыр. Жообун эч качан эле берме — аны өзү ойлонуусуна жардам бер."
    ),
}

_LANGUAGE_INSTRUCTION: dict[str, str] = {
    "en": "Answer only in English.",
    "ru": "Отвечай только на русском языке.",
    "kg": "Кыргыз тилинде гана жооп бер.",
}

# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/guest-explain", response_model=ExplainResponse)
async def guest_explain(body: ExplainRequest) -> ExplainResponse:
    """
    Guest endpoint — no auth required.
    Called from the landing page hero for the first 3 free messages.
    Rate limiting is enforced on the frontend via localStorage.
    """
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI tutoring is not configured on this server.",
        )

    system_prompt = _SYSTEM.get(body.language, _SYSTEM["ru"])
    language_instruction = _LANGUAGE_INSTRUCTION.get(body.language, _LANGUAGE_INSTRUCTION["ru"])

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system",  "content": system_prompt},
                {"role": "system",  "content": language_instruction},
                {"role": "user",    "content": body.question},
            ],
            max_tokens=200,
            temperature=0.7,
        )
        explanation = response.choices[0].message.content or ""
    except Exception as exc:
        logger.exception("Groq guest explain error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {exc}",
        )

    return ExplainResponse(explanation=explanation.strip(), language=body.language)


@router.post("/explain", response_model=ExplainResponse)
async def explain(
    body: ExplainRequest,
    current_user: TokenPayload = Depends(get_current_user),
) -> ExplainResponse:
    """
    Generate a short teaching explanation from the avatar AI tutor.

    The tutor (Aida) answers in the requested language, using Groq Llama-3.
    """
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI tutoring is not configured on this server.",
        )

    system_prompt = _SYSTEM.get(body.language, _SYSTEM["ru"])
    language_instruction = _LANGUAGE_INSTRUCTION.get(body.language, _LANGUAGE_INSTRUCTION["ru"])

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system",  "content": system_prompt},
                {"role": "system",  "content": language_instruction},
                {"role": "user",    "content": body.question},
            ],
            max_tokens=300,
            temperature=0.7,
        )
        explanation = response.choices[0].message.content or ""
    except Exception as exc:
        logger.exception("Groq avatar explain error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {exc}",
        )

    return ExplainResponse(explanation=explanation.strip(), language=body.language)
