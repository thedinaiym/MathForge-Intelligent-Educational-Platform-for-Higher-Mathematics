"""
TTS route — POST /api/tts/generate  and  /api/tts/generate-with-timing

Uses edge-tts (Microsoft Edge TTS, free, no API key) which has native voices for:
  kg  → ky-KG-NazgulNeural (female) / ky-KG-ManasNeural (male)
  ru  → ru-RU-SvetlanaNeural / ru-RU-DmitryNeural
  en  → en-US-JennyNeural / en-US-GuyNeural
"""
from __future__ import annotations

import base64
import io
import logging
from typing import Literal

import edge_tts
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Voice map ─────────────────────────────────────────────────────────────────

_VOICES: dict[str, dict[str, str]] = {
    "kg": {"female": "ky-KG-NazgulNeural",   "male": "ky-KG-ManasNeural"},
    "ru": {"female": "ru-RU-SvetlanaNeural",  "male": "ru-RU-DmitryNeural"},
    "en": {"female": "en-US-JennyNeural",     "male": "en-US-GuyNeural"},
}
_DEFAULT_VOICE = "ru-RU-SvetlanaNeural"


def _pick_voice(language: str, voice_type: str) -> str:
    lang = language.lower().split("-")[0]
    lang = {"ky": "kg"}.get(lang, lang)
    return _VOICES.get(lang, _VOICES["ru"]).get(voice_type, _VOICES.get(lang, _VOICES["ru"])["female"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text:       str                              = Field(..., min_length=1, max_length=2_000)
    language:   Literal["kg", "ru", "en"] = "ru"
    voice_type: Literal["female", "male"]  = "female"


class WordBoundary(BaseModel):
    word:        str
    offset_ms:   float
    duration_ms: float


class TTSTimedResponse(BaseModel):
    audio_base64:    str
    audio_mime:      str = "audio/mpeg"
    word_boundaries: list[WordBoundary]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _synthesise(text: str, voice: str) -> tuple[bytes, list[WordBoundary]]:
    """Call edge-tts and collect audio bytes + word boundaries."""
    communicate = edge_tts.Communicate(text, voice)
    audio_buf   = io.BytesIO()
    boundaries: list[WordBoundary] = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buf.write(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append(WordBoundary(
                word        = chunk.get("text", ""),
                offset_ms   = chunk.get("offset",   0) / 10_000,   # 100-ns units → ms
                duration_ms = chunk.get("duration", 0) / 10_000,
            ))

    return audio_buf.getvalue(), boundaries


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/generate", response_class=Response)
async def generate(body: TTSRequest) -> Response:
    """Return MP3 audio bytes directly (no timing data)."""
    voice = _pick_voice(body.language, body.voice_type)
    try:
        audio, _ = await _synthesise(body.text, voice)
    except Exception as exc:
        logger.exception("edge-tts error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not audio:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TTS returned empty audio")

    return Response(content=audio, media_type="audio/mpeg")


@router.post("/generate-with-timing", response_model=TTSTimedResponse)
async def generate_with_timing(body: TTSRequest) -> TTSTimedResponse:
    """Return base64 MP3 + word-boundary timing for lip-sync."""
    voice = _pick_voice(body.language, body.voice_type)
    try:
        audio, boundaries = await _synthesise(body.text, voice)
    except Exception as exc:
        logger.exception("edge-tts error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    if not audio:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TTS returned empty audio")

    return TTSTimedResponse(
        audio_base64    = base64.b64encode(audio).decode(),
        audio_mime      = "audio/mpeg",
        word_boundaries = boundaries,
    )
