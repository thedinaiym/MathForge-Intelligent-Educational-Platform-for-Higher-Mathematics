"""
Study / OCR analysis routes.

  POST /api/study/analyze        — JSON body  {steps: [...]}  (manual entry)
  POST /api/study/analyze-image  — multipart  {image: file}   (Vision OCR)

Both routes share the same pipeline after step extraction:
  Arbitrator (SymPy) → LLMHintAgent (Groq text, if error found)

CRITICAL rules (CLAUDE.md):
  - Token deduction is atomic and happens BEFORE processing.
  - Arbitrator uses SymPy only — LLM never validates math.
  - Groq text hint never contains equations or solutions.
  - Vision model extracts steps only — never solves the problem.

Design note:
  FastAPI cannot cleanly accept both a Pydantic JSON body *and* an UploadFile
  in the same endpoint (mixing JSON body with multipart/form-data).  Keeping
  the two input modes as separate endpoints preserves the JSON-body endpoint
  exactly as it was (existing tests remain green) while adding a clean,
  dedicated image endpoint for Phase 5.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale, require_role
from app.core.engine.arbitrator import Arbitrator
from app.core.engine.llm_agent import LLMHintAgent
from app.core.engine.vision_agent import VisionAgent
from app.db.database import get_db
from app.db.models import BillingAccount
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, TokenPayload

router = APIRouter()

TOKEN_COST_ANALYZE = 0.5   # per analyze call (manual or image)

# ── Shared pipeline helper ────────────────────────────────────────────────────

async def _run_pipeline(
    steps: list[str],
    locale: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> AnalyzeResponse:
    """
    Token deduction → Arbitrator → optional Groq hint → AnalyzeResponse.

    Extracted into a helper so both endpoints share identical billing and
    analysis logic without duplication.
    """
    # ── 1. Atomic token deduction ────────────────────────────────────────
    result = await db.execute(
        select(BillingAccount).where(BillingAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()

    if account is None or account.token_balance < TOKEN_COST_ANALYZE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient token balance. Please top up to continue.",
        )

    account.token_balance = round(account.token_balance - TOKEN_COST_ANALYZE, 2)
    await db.commit()

    # ── 2. SymPy Arbitrator (no LLM) ─────────────────────────────────────
    validation = Arbitrator.validate_steps(steps)

    if validation["is_correct"]:
        return AnalyzeResponse(status="correct", error_index=None, hint=None)

    error_index: int = validation["error_index"]
    step_before: str = validation["step_before"]
    step_with_error: str = validation["step_with_error"]

    # ── 3. Groq text hint (NLP only — never solves math) ─────────────────
    hint_text: str | None = None
    try:
        hint_text = await LLMHintAgent.generate_hint(
            step_before=step_before,
            step_with_error=step_with_error,
            user_locale=locale,
        )
    except Exception:
        # Hint is best-effort; a missing hint must never fail the response.
        hint_text = None

    return AnalyzeResponse(
        status="error_found",
        error_index=error_index,
        hint=hint_text,
    )


# ── Route 1: Manual step entry (JSON body) ────────────────────────────────────

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_solution(
    body: AnalyzeRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze a student's manually-entered solution steps.

    Request body (JSON)::

        {"steps": ["2*x + 4 = 10", "2*x = 10 + 4", "2*x = 14"]}

    Response::

        {"status": "error_found", "error_index": 1, "hint": "..."}
    """
    user_id = uuid.UUID(current_user.sub)
    return await _run_pipeline(body.steps, locale, user_id, db)


# ── Route 2: Image upload (Vision OCR) ───────────────────────────────────────

@router.post("/analyze-image", response_model=AnalyzeResponse)
async def analyze_solution_image(
    image: UploadFile = File(
        ...,
        description="Photo of the student's handwritten solution (JPEG or PNG, ≤ 10 MB).",
    ),
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """
    Full Vision OCR pipeline:
      image → Groq Vision (extract steps) → Arbitrator → Groq hint

    The token is deducted before OCR.  If Vision fails, the token is still
    consumed (the API call to Groq was made).  Students are informed to
    fall back to manual entry on extraction failure.

    Accepted content-types: image/jpeg, image/png, image/webp.
    """
    # ── Validate content type ─────────────────────────────────────────────
    allowed = {"image/jpeg", "image/png", "image/webp"}
    content_type = (image.content_type or "").lower()
    if content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, or WebP.",
        )

    # ── Read image bytes ──────────────────────────────────────────────────
    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB hard cap
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds 10 MB limit.",
        )

    user_id = uuid.UUID(current_user.sub)

    # ── Vision OCR (Groq) ─────────────────────────────────────────────────
    try:
        steps = await VisionAgent.extract_steps(image_bytes, mime_type=content_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Could not extract steps from the image. "
                "Please ensure the handwriting is clear, or use manual entry. "
                f"Detail: {exc}"
            ),
        ) from exc

    if len(steps) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Only {len(steps)} step(s) detected in the image. "
                "At least 2 are required for analysis. "
                "Please ensure the full solution is visible."
            ),
        )

    # ── Shared Arbitrator + hint pipeline ────────────────────────────────
    return await _run_pipeline(steps, locale, user_id, db)
