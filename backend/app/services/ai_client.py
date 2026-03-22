"""
Groq API client — NLP-only, never solves math.
Phase 5: implement get_hint_from_groq().
"""
from app.core.config import settings


async def get_hint_from_groq(
    error_step: int,
    sympy_correct_step: str,
    locale: str = "ru",
) -> str:
    """
    Ask Groq Llama-3 for a pedagogical hint about a student's error.

    The system prompt explicitly forbids solving equations.
    Only natural-language rule explanations are returned.

    Args:
        error_step: 1-indexed step number where the error occurred.
        sympy_correct_step: SymPy-verified correct transition description.
        locale: Language for the hint ('en', 'ru', 'kg').

    Returns:
        2–3 sentence natural language hint.
    """
    # Phase 5 implementation:
    # from groq import Groq
    # client = Groq(api_key=settings.groq_api_key)
    # response = client.chat.completions.create(
    #     model="llama-3.3-70b-versatile",
    #     messages=[
    #         {
    #             "role": "system",
    #             "content": (
    #                 f"You are an empathetic math tutor. The student made a mistake in step {error_step}. "
    #                 f"The correct mathematical transition is {sympy_correct_step}. "
    #                 f"Explain the rule they broke in {locale} language. "
    #                 "Output text explanation only — no formulas."
    #             ),
    #         },
    #         {"role": "user", "content": "Give me a hint."},
    #     ],
    #     max_tokens=150,
    # )
    # return response.choices[0].message.content
    raise NotImplementedError("Groq hint generation is implemented in Phase 5")
