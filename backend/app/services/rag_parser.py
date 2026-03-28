"""
RAG PDF parser — Phase 17 implementation.

Pipeline:
  1. pypdf  — extract raw text from first N pages of the uploaded PDF
  2. Groq Llama-3 — strict JSON-mode prompt extracts template_json objects
  3. SymPy validation — filter out templates whose sympy_expr crashes the engine
  4. Returns validated list of template dicts ready for DB insertion

Improvements over Phase 6:
  - Reads up to 10 pages (was 5)
  - Extracts up to 8 templates (was 3)
  - Sends up to 8 000 chars to Groq (was 5 000)
  - Post-validates sympy_expr with SymPy before saving drafts
  - Richer examples in the system prompt for better extraction quality
"""
from __future__ import annotations

import io
import json
import re
from typing import Any

from app.core.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

_MAX_PAGES  = 10       # pages to read
_MAX_CHARS  = 8_000    # chars sent to Groq; well under Llama-3 context limit
_MAX_TMPLS  = 8        # templates to request from LLM
_GROQ_MODEL = "llama-3.3-70b-versatile"

_SCHEMA = """
{
  "templates": [
    {
      "topic": "snake_case_topic_name",
      "difficulty": "easy" | "medium" | "hard",
      "sympy_expr": "SymPy expression string (MUST use UPPERCASE vars)",
      "ranges": {"A": [1, 9], "B": [-10, 10]},
      "constraints": ["B**2 - 4*A*C >= 0"],
      "texts": {
        "en": "Problem statement in English. Use $expr$ for the expression.",
        "ru": "Условие задачи на русском. Используйте $expr$ для выражения.",
        "kg": "Кыргызча шарт. $expr$ колдонуңуз."
      }
    }
  ]
}
"""

_EXAMPLES = """
GOOD EXAMPLES:

Example 1 — quadratic equation:
{
  "topic": "quadratic_equation",
  "difficulty": "medium",
  "sympy_expr": "A*x**2 + B*x + C",
  "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-15, 15]},
  "constraints": ["B**2 - 4*A*C >= 0"],
  "texts": {
    "en": "Solve: ${A}x^2 + {B}x + {C} = 0$",
    "ru": "Решите уравнение: ${A}x^2 + {B}x + {C} = 0$",
    "kg": "Теңдемени чечиңиз: ${A}x^2 + {B}x + {C} = 0$"
  }
}

Example 2 — 2×2 determinant:
{
  "topic": "determinant_2x2",
  "difficulty": "easy",
  "sympy_expr": "A*D - B*C",
  "ranges": {"A": [-5,5], "B": [-5,5], "C": [-5,5], "D": [-5,5]},
  "constraints": [],
  "texts": {
    "en": "Compute det([[{A},{B}],[{C},{D}]])",
    "ru": "Вычислите det([[{A},{B}],[{C},{D}]])",
    "kg": "det([[{A},{B}],[{C},{D}]]) эсептеңиз"
  }
}

Example 3 — definite integral:
{
  "topic": "definite_integral",
  "difficulty": "medium",
  "sympy_expr": "A * B**(N+1) / (N+1)",
  "ranges": {"A": [1, 4], "B": [1, 4], "N": [2, 4]},
  "constraints": [],
  "texts": {
    "en": "Compute $\\\\int_0^{{{B}}} {A}x^{N}\\\\, dx$",
    "ru": "Вычислите $\\\\int_0^{{{B}}} {A}x^{N}\\\\, dx$",
    "kg": "$\\\\int_0^{{{B}}} {A}x^{N}\\\\, dx$ эсептеңиз"
  }
}
"""

_SYSTEM_PROMPT = f"""You are a precise mathematical template extractor for MathForge — \
an AI-powered math education platform.

Your task: read a university-level math textbook excerpt and extract up to {_MAX_TMPLS} \
parameterised problem templates that can be used to generate unlimited unique exercises.

Output ONLY a valid JSON object — no markdown, no code fences, no commentary.
The JSON must exactly match this schema:
{_SCHEMA}

{_EXAMPLES}

CRITICAL RULES (violation breaks the application):
1. Output ONLY the raw JSON object. Nothing before it, nothing after it.
2. Extract at most {_MAX_TMPLS} templates. Quality over quantity.
3. Use UPPERCASE single letters for parameterised variables (A, B, C, D, N, R).
4. sympy_expr uses Python/SymPy syntax: x**2 for x², A*x for Ax, etc.
5. ranges: integer pairs [min, max] with min < max. Keep ranges realistic.
6. constraints: SymPy-parseable boolean strings. Use [] if none needed.
7. texts must contain all three keys: "en", "ru", "kg".
8. In texts, use {{A}}, {{B}} etc. for coefficient placeholders (Python .format() syntax).
9. DO NOT use Unicode math chars (∫, ², ³, ₀) — use LaTeX ($\\\\int$, $x^2$) instead.
10. If no clear parameterised math problem exists in the text, return {{"templates": []}}.
11. Never invent math that is not present in the text.
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
        ValueError: If the PDF cannot be read or text is empty.
        RuntimeError: If the Groq API call fails.
    """
    text = _extract_pdf_text(pdf_bytes)
    if not text.strip():
        raise ValueError(
            "No readable text found in this PDF. "
            "Please upload a text-based PDF, not a scanned image."
        )
    raw = await _call_groq(text[:_MAX_CHARS])
    return _sympy_validate(raw)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract plain text from the first _MAX_PAGES pages using pypdf."""
    try:
        import pypdf
    except ImportError as exc:
        raise RuntimeError("pypdf is not installed. Run: pip install 'pypdf>=4.0.0'") from exc

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
            continue
    return "\n".join(parts)


async def _call_groq(text: str) -> list[dict[str, Any]]:
    """Send text to Groq Llama-3 in JSON-mode and return validated templates."""
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
                    "content": (
                        "Extract math templates from this textbook excerpt "
                        f"(return up to {_MAX_TMPLS} templates):\n\n" + text
                    ),
                },
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise RuntimeError(f"Groq API call failed: {exc}") from exc

    raw = response.choices[0].message.content.strip()
    return _parse_and_validate(raw)


def _parse_and_validate(raw: str) -> list[dict[str, Any]]:
    """Parse Groq JSON response and filter to structurally valid templates."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if not match:
            raise ValueError(f"LLM did not return valid JSON. First 300 chars: {raw[:300]}")
        parsed = json.loads(match.group(1))

    templates = parsed.get("templates", [])
    if isinstance(templates, dict):
        templates = [templates]

    required = {"topic", "sympy_expr", "ranges", "texts"}
    valid: list[dict[str, Any]] = []
    for tpl in templates:
        if not isinstance(tpl, dict) or not required.issubset(tpl.keys()):
            continue
        tpl.setdefault("constraints", [])
        tpl.setdefault("difficulty", "medium")
        if tpl["difficulty"] not in {"easy", "medium", "hard"}:
            tpl["difficulty"] = "medium"
        # Ensure all three language keys exist in texts
        texts = tpl.get("texts", {})
        if not isinstance(texts, dict):
            texts = {}
        base = texts.get("ru") or texts.get("en") or ""
        texts.setdefault("en", base)
        texts.setdefault("ru", base)
        texts.setdefault("kg", base)
        tpl["texts"] = texts
        valid.append(tpl)

    return valid[:_MAX_TMPLS]


def _sympy_validate(templates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Run each template through the TaskGenerator to verify sympy_expr is valid.
    Invalid templates are silently dropped so one bad LLM output doesn't kill all results.
    """
    try:
        import sympy as sp
    except ImportError:
        return templates  # sympy not available — skip validation

    good: list[dict[str, Any]] = []
    for tpl in templates:
        expr_str: str = tpl.get("sympy_expr", "")
        ranges: dict = tpl.get("ranges", {})
        try:
            expr = sp.sympify(expr_str)
            # Do a quick substitution with midpoint values to check it evaluates
            subs = {sp.Symbol(k): (lo + hi) // 2 for k, (lo, hi) in ranges.items()}
            result = expr.subs(subs)
            # Ensure result is numeric or symbolic — not an exception
            _ = sp.simplify(result)
            good.append(tpl)
        except Exception:
            continue  # drop malformed template silently
    return good
