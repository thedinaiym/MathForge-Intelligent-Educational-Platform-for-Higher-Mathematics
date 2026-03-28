"""
RAG PDF parser — Phase 6 clean implementation.

Pipeline:
  1. pypdf  — extract raw text from the first N pages of the uploaded PDF
  2. Groq Llama-3 — strict JSON-mode prompt extracts template_json objects
  3. Returns a validated list of template dicts ready for DB insertion

Note on LangChain's PyPDFLoader: it only accepts file-path strings, not
in-memory bytes.  We use pypdf directly so the caller never needs to write
a temp file.  The Groq call uses the same model as the rest of the app
(llama-3.3-70b-versatile).
"""
from __future__ import annotations

import io
import json
import re
from typing import Any

from app.core.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

_MAX_PAGES = 5       # pages to read; keeps token usage reasonable
_MAX_CHARS = 5_000   # chars sent to Groq; well under Llama-3 context limit
_GROQ_MODEL = "llama-3.3-70b-versatile"

_SCHEMA = """
{
  "templates": [
    {
      "topic": "snake_case_topic_name",
      "difficulty": "easy" | "medium" | "hard",
      "sympy_expr": "SymPy expression string (e.g. A*x**2 + B*x + C)",
      "ranges": {"UPPERCASE_VAR": [min_int, max_int]},
      "constraints": ["SymPy boolean string (e.g. B**2 - 4*A*C >= 0)"],
      "texts": {
        "en": "English problem statement with {expr} placeholder",
        "ru": "Russian problem statement with {expr} placeholder",
        "kg": "Kyrgyz problem statement with {expr} placeholder"
      }
    }
  ]
}
"""

_SYSTEM_PROMPT = f"""You are a strict mathematical template extractor for the MathForge \
neuro-symbolic education platform.

Your task: read a university-level math textbook excerpt and extract up to 3 \
parameterised problem templates.

Output ONLY a valid JSON object — no markdown, no code fences, no commentary. \
The JSON must exactly match this schema:
{_SCHEMA}

CRITICAL RULES:
1. Output ONLY the JSON object. Nothing before it, nothing after it.
2. Extract at most 3 templates. Quality over quantity.
3. Use UPPERCASE letters for parameterised variables in sympy_expr (A, B, C …).
4. Use Python/SymPy syntax: ** for powers, * for multiplication, Eq() for equations.
5. ranges values must be integer pairs [min, max] with min < max.
6. constraints is a list of SymPy-parseable boolean strings. Use [] if none needed.
7. texts must contain all three keys: "en", "ru", "kg".
8. If no clear math problem pattern is present, return {{"templates": []}}.
9. Never hallucinate math that is not in the text.
"""


# ── Public API ────────────────────────────────────────────────────────────────

async def extract_templates_from_pdf_bytes(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """
    Full RAG pipeline: PDF bytes → validated list of template_json dicts.

    Args:
        pdf_bytes: Raw bytes of an uploaded PDF file.

    Returns:
        List of template dicts (may be empty if no templates found).

    Raises:
        ValueError: If the PDF cannot be read or Groq returns invalid JSON.
        RuntimeError: If the Groq API call fails (network / key issues).
    """
    text = _extract_pdf_text(pdf_bytes)
    if not text.strip():
        raise ValueError(
            "No readable text found in this PDF. "
            "Please upload a text-based PDF, not a scanned image."
        )
    return await _call_groq(text[:_MAX_CHARS])


# ── Internal helpers ──────────────────────────────────────────────────────────

def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """
    Extract plain text from the first _MAX_PAGES pages using pypdf.
    Unreadable pages are skipped silently so one bad page never aborts.
    """
    try:
        import pypdf  # lazy import — only needed for this endpoint
    except ImportError as exc:
        raise RuntimeError(
            "pypdf is not installed. Run: pip install 'pypdf>=4.0.0'"
        ) from exc

    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError(f"Could not parse PDF structure: {exc}") from exc

    parts: list[str] = []
    for page in reader.pages[:_MAX_PAGES]:
        try:
            txt = page.extract_text()
            if txt:
                parts.append(txt)
        except Exception:
            continue  # skip unreadable page
    return "\n".join(parts)


async def _call_groq(text: str) -> list[dict[str, Any]]:
    """
    Send text to Groq Llama-3 in JSON-mode and return validated templates.
    Uses AsyncGroq so the FastAPI event loop is never blocked.
    """
    try:
        from groq import AsyncGroq
    except ImportError as exc:
        raise RuntimeError("groq SDK not installed. Run: pip install groq") from exc

    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not set. Add it to backend/.env.")

    client = AsyncGroq(api_key=settings.groq_api_key)

    try:
        response = await client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": "Extract math templates from this textbook excerpt:\n\n" + text,
                },
            ],
            temperature=0.1,
            response_format={"type": "json_object"},  # guarantees valid JSON
        )
    except Exception as exc:
        raise RuntimeError(f"Groq API call failed: {exc}") from exc

    raw = response.choices[0].message.content.strip()
    return _parse_and_validate(raw)


def _parse_and_validate(raw: str) -> list[dict[str, Any]]:
    """
    Parse Groq's JSON response and filter to structurally valid templates.
    Falls back to regex extraction if the model wraps output in code fences.
    """
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: strip markdown code fences and retry
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if not match:
            raise ValueError(
                f"LLM did not return valid JSON. First 300 chars: {raw[:300]}"
            )
        parsed = json.loads(match.group(1))

    templates = parsed.get("templates", [])
    if isinstance(templates, dict):
        templates = [templates]  # model returned object instead of list

    required = {"topic", "sympy_expr", "ranges", "texts"}
    valid: list[dict[str, Any]] = []
    for tpl in templates:
        if not isinstance(tpl, dict) or not required.issubset(tpl.keys()):
            continue
        tpl.setdefault("constraints", [])
        tpl.setdefault("difficulty", "medium")
        if tpl["difficulty"] not in {"easy", "medium", "hard"}:
            tpl["difficulty"] = "medium"
        valid.append(tpl)

    return valid
