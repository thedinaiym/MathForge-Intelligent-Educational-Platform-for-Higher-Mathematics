"""
Kyrgyz TTS — Microsoft Edge TTS (ky-KG Neural voices).

Voices available:
  Female: ky-KG-NazgulNeural
  Male:   ky-KG-ManasNeural

No model downloads.  Requires internet access from the Railway container
(always available).  Returns MP3 bytes — Web Audio API decodes natively.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_VOICES: dict[str, str] = {
    "female": "ky-KG-NazgulNeural",
    "male":   "ky-KG-ManasNeural",
}


async def synthesize(text: str, voice_type: str = "female") -> bytes:
    """Return MP3 bytes of Kyrgyz speech."""
    import edge_tts

    voice = _VOICES.get(voice_type, _VOICES["female"])
    logger.info("Kyrgyz TTS: voice=%s len=%d", voice, len(text))

    communicate = edge_tts.Communicate(text=text, voice=voice)

    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    if not chunks:
        raise RuntimeError(
            "Edge TTS returned no audio for Kyrgyz. "
            "Check internet access and text content."
        )

    return b"".join(chunks)


async def synthesize_with_timing(
    text: str, voice_type: str = "female"
) -> tuple[bytes, list[dict]]:
    """Return (MP3 bytes, word_boundaries) for Kyrgyz speech."""
    import edge_tts

    voice = _VOICES.get(voice_type, _VOICES["female"])
    logger.info("Kyrgyz TTS-timed: voice=%s len=%d", voice, len(text))

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
            "Edge TTS returned no audio for Kyrgyz. "
            "Check internet access and text content."
        )

    return b"".join(audio_chunks), boundaries
