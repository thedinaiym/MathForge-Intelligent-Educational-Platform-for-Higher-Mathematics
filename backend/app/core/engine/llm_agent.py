"""
LLM Hint Generator — Phase 3 / 5 implementation.

Uses Groq (Llama-3) ONLY for natural language hints.

CRITICAL:
  - Groq MUST NOT solve equations.  All math validation → SymPy (Arbitrator).
  - The system prompt deliberately gives Groq the step strings, NOT the
    symbolic residual.  Groq explains the *rule* broken; it never computes.
"""
from __future__ import annotations

from groq import AsyncGroq

from app.core.config import settings

_LOCALE_NAMES: dict[str, str] = {
    "en": "English",
    "ru": "Russian",
    "kg": "Kyrgyz",
}

_SYSTEM_PROMPT_TEMPLATE = (
    "You are an empathetic math tutor. "
    "The student made a mistake transitioning from '{step_before}' to '{step_with_error}'. "
    "Explain the specific algebraic rule they broke in {language} language. "
    "Keep it encouraging. "
    "Output ONLY plain text — no formulas, no LaTeX, no URLs, no links, no external references. "
    "Do not solve the rest of the equation. "
    "Do not mention any websites or resources."
)


class LLMHintAgent:
    """
    Generates pedagogical hints using Groq Llama-3.
    Never computes math — only explains rules in natural language.
    """

    @staticmethod
    async def generate_hint(
        step_before: str,
        step_with_error: str,
        user_locale: str = "ru",
    ) -> str:
        """
        Generate an encouraging, rule-focused hint for a student error.

        Args:
            step_before:      The last mathematically valid step (as a string).
            step_with_error:  The step that introduced the error.
            user_locale:      Locale code ('en', 'ru', 'kg').

        Returns:
            Natural language hint string in the requested locale.

        Raises:
            ValueError: If GROQ_API_KEY is not configured.
            groq.APIError: On upstream Groq API failure.
        """
        if not settings.groq_api_key:
            raise ValueError(
                "GROQ_API_KEY is not set. Cannot generate hint without a valid API key."
            )

        language = _LOCALE_NAMES.get(user_locale, "English")
        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
            step_before=step_before,
            step_with_error=step_with_error,
            language=language,
        )

        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please explain the error."},
            ],
            max_tokens=256,
            temperature=0.6,
        )

        return response.choices[0].message.content.strip()
