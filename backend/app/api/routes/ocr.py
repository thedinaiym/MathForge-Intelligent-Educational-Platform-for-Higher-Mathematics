"""
Study / OCR analysis routes — Phase 3 full implementation.

Pipeline (steps A → F):
  A. Input validation      — content-type, size, step count
  B. Token deduction       — atomic, 1 token, 402 if insufficient
  C. Step extraction       — direct (JSON) or Vision OCR (image)
  D. SymPy Arbitrator      — validates every consecutive step pair
  E. Groq hint             — best-effort NLP hint if an error is found
  F. student_tracking      — upsert mastery level per category

CRITICAL rules (CLAUDE.md):
  - Token deduction is atomic and happens BEFORE processing.
  - Arbitrator uses SymPy only — LLM never validates math.
  - Groq text hint never contains equations or solutions.
  - Vision model extracts steps only — never solves the problem.

Design note:
  FastAPI cannot cleanly accept both a Pydantic JSON body *and* an UploadFile
  in the same endpoint. Two separate endpoints share the same _run_pipeline
  helper so billing/analysis logic is never duplicated.
"""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale, require_role
from app.core.engine.arbitrator import Arbitrator
from app.core.engine.llm_agent import LLMHintAgent
from app.core.engine.vision_agent import VisionAgent
from app.db.database import get_db
from app.db.models import ActivityLog, BillingAccount, StudentTracking
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, TokenPayload

router = APIRouter()

# 0.5 tokens per analysis call
TOKEN_COST_ANALYZE: float = 0.5

# Mastery deltas applied to student_tracking after each attempt
_MASTERY_GAIN: float = 5.0   # correct answer
_MASTERY_LOSS: float = 3.0   # error found
_MASTERY_MAX: float = 100.0
_MASTERY_MIN: float = 0.0


# ── Step B: Atomic token deduction ───────────────────────────────────────────

async def _deduct_token(user_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Deduct TOKEN_COST_ANALYZE from the user's billing account atomically.
    Raises HTTP 402 if the account does not exist or balance is insufficient.
    Must be called BEFORE any processing (OCR, Arbitrator, Groq).
    """
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


# ── Step F: Upsert student_tracking ──────────────────────────────────────────

async def _update_tracking(
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    is_correct: bool,
    error_type: str | None,
    db: AsyncSession,
) -> None:
    """
    Upsert a StudentTracking record for (user_id, category_id).

    Mastery rules:
      - Correct   → mastery += 5.0  (capped at 100)
      - Error     → mastery -= 3.0  (floored at 0), last_error_type updated
    """
    result = await db.execute(
        select(StudentTracking).where(
            StudentTracking.user_id == user_id,
            StudentTracking.category_id == category_id,
        )
    )
    record = result.scalar_one_or_none()

    if record is None:
        record = StudentTracking(
            id=uuid.uuid4(),
            user_id=user_id,
            category_id=category_id,
            mastery_level=0.0,
            last_error_type=None,
        )
        db.add(record)

    if is_correct:
        record.mastery_level = min(record.mastery_level + _MASTERY_GAIN, _MASTERY_MAX)
    else:
        record.mastery_level = max(record.mastery_level - _MASTERY_LOSS, _MASTERY_MIN)
        record.last_error_type = error_type or "algebraic_error"

    await db.commit()


# ── Step G: Activity log (heatmap) ───────────────────────────────────────────

async def _log_activity(user_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Upsert a daily activity record for the GitHub-style heatmap.

    Uses PostgreSQL ON CONFLICT DO UPDATE to increment the count atomically,
    ensuring exactly one row per (user, date) at all times.
    """
    today = date.today()
    stmt = (
        pg_insert(ActivityLog)
        .values(id=uuid.uuid4(), user_id=user_id, activity_date=today, count=1)
        .on_conflict_do_update(
            constraint="uq_activity_user_date",
            set_={"count": ActivityLog.__table__.c.count + 1},
        )
    )
    await db.execute(stmt)
    await db.commit()


# ── Shared pipeline: steps D → F ─────────────────────────────────────────────

async def _run_pipeline(
    steps: list[str],
    locale: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    category_id: uuid.UUID | None = None,
) -> AnalyzeResponse:
    """
    Steps D → F shared by both endpoints (after token deduction and step
    extraction have already occurred in the calling route).

    D. SymPy Arbitrator — pure symbolic validation, no LLM.
    E. Groq hint        — best-effort NLP explanation if error found.
    F. student_tracking — upsert mastery for the given category (if supplied).
    """
    # ── D. SymPy Arbitrator ───────────────────────────────────────────────
    validation = Arbitrator.validate_steps(steps)
    is_correct: bool = validation["is_correct"]

    # ── F. student_tracking upsert (fire regardless of correct/incorrect) ─
    if category_id is not None:
        try:
            error_type = validation.get("parse_error") if not is_correct else None
            await _update_tracking(user_id, category_id, is_correct, error_type, db)
        except Exception:
            # Tracking failure must never block the student's result.
            pass

    # ── G. Activity log — increment daily heatmap counter ────────────────
    try:
        await _log_activity(user_id, db)
    except Exception:
        pass  # Never block the student's result

    if is_correct:
        return AnalyzeResponse(status="correct", error_index=None, hint=None)

    error_index: int = validation["error_index"]
    step_before: str = validation["step_before"]
    step_with_error: str = validation["step_with_error"]

    # ── E. Groq hint (NLP only — never solves math) ───────────────────────
    hint_text: str | None = None
    try:
        hint_text = await LLMHintAgent.generate_hint(
            step_before=step_before,
            step_with_error=step_with_error,
            user_locale=locale,
        )
    except Exception:
        # Hint is best-effort; a Groq failure must never fail the response.
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

    Steps A → F:
      A. Validate step count (≥ 2, enforced by Pydantic schema).
      B. Deduct 1 token atomically — 402 if balance insufficient.
      C. Steps provided directly in request body (no OCR needed).
      D. SymPy Arbitrator validates every consecutive pair.
      E. Groq returns a pedagogical hint if an error is found.
      F. student_tracking mastery is updated if category_id is supplied.

    Request body (JSON)::

        {
          "steps": ["2*x + 4 = 10", "2*x = 10 + 4", "2*x = 14"],
          "category_id": "<uuid>"   // optional
        }

    Response::

        {"status": "error_found", "error_index": 1, "hint": "..."}
    """
    user_id = uuid.UUID(current_user.sub)

    # B. Token deduction — before any work
    await _deduct_token(user_id, db)

    # D → F. Arbitrator + hint + tracking
    return await _run_pipeline(body.steps, locale, user_id, db, body.category_id)


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
    category_id: uuid.UUID | None = None,
):
    """
    Full Vision OCR pipeline.

    Steps A → F:
      A. Validate content-type (JPEG/PNG/WebP) and file size (≤ 10 MB).
      B. Deduct 1 token atomically — 402 if balance insufficient.
         Token is consumed even if Vision OCR subsequently fails, because
         the API call to Groq Vision has already been initiated.
      C. Groq Vision extracts ordered step strings from the image.
      D. SymPy Arbitrator validates every consecutive step pair.
      E. Groq returns a pedagogical hint if an error is found.
      F. student_tracking mastery is updated if category_id is supplied.

    Accepted content-types: image/jpeg, image/png, image/webp.
    """
    # ── A. Validate content type ──────────────────────────────────────────
    allowed = {"image/jpeg", "image/png", "image/webp"}
    content_type = (image.content_type or "").lower()
    if content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, or WebP.",
        )

    # ── A. Validate file size ─────────────────────────────────────────────
    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds 10 MB limit.",
        )

    user_id = uuid.UUID(current_user.sub)

    # ── B. Token deduction — before OCR ──────────────────────────────────
    await _deduct_token(user_id, db)

    # ── C. Vision OCR — extract steps from the image ─────────────────────
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

    # ── A. Validate extracted step count ──────────────────────────────────
    if len(steps) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Only {len(steps)} step(s) detected in the image. "
                "At least 2 steps are required for analysis. "
                "Please ensure the full solution is visible."
            ),
        )

    # ── D → F. Arbitrator + hint + tracking ──────────────────────────────
    return await _run_pipeline(steps, locale, user_id, db, category_id)
