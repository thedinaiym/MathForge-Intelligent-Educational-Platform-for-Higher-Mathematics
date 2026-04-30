"""
seed_from_books.py

Reads PDFs from КнигиПоМатеше/, extracts math problem templates via
Groq (Llama-3), and inserts them into Supabase TaskTemplate table.

Usage:
    python seed_from_books.py

Env vars required (.env file at repo root or backend/):
    GROQ_API_KEY=gsk_...
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   # service role key (bypasses RLS)

Install deps:
    pip install pdfplumber groq supabase python-dotenv pymupdf pdf2image pytesseract

For scanned PDFs (OCR) you also need:
    - Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki
      (install with Russian + Math language packs)
    - Poppler for Windows: https://github.com/oschwartz10612/poppler-windows/releases
      (unzip and add bin/ to PATH)
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path

import pdfplumber
from dotenv import load_dotenv
from groq import Groq
from supabase import create_client, Client

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────

# Directory containing the PDF books (relative to this script)
PDF_DIR = Path(__file__).parent.parent / "КнигиПоМатеше"

CHUNK_CHARS   = 3_000   # characters sent to LLM per call
SLEEP_BETWEEN = 2.0     # seconds between Groq calls (free-tier rate limit)
MODEL         = "llama-3.3-70b-versatile"

GROQ_API_KEY  = os.environ["GROQ_API_KEY"]
SUPABASE_URL  = os.environ["SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]

# Update these UUIDs to match what's in your categories table.
# Run: SELECT id, name FROM categories; in Supabase to get the real IDs.
CATEGORY_MAP: dict[str, str] = {
    "calculus":       "00000000-0000-0000-0000-000000000001",
    "linear algebra": "00000000-0000-0000-0000-000000000002",
    "ort":            "00000000-0000-0000-0000-000000000003",
    "algebra":        "00000000-0000-0000-0000-000000000001",  # fallback → calculus
    "geometry":       "00000000-0000-0000-0000-000000000002",  # fallback → linear algebra
}

DIFFICULTY_VALUES = {"easy", "medium", "hard"}

# ── Clients ─────────────────────────────────────────────────────────────────

groq_client: Groq   = Groq(api_key=GROQ_API_KEY)
supabase: Client    = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── LLM prompt ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a math curriculum engineer.
Your task: read the provided textbook excerpt and extract parametric math problem templates.

Return ONLY a valid JSON array (no prose, no markdown fences). Each element must have exactly these keys:
{
  "subject": "Calculus" | "Linear Algebra" | "ORT" | "Algebra" | "Geometry",
  "topic": string,           // e.g. "Limits", "Derivatives", "Quadratic Equations"
  "difficulty": "easy" | "medium" | "hard",
  "condition_ru": string,    // Russian problem text, use {A} {B} {C} as parameter placeholders
  "condition_kg": string,    // Kyrgyz translation of condition_ru
  "condition_en": string,    // English translation of condition_ru
  "formula_template": string,// Python/SymPy expression with A, B, C — e.g. "A*x**2 + B*x + C"
  "sympy_solve_code": string,// e.g. "solve(A*x**2 + B*x + C, x)"
  "lean4_verification": null // set to null; Lean 4 is handled separately
}

Rules:
- Use capital letters A, B, C, D, N for numeric parameters. Never embed actual numbers in the template.
- Only extract clearly solvable, well-defined problems.
- If the excerpt contains no extractable math problems, return an empty array [].
- Return ONLY the JSON array — absolutely nothing else.
"""


def extract_templates_from_chunk(chunk: str) -> list[dict]:
    """Send one text chunk to Groq; return list of parsed template dicts."""
    for attempt in range(3):
        try:
            resp = groq_client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": f"Textbook excerpt:\n\n{chunk}"},
                ],
                max_tokens=2048,
                temperature=0.1,
            )
            raw = resp.choices[0].message.content.strip()

            # Strip markdown code fences if the model added them
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1] if len(parts) > 1 else raw
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            parsed = json.loads(raw)
            if not isinstance(parsed, list):
                print("  [warn] LLM returned non-list — skipping chunk")
                return []
            return parsed

        except json.JSONDecodeError as e:
            print(f"  [warn] JSON parse error: {e}")
            return []
        except Exception as e:
            if attempt < 2:
                wait = (attempt + 1) * 10
                print(f"  [retry {attempt+1}/3] connection error — waiting {wait}s ...")
                time.sleep(wait)
            else:
                print(f"  [error] Groq API failed after 3 attempts: {e}")
    return []


def resolve_category(subject: str) -> str | None:
    """Map subject string to category UUID. Returns None if unknown."""
    key = subject.lower().strip()
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    for map_key, cid in CATEGORY_MAP.items():
        if map_key in key or key in map_key:
            return cid
    return None


def build_db_row(tmpl: dict, source_pdf: str) -> dict | None:
    """Validate LLM output and build a task_templates table row dict."""
    category_id = resolve_category(tmpl.get("subject", ""))
    if not category_id:
        print(f"  [skip] Unknown subject: {tmpl.get('subject')!r}")
        return None

    difficulty = tmpl.get("difficulty", "medium").lower()
    if difficulty not in DIFFICULTY_VALUES:
        difficulty = "medium"

    topic     = (tmpl.get("topic") or "unknown").strip()
    cond_ru   = (tmpl.get("condition_ru") or "").strip()
    cond_kg   = (tmpl.get("condition_kg") or cond_ru).strip()
    cond_en   = (tmpl.get("condition_en") or cond_ru).strip()
    formula   = (tmpl.get("formula_template") or "0").strip()
    sympy_code= (tmpl.get("sympy_solve_code") or "").strip()

    if not cond_ru or not formula or formula == "0":
        print(f"  [skip] Missing required fields in: {topic!r}")
        return None

    return {
        "id":         str(uuid.uuid4()),
        "category_id": category_id,
        "difficulty":  difficulty,
        "is_active":   True,
        "title_translations": {
            "ru": f"{topic} (из {source_pdf})",
            "en": f"{topic} (from {source_pdf})",
            "kg": f"{topic} ({source_pdf} китебинен)",
        },
        "template_json": {
            "topic":           topic.lower().replace(" ", "_"),
            "sympy_expr":      formula,
            "equation_rhs":    "0",
            "ranges":          {"A": [1, 10], "B": [-10, 10], "C": [-10, 10], "N": [1, 5]},
            "constraints":     [],
            "texts": {
                "ru": cond_ru,
                "kg": cond_kg,
                "en": cond_en,
            },
            "sympy_solve_code":    sympy_code,
            "lean4_verification":  None,
        },
    }


def insert_rows(rows: list[dict]) -> int:
    """Batch-insert rows into task_templates. Returns count actually inserted."""
    if not rows:
        return 0
    try:
        result = supabase.table("task_templates").insert(rows).execute()
        return len(result.data) if result.data else 0
    except Exception as e:
        print(f"  [error] Supabase insert failed: {e}")
        return 0


def _extract_text_pdfplumber(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join((page.extract_text() or "") for page in pdf.pages)


VISION_MODEL   = "llama-3.2-90b-vision-preview"  # Groq vision model — OCR step
PAGES_PER_CALL = 3                               # pages per vision call

OCR_PROMPT = """You are a math textbook scanner.
Transcribe ALL text from this page EXACTLY as written — every problem number, formula, fraction, integral, and word.
Preserve the original language (Russian/Kyrgyz/English).
Write math inline: use ^ for powers (x^2), / for fractions (a/b), sqrt() for roots.
Do NOT interpret or solve — just transcribe the raw text faithfully.
"""


def _img_to_b64(img) -> str:
    import base64, io
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _ocr_pages_to_text(images: list) -> str:
    """Send page images to Groq Vision; return transcribed plain text."""
    content = [{"type": "text", "text": OCR_PROMPT}]
    for img in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{_img_to_b64(img)}"},
        })

    for attempt in range(3):
        try:
            resp = groq_client.chat.completions.create(
                model=VISION_MODEL,
                messages=[{"role": "user", "content": content}],
                max_tokens=4096,
                temperature=0.0,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt < 2:
                wait = (attempt + 1) * 10
                print(f"  [retry {attempt+1}/3] {e} — waiting {wait}s ...")
                time.sleep(wait)
            else:
                print(f"  [error] Vision OCR failed: {e}")
    return ""


def process_pdf(pdf_path: Path) -> int:
    """Extract and insert all templates from one PDF. Returns total inserted."""
    print(f"\n📄  {pdf_path.name}")
    total = 0

    # Step 1: get text (pdfplumber for digital PDFs, Vision OCR for scanned)
    try:
        full_text = _extract_text_pdfplumber(pdf_path)
    except Exception as e:
        print(f"  [error] Cannot read PDF: {e}")
        return 0

    if not full_text.strip():
        # Scanned PDF — convert pages to images, OCR via Groq Vision
        print("  [vision] scanned PDF — converting pages to images ...")
        try:
            from pdf2image import convert_from_path
        except ImportError:
            print("  [error] Run: pip install pdf2image")
            print("          Also install Poppler: https://github.com/oschwartz10612/poppler-windows/releases")
            return 0

        try:
            pages = convert_from_path(str(pdf_path), dpi=150)
        except Exception as e:
            print(f"  [error] pdf2image failed: {e}")
            print("         Install Poppler and add its bin\\ folder to PATH.")
            return 0

        print(f"  {len(pages)} pages — OCR via Groq Vision ({PAGES_PER_CALL} pages/call) ...")
        page_groups = [pages[i : i + PAGES_PER_CALL] for i in range(0, len(pages), PAGES_PER_CALL)]
        ocr_parts = []
        for i, group in enumerate(page_groups, 1):
            p_start = (i - 1) * PAGES_PER_CALL + 1
            p_end   = min(i * PAGES_PER_CALL, len(pages))
            print(f"  [ocr {i}/{len(page_groups)}] pages {p_start}–{p_end} ...", end=" ", flush=True)
            text = _ocr_pages_to_text(group)
            ocr_parts.append(text)
            print(f"{len(text)} chars")
            if i < len(page_groups):
                time.sleep(SLEEP_BETWEEN)

        full_text = "\n\n".join(ocr_parts)
        print(f"  OCR complete — {len(full_text):,} chars total")

    if not full_text.strip():
        print("  [warn] No text extracted — skipping")
        return 0

    # Step 2: chunk text → Llama-3 text model → templates → Supabase
    chunks = [full_text[i : i + CHUNK_CHARS] for i in range(0, len(full_text), CHUNK_CHARS)]
    print(f"  {len(chunks)} chunks → extracting templates ...")

    for idx, chunk in enumerate(chunks, 1):
        print(f"  [{idx}/{len(chunks)}] calling LLM ...", end=" ", flush=True)
        templates = extract_templates_from_chunk(chunk)
        print(f"{len(templates)} templates found", end=" ")
        rows = [r for t in templates if (r := build_db_row(t, pdf_path.stem)) is not None]
        inserted = insert_rows(rows)
        total += inserted
        print(f"→ {inserted} inserted")
        if idx < len(page_groups):
            time.sleep(SLEEP_BETWEEN)

    return total


def main() -> None:
    if not PDF_DIR.exists():
        print(f"[error] PDF directory not found: {PDF_DIR}")
        print("        Create the folder and put .pdf files inside it.")
        return

    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[warn] No PDF files found in {PDF_DIR}/")
        return

    print(f"Found {len(pdf_files)} PDF(s) in {PDF_DIR.name}/")
    grand_total = 0

    for pdf_path in pdf_files:
        count = process_pdf(pdf_path)
        grand_total += count

    print(f"\n✅  Done — {grand_total} templates inserted total.")


if __name__ == "__main__":
    main()
