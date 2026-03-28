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
