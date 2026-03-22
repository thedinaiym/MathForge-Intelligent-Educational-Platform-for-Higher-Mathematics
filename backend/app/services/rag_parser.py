"""
RAG PDF parser — Phase 5 implementation placeholder.
Extracts task templates from teacher-uploaded textbook PDFs using LangChain + Groq.
"""
from app.core.config import settings


async def extract_template_from_pdf_text(pdf_text: str) -> dict:
    """
    Parse raw PDF text into a structured template_json using Groq Llama-3.

    The LLM is prompted to output JSON only — matching the template_json schema.
    Regex extraction handles cases where the model wraps JSON in markdown code blocks.

    Args:
        pdf_text: Raw text extracted from a teacher's textbook PDF.

    Returns:
        Parsed template_json dict ready for insertion into task_templates table.

    Raises:
        ValueError: If a valid JSON template cannot be extracted.
    """
    # Phase 5 implementation:
    # from groq import Groq
    # client = Groq(api_key=settings.groq_api_key)
    # prompt = f"""
    # Extract a MathForge task template from the following textbook excerpt.
    # Output ONLY valid JSON matching this schema:
    # {{
    #   "topic": "string",
    #   "sympy_expr": "string",
    #   "ranges": {{"VAR": [min, max]}},
    #   "constraints": ["sympy_expression"],
    #   "texts": {{"en": "...", "ru": "...", "kg": "..."}}
    # }}
    #
    # Textbook excerpt:
    # {pdf_text[:3000]}
    # """
    # ...
    raise NotImplementedError("RAG PDF parsing is implemented in Phase 5")
