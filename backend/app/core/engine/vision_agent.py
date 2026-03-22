"""
Vision OCR Agent — Phase 5 implementation.

Uses Groq's multimodal vision model to extract mathematical solution steps
from a handwritten or printed image.

CRITICAL constraints:
  - The model MUST NOT solve the problem — extraction only.
  - Output is validated as a JSON array before being passed to the Arbitrator.
  - Temperature = 0.0 for deterministic extraction; no creative variation wanted.
  - Fallback parsing handles markdown fences and surrounding prose the model
    may emit despite the strict prompt.
"""
from __future__ import annotations

import base64
import json
import re

from groq import AsyncGroq

from app.core.config import settings

# Groq vision model — https://console.groq.com/docs/vision
_VISION_MODEL = "llama-3.2-90b-vision-preview"

_SYSTEM_PROMPT = (
    "You are an expert Math OCR extractor. "
    "Read the mathematical steps from the provided image. "
    "Output EXACTLY and ONLY a valid JSON array of strings, "
    "where each string is one line of the solution in sequential order. "
    "Do not solve the problem. "
    "Do not add markdown blocks or explanations. "
    "Example output: [\"2x + 4 = 10\", \"2x = 6\", \"x = 3\"]"
)


class VisionAgent:
    """
    Extracts ordered solution steps from a handwritten math image using
    Groq's vision model.
    """

    @staticmethod
    async def extract_steps(
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
    ) -> list[str]:
        """
        Convert an image to a list of mathematical step strings.

        Args:
            image_bytes: Raw image bytes (JPEG or PNG).
            mime_type:   MIME type of the image, e.g. "image/jpeg".

        Returns:
            Ordered list of step strings suitable for the Arbitrator.

        Raises:
            ValueError: If GROQ_API_KEY is unset or the response cannot be
                        parsed as a non-empty JSON array of strings.
        """
        if not settings.groq_api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured. "
                "Set it in backend/.env to enable Vision OCR."
            )

        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64}"

        client = AsyncGroq(api_key=settings.groq_api_key)

        response = await client.chat.completions.create(
            model=_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": _SYSTEM_PROMPT,
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.0,  # deterministic — extraction, not generation
        )

        raw: str = response.choices[0].message.content or ""
        return VisionAgent._parse_steps(raw)

    # ── Internal helpers ───────────────────────────────────────────────────

    @staticmethod
    def _parse_steps(raw: str) -> list[str]:
        """
        Robustly parse the model's raw output into a list of step strings.

        Handles three common deviation patterns from the strict prompt:
          1. Clean JSON array (expected): ``["step1", "step2"]``
          2. JSON inside markdown code fences: ````json\\n[...]\\n````
          3. Extra prose surrounding the array: ``Here are the steps: [...]``
        """
        # ── Strategy 1: direct parse after normalising whitespace ─────────
        try:
            result = json.loads(raw.strip())
            steps = _validate_step_list(result)
            if steps:
                return steps
        except (json.JSONDecodeError, TypeError):
            pass

        # ── Strategy 2: strip markdown code fences then parse ─────────────
        cleaned = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
        try:
            result = json.loads(cleaned)
            steps = _validate_step_list(result)
            if steps:
                return steps
        except (json.JSONDecodeError, TypeError):
            pass

        # ── Strategy 3: extract the first [...] block from the text ───────
        match = re.search(r"\[.*?\]", cleaned, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group())
                steps = _validate_step_list(result)
                if steps:
                    return steps
            except (json.JSONDecodeError, TypeError):
                pass

        raise ValueError(
            "Vision model did not return a parseable JSON array of steps. "
            f"Raw response (first 300 chars): {raw[:300]!r}"
        )


def _validate_step_list(obj: object) -> list[str]:
    """
    Return a cleaned list[str] if obj is a non-empty list, else return [].
    Strips whitespace and filters blank strings.
    """
    if not isinstance(obj, list):
        return []
    return [str(s).strip() for s in obj if str(s).strip()]
