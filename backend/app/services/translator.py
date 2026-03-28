"""
Auto-translation utility using Groq Llama-3.

Key design decisions:
  - LaTeX expressions ($...$, $$...$$, \[...\], \(...\)) and template
    variables ({expr}, {{n}}) are REPLACED with numbered __TOKEN_N__ placeholders
    before the Groq call, then RESTORED in the response.  This is far more
    reliable than prompting the model to "leave them alone" — even small LLMs
    occasionally paraphrase math expressions inside instructions.

  - response_format={"type": "json_object"} guarantees the model returns
    parseable JSON even for short strings, removing the need for markdown-
    stripping fallbacks.

  - source_lang text is always passed through unchanged so callers can
    unconditionally overwrite all three JSONB language keys with the result.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

_GROQ_MODEL = "llama-3.3-70b-versatile"

# Ordered from most specific to least — ensures $$ is tried before $
_PROTECTED_PATTERNS: list[str] = [
    r"\$\$[\s\S]+?\$\$",          # display math  $$...$$
    r"\$[^\$\n]+?\$",             # inline math   $...$
    r"\\\[[\s\S]+?\\\]",          # display math  \[...\]
    r"\\\([\s\S]+?\\\)",          # inline math   \(...\)
    r"\{\{[^}]+\}\}",             # i18n vars     {{name}}, {{count}}
    r"\{[a-zA-Z_]\w*\}",          # template vars {expr}, {formula}
]

_COMBINED_RE = re.compile(
    "|".join(f"(?:{p})" for p in _PROTECTED_PATTERNS),
    flags=re.DOTALL,
)

# Languages the platform supports
_ALL_LANGS = ("en", "ru", "kg")

# ── Public API ────────────────────────────────────────────────────────────────

async def auto_translate_content(
    original_text: str,
    source_lang: str = "ru",
) -> dict[str, str]:
    """
    Translate `original_text` into all three platform languages.

    LaTeX and template variables are protected from modification.

    Args:
        original_text: The source string to translate.
        source_lang:   Language code of the source ("en", "ru", or "kg").

    Returns:
        {"en": "...", "ru": "...", "kg": "..."}
        The source language value is always the original, unmodified text.

    Raises:
        RuntimeError: If the Groq API call fails (bad key, network, etc.)
    """
    if not original_text.strip():
        return {lang: original_text for lang in _ALL_LANGS}

    tokenized, token_map = _tokenize(original_text)
    target_langs = [lang for lang in _ALL_LANGS if lang != source_lang]

    raw = await _call_groq(tokenized, source_lang, target_langs)

    result: dict[str, str] = {source_lang: original_text}  # always keep original
    for lang in target_langs:
        translated = raw.get(lang, original_text)
        result[lang] = _restore(translated, token_map)

    # Guarantee all keys exist
    for lang in _ALL_LANGS:
        result.setdefault(lang, original_text)

    return result


async def auto_translate_dict(
    texts: dict[str, str],
    prefer_source: str = "ru",
) -> dict[str, str]:
    """
    Ensure a ``{"en": ..., "ru": ..., "kg": ...}`` dict is fully populated.

    Picks the best available source language, fills any missing/empty values.
    Returns the dict with all three keys present.
    """
    # Pick the best source: prefer_source → any non-empty value
    source_lang = prefer_source
    source_text = texts.get(prefer_source, "").strip()

    if not source_text:
        for lang in _ALL_LANGS:
            if texts.get(lang, "").strip():
                source_lang = lang
                source_text = texts[lang].strip()
                break

    if not source_text:
        return {lang: "" for lang in _ALL_LANGS}

    translated = await auto_translate_content(source_text, source_lang=source_lang)

    # Don't overwrite keys that already have good values
    result = dict(translated)
    for lang in _ALL_LANGS:
        existing = texts.get(lang, "").strip()
        if existing:
            result[lang] = existing  # preserve human / RAG translation if present

    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

def _tokenize(text: str) -> tuple[str, dict[str, str]]:
    """
    Replace protected expressions with __TOKEN_N__ placeholders.
    Returns (tokenized_text, {token: original}).
    """
    token_map: dict[str, str] = {}
    counter = 0

    def replace(match: re.Match) -> str:
        nonlocal counter
        token = f"__TOKEN_{counter}__"
        token_map[token] = match.group(0)
        counter += 1
        return token

    tokenized = _COMBINED_RE.sub(replace, text)
    return tokenized, token_map


def _restore(text: str, token_map: dict[str, str]) -> str:
    """Swap __TOKEN_N__ placeholders back to their original expressions."""
    for token, original in token_map.items():
        text = text.replace(token, original)
    return text


_LANG_NAMES = {"en": "English", "ru": "Russian", "kg": "Kyrgyz"}


async def _call_groq(
    text: str,
    source_lang: str,
    target_langs: list[str],
) -> dict[str, str]:
    """
    Call Groq in JSON-mode and return {lang_code: translated_text, ...}.
    Protected __TOKEN_N__ placeholders must be preserved verbatim.
    """
    try:
        from groq import AsyncGroq
    except ImportError as exc:
        raise RuntimeError("groq SDK not installed. Run: pip install groq") from exc

    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not set in backend/.env")

    source_name = _LANG_NAMES.get(source_lang, source_lang)
    target_desc = " and ".join(_LANG_NAMES.get(l, l) for l in target_langs)
    target_keys = ", ".join(f'"{l}"' for l in target_langs)

    system_prompt = f"""You are a professional educational translator for a university math platform.

Translate the given text from {source_name} into {target_desc}.

CRITICAL RULES — violation breaks the application:
1. Return ONLY a JSON object with keys {target_keys}.
2. Preserve __TOKEN_N__ placeholders EXACTLY as written — they contain LaTeX or template variables.
3. Do NOT translate proper nouns: MathForge, SymPy, Groq, LaTeX, PDF, GitHub, Google.
4. Keep the same tone and register as the source text.
5. No markdown, no explanations — raw JSON only."""

    client = AsyncGroq(api_key=settings.groq_api_key)

    try:
        response = await client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise RuntimeError(f"Groq translation API call failed: {exc}") from exc

    raw = response.choices[0].message.content.strip()

    try:
        parsed: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Groq returned invalid JSON during translation. Raw: {raw[:200]}"
        ) from exc

    return {lang: str(parsed.get(lang, text)) for lang in target_langs}
