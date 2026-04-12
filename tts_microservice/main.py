"""
MathForge TTS Microservice — production-ready main.py

All three languages use Microsoft Edge TTS (Neural voices):
  kg  →  ky-KG-NazgulNeural / ky-KG-ManasNeural
  ru  →  ru-RU-SvetlanaNeural / ru-RU-DmitryNeural
  en  →  en-US-JennyNeural / en-US-GuyNeural

Returns MP3 bytes (audio/mpeg).
The frontend Web Audio API decodes MP3 natively — no ffmpeg needed.

Railway deployment
──────────────────
Railway injects $PORT automatically.  This service reads that env var.
Set TTS_CORS_ORIGINS to your Vercel production domain in Railway variables.

Environment variables
──────────────────────
PORT             Railway-injected port (required)
TTS_PORT         Fallback port if PORT is not set (default: 8001)
TTS_CORS_ORIGINS Comma-separated allowed origins (default: *)
TTS_LOG_LEVEL    Logging level (default: info)
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional

import base64

import uvicorn
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.getenv("TTS_LOG_LEVEL", "info").upper(),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("tts")

# ── Port (Railway sets $PORT; local dev uses TTS_PORT) ────────────────────────

PORT = int(os.getenv("PORT", os.getenv("TTS_PORT", "8001")))

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow * by default — TTS is a public read-only service.
# Set TTS_CORS_ORIGINS in Railway if you want to restrict access.

_raw_origins = os.getenv("TTS_CORS_ORIGINS", "*").strip()
if _raw_origins == "*":
    CORS_ORIGINS   = ["*", "https://mathforge.vercel.app"]
    CORS_CREDS     = False     # credentials not supported with wildcard
else:
    CORS_ORIGINS   = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    CORS_CREDS     = True

# ── Schemas ───────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2_000)
    language: Literal["kg", "ru", "en"] = "ru"
    voice_type: Literal["male", "female"] = "female"

    @field_validator("text")
    @classmethod
    def strip_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text must not be blank.")
        return v


class WordBoundary(BaseModel):
    word:        str
    offset_ms:   int
    duration_ms: int


class TTSTimedResponse(BaseModel):
    audio_base64:    str
    duration_ms:     int
    word_boundaries: list[WordBoundary]
    language:        str
    voice_type:      str


# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TTS microservice started on port %d", PORT)
    logger.info("CORS origins: %s", CORS_ORIGINS)
    yield
    logger.info("TTS microservice stopped.")


app = FastAPI(
    title="MathForge TTS",
    description="Edge TTS for Kyrgyz, Russian, English.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_CREDS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-TTS-Language", "X-TTS-Voice", "Content-Disposition"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Railway health-check probe."""
    return {"status": "ok", "service": "mathforge-tts", "version": "2.0.0"}


@app.get("/api/tts/voices", tags=["tts"])
async def list_voices() -> list[dict]:
    """All available voices per language."""
    return [
        {"language": "kg", "voice_type": "female", "voice": "ky-KG-NazgulNeural"},
        {"language": "kg", "voice_type": "male",   "voice": "ky-KG-ManasNeural"},
        {"language": "ru", "voice_type": "female", "voice": "ru-RU-SvetlanaNeural"},
        {"language": "ru", "voice_type": "male",   "voice": "ru-RU-DmitryNeural"},
        {"language": "en", "voice_type": "female", "voice": "en-US-JennyNeural"},
        {"language": "en", "voice_type": "male",   "voice": "en-US-GuyNeural"},
    ]


@app.post("/api/tts/generate", tags=["tts"])
async def generate_speech(req: TTSRequest) -> Response:
    """
    Generate speech and return MP3 audio.

    The response is audio/mpeg.
    The browser Web Audio API decodes MP3 natively — no ffmpeg required.
    """
    logger.info("TTS | lang=%s voice=%s len=%d", req.language, req.voice_type, len(req.text))

    try:
        mp3_bytes = await _dispatch(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS engine error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TTS engine error: {exc}",
        )

    filename = f"tts_{req.language}_{req.voice_type}.mp3"

    return Response(
        content=mp3_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-TTS-Language": req.language,
            "X-TTS-Voice": req.voice_type,
            # Tell browsers / CDNs not to cache audio (it contains generated content)
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/tts/generate-with-timing", response_model=TTSTimedResponse, tags=["tts"])
async def generate_speech_with_timing(req: TTSRequest) -> TTSTimedResponse:
    """
    Generate speech and return base64-encoded MP3 **plus** word-boundary timing.

    Word boundaries are sourced directly from Edge TTS — no extra processing.
    Offsets are in milliseconds (Edge TTS reports in 100-nanosecond ticks).

    Use this endpoint to drive precise lip-sync in the 3-D avatar:
    schedule mouth-open/close events per word instead of relying on volume.
    """
    logger.info(
        "TTS-timed | lang=%s voice=%s len=%d",
        req.language, req.voice_type, len(req.text),
    )

    try:
        audio_bytes, boundaries = await _dispatch_timed(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS timed engine error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TTS engine error: {exc}",
        )

    duration_ms = boundaries[-1].offset_ms + boundaries[-1].duration_ms if boundaries else 0

    return TTSTimedResponse(
        audio_base64    = base64.b64encode(audio_bytes).decode(),
        duration_ms     = duration_ms,
        word_boundaries = boundaries,
        language        = req.language,
        voice_type      = req.voice_type,
    )


async def _dispatch_timed(req: TTSRequest) -> tuple[bytes, list[WordBoundary]]:
    if req.language == "kg":
        from engines.kyrgyz import synthesize_with_timing
    elif req.language == "ru":
        from engines.russian import synthesize_with_timing
    elif req.language == "en":
        from engines.english import synthesize_with_timing
    else:
        raise ValueError(f"Unsupported language: {req.language}")
    return await synthesize_with_timing(req.text, req.voice_type)


async def _dispatch(req: TTSRequest) -> bytes:
    if req.language == "kg":
        from engines.kyrgyz import synthesize
        return await synthesize(req.text, req.voice_type)
    elif req.language == "ru":
        from engines.russian import synthesize
        return await synthesize(req.text, req.voice_type)
    elif req.language == "en":
        from engines.english import synthesize
        return await synthesize(req.text, req.voice_type)
    else:
        raise ValueError(f"Unsupported language: {req.language}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_level=os.getenv("TTS_LOG_LEVEL", "info").lower(),
    )
