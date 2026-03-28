"""
PDF maker — compiles LaTeX worksheets via pdflatex.

Requires pdflatex in PATH:
  Windows : install MiKTeX  https://miktex.org/
  Linux   : apt-get install texlive-latex-base texlive-fonts-recommended
  Docker  : TeX Live is installed in the project Dockerfile

Pipeline:
  1. Render base_exam.tex Jinja2 template with the generated tasks.
  2. Write the rendered source to a secure temp directory.
  3. Run pdflatex once (no cross-references, so one pass is enough).
  4. Read the resulting PDF bytes and return them.
  5. The TemporaryDirectory context manager deletes all aux/log/tex files.

All blocking I/O runs in a thread-pool executor — never blocks the async loop.
"""
from __future__ import annotations

import asyncio
import subprocess
import tempfile
from pathlib import Path

import jinja2

# ── Jinja2 environment ────────────────────────────────────────────────────────

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "tex"

_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=False,   # content is LaTeX, not HTML — no escaping wanted
    trim_blocks=True,   # strip the newline after a block tag
    lstrip_blocks=True, # strip leading whitespace before a block tag
)


# ── Synchronous compilation (runs in thread pool) ─────────────────────────────

def _compile_sync(latex_source: str) -> bytes:
    """
    Write *latex_source* to a temp .tex file, run pdflatex, and return the
    resulting PDF bytes.

    All temp files (worksheet.tex, worksheet.aux, worksheet.log) are deleted
    automatically when the TemporaryDirectory context exits.

    Raises:
        RuntimeError — pdflatex not found, timed out, or returned a non-zero
                       exit code.  The message always includes the LaTeX log
                       tail so developers can diagnose template issues.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        tex_file = tmppath / "worksheet.tex"
        pdf_file = tmppath / "worksheet.pdf"

        tex_file.write_text(latex_source, encoding="utf-8")

        try:
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    str(tex_file),
                ],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=120,  # MiKTeX may download packages on first run
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "pdflatex not found. "
                "Windows: install MiKTeX from https://miktex.org/ and restart. "
                "Linux: sudo apt-get install texlive-latex-base texlive-fonts-recommended"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                "pdflatex timed out after 120 s. "
                "On the first MiKTeX run, package downloads can be slow — please retry."
            ) from exc

        if result.returncode != 0 or not pdf_file.exists():
            log_file = tmppath / "worksheet.log"
            if log_file.exists():
                log_tail = log_file.read_text(encoding="utf-8", errors="replace")[-3000:]
            else:
                log_tail = (result.stdout or result.stderr or "(no log output)")[-3000:]

            raise RuntimeError(
                f"pdflatex failed (exit {result.returncode}).\n"
                f"{'─' * 40}\n"
                f"{log_tail}"
            )

        return pdf_file.read_bytes()


# ── Public async API ──────────────────────────────────────────────────────────

async def compile_latex_to_pdf(
    title: str,
    variants_tasks: list[list[dict]],
) -> bytes:
    """
    Render and compile a multi-variant worksheet with solutions appendix to PDF.

    Args:
        title:          Worksheet title (localised, e.g. "Calculus — Medium").
        variants_tasks: One list per variant; each inner dict has keys:
                          question_text   — localised prompt
                          condition_latex — SymPy-generated LaTeX equation
                          answer_latex    — SymPy-generated LaTeX answer

    Returns:
        Raw PDF bytes ready to be sent as an HTTP response.

    Raises:
        RuntimeError: If pdflatex is missing, times out, or fails to compile.
    """
    variants = []
    solutions = []   # one entry per variant: list of {condition, answer}

    for v_idx, tasks in enumerate(variants_tasks, start=1):
        task_entries = [
            {
                "title": t.get("question_text", ""),
                "condition_latex": t.get("condition_latex", ""),
            }
            for t in tasks
        ]
        variants.append({"variant_num": v_idx, "tasks": task_entries})

        solutions.append({
            "variant_num": v_idx,
            "answers": [
                {
                    "condition_latex": t.get("condition_latex", ""),
                    "answer_latex": t.get("answer_latex", r"\text{—}"),
                }
                for t in tasks
            ],
        })

    context = {
        "title": title,
        "variants": variants,
        "solutions": solutions,
    }

    template = _jinja_env.get_template("base_exam.tex")
    latex_source = template.render(**context)

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _compile_sync, latex_source)
