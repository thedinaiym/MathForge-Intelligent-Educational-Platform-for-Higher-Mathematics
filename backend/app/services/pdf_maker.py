"""
PDF maker — compiles LaTeX worksheets via pdflatex.
Phase 3 implementation placeholder.

IMPORTANT: Requires pdflatex (MiKTeX or TeX Live) installed on the server.
Handle subprocess errors gracefully — return 500 with diagnostic message.
"""
from app.core.config import settings


async def compile_latex_to_pdf(
    title: str,
    tasks: list[dict],
) -> bytes:
    """
    Compile a LaTeX worksheet document and return the raw PDF bytes.

    Args:
        title: Worksheet title (already localised).
        tasks: List of dicts with keys: condition_latex, answer_latex.

    Returns:
        Raw PDF bytes.

    Raises:
        RuntimeError: If pdflatex is not found or compilation fails.
    """
    # Phase 3: implement full LaTeX generation here
    # 1. Render Jinja2 template with tasks
    # 2. Write to temp .tex file
    # 3. Run pdflatex subprocess
    # 4. Read and return resulting .pdf bytes
    raise NotImplementedError("PDF compilation is implemented in Phase 3")
