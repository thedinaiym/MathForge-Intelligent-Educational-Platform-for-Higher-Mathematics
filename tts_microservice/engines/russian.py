"""
Russian TTS — Microsoft Edge TTS (ru-RU Neural voices).

Voices available:
  Female: ru-RU-SvetlanaNeural
  Male:   ru-RU-DmitryNeural

High-quality Neural voices with natural prosody.
Returns MP3 bytes — Web Audio API decodes natively, no ffmpeg needed.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_VOICES: dict[str, str] = {
    "female": "ru-RU-SvetlanaNeural",
    "male":   "ru-RU-DmitryNeural",
}


async def synthesize(text: str, voice_type: str = "female") -> bytes:
    """Return MP3 bytes of Russian speech."""
    import edge_tts

    voice = _VOICES.get(voice_type, _VOICES["female"])
    logger.info("Russian TTS: voice=%s len=%d", voice, len(text))

    communicate = edge_tts.Communicate(text=text, voice=voice)

    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    if not chunks:
        raise RuntimeError(
            "Edge TTS returned no audio for Russian. "
            "Check internet access and text content."
        )

    return b"".join(chunks)


async def synthesize_with_timing(
    text: str, voice_type: str = "female"
) -> tuple[bytes, list[dict]]:
    """Return (MP3 bytes, word_boundaries) for Russian speech."""
    import edge_tts

    voice = _VOICES.get(voice_type, _VOICES["female"])
    logger.info("Russian TTS-timed: voice=%s len=%d", voice, len(text))

    communicate = edge_tts.Communicate(text=text, voice=voice)

    audio_chunks: list[bytes] = []
    boundaries:   list[dict]  = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append({
                "word":        chunk.get("text", ""),
                "offset_ms":   chunk.get("offset", 0) // 10_000,
                "duration_ms": chunk.get("duration", 0) // 10_000,
            })

    if not audio_chunks:
        raise RuntimeError(
            "Edge TTS returned no audio for Russian. "
            "Check internet access and text content."
        )

    return b"".join(audio_chunks), boundaries
