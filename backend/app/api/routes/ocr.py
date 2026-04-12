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

import json
import uuid
from datetime import date

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from groq import AsyncGroq
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale, require_role
from app.core.config import settings
from app.core.engine.arbitrator import Arbitrator
from app.core.engine.generator import TaskGenerator
from app.core.engine.llm_agent import LLMHintAgent
from app.core.engine.vision_agent import VisionAgent
from app.db.database import get_db
from app.db.models import ActivityLog, BillingAccount, StudentTracking, TaskTemplate
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, TokenPayload

router = APIRouter()

# 0.5 tokens per analysis call
TOKEN_COST_ANALYZE: float = 0.5

# 1 token for the full homework checker (Vision + LLM tutor + task generation)
TOKEN_COST_HOMEWORK: float = 1.0

# Mastery deltas applied to student_tracking after each attempt
_MASTERY_GAIN: float = 5.0   # correct answer
_MASTERY_LOSS: float = 3.0   # error found
_MASTERY_MAX: float = 100.0
_MASTERY_MIN: float = 0.0

# ── Homework checker response schemas ─────────────────────────────────────────

class HomeworkPracticeTask(BaseModel):
    question_text: str
    condition_latex: str
    answer_latex: str
    topic: str


class HomeworkCheckResponse(BaseModel):
    is_correct: bool
    error_step_index: int | None
    feedback: str
    weak_topic: str | None
    extracted_steps: list[str]
    practice_tasks: list[HomeworkPracticeTask]


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


# ── Route 3: Homework Checker ─────────────────────────────────────────────────
# Separate from the standard analyze-image:
#   • Deducts 1 token (vs 0.5 for plain OCR)
#   • Calls a friendly "math tutor" LLM prompt that explains the *concept*
#   • Generates 3 practice tasks matching the identified weak topic
# ─────────────────────────────────────────────────────────────────────────────

_TUTOR_MODEL = "llama-3.3-70b-versatile"

_LANG_NOTE = {
    "en": "Respond in English.",
    "ru": "Отвечай на русском языке.",
    "kg": "Кыргызча жооп бер.",
}

_TUTOR_SYSTEM = """\
You are a friendly, encouraging math tutor for university students.
A student has uploaded their handwritten math solution. Analyze it carefully.

Output ONLY a valid JSON object — no markdown, no code fences, no commentary.

Schema:
{{
  "is_correct": true | false,
  "error_step_index": null | <0-based integer>,
  "feedback": "<friendly explanation — praise if correct, explain the concept if wrong>",
  "weak_topic": null | "<snake_case topic, e.g. quadratic_equation, integration_by_parts>"
}}

Rules:
1. Output ONLY raw JSON.
2. If is_correct is true, error_step_index must be null.
3. {lang_note}
4. feedback must explain WHY the step is wrong conceptually, not just say "incorrect".
5. weak_topic is the math concept the student needs to drill (null if fully correct).
6. error_step_index is 0-based (Step 1 → 0, Step 2 → 1, …).
"""


async def _call_tutor_llm(
    steps: list[str],
    locale: str,
    problem_text: str = "",
) -> dict:
    """Call Groq Llama-3 in JSON mode to analyse the solution as a math tutor.

    Args:
        steps:        Ordered solution steps extracted via Vision OCR.
        locale:       Response language (en / ru / kg).
        problem_text: The problem condition typed by the student (provides
                      crucial context so the AI knows what the question asks).
    """
    if not settings.groq_api_key:
        return {
            "is_correct": False,
            "error_step_index": None,
            "feedback": "AI tutor unavailable — GROQ_API_KEY not configured.",
            "weak_topic": None,
        }

    steps_text = "\n".join(f"Step {i + 1}: {s}" for i, s in enumerate(steps))
    lang_note = _LANG_NOTE.get(locale, _LANG_NOTE["ru"])

    condition_section = (
        f"Problem condition:\n{problem_text.strip()}\n\n" if problem_text.strip() else ""
    )

    client = AsyncGroq(api_key=settings.groq_api_key)
    response = await client.chat.completions.create(
        model=_TUTOR_MODEL,
        messages=[
            {
                "role": "system",
                "content": _TUTOR_SYSTEM.format(lang_note=lang_note),
            },
            {
                "role": "user",
                "content": (
                    condition_section
                    + "Student's solution (extracted by OCR):\n\n"
                    + steps_text
                    + "\n\nAnalyze the solution in the context of the problem above and return the JSON."
                ),
            },
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    return {
        "is_correct": bool(parsed.get("is_correct", False)),
        "error_step_index": parsed.get("error_step_index"),
        "feedback": str(parsed.get("feedback", "")),
        "weak_topic": parsed.get("weak_topic") or None,
    }


async def _find_practice_templates(
    weak_topic: str | None,
    db: AsyncSession,
    count: int = 3,
) -> list[TaskTemplate]:
    """
    Find up to `count` active templates matching the weak topic.
    Falls back to random active templates if no topic match is found.
    """
    if weak_topic:
        # Normalise underscores to % so "quadratic_equation" matches "quadratic equation"
        like_pat = f"%{weak_topic.replace('_', '%')}%"
        result = await db.execute(
            select(TaskTemplate)
            .where(TaskTemplate.is_active == True)  # noqa: E712
            .where(TaskTemplate.template_json["topic"].astext.ilike(like_pat))
            .limit(count)
        )
        templates = list(result.scalars().all())
        if templates:
            return templates

    # Fallback — any active templates in random order
    result = await db.execute(
        select(TaskTemplate)
        .where(TaskTemplate.is_active == True)  # noqa: E712
        .order_by(func.random())
        .limit(count)
    )
    return list(result.scalars().all())


@router.post("/check-homework", response_model=HomeworkCheckResponse)
async def check_homework(
    problem_text: str = Form(
        default="",
        description="The problem condition typed by the student (optional but recommended).",
    ),
    files: List[UploadFile] = File(
        ...,
        description="One or more photos of the student's handwritten solution steps (JPEG/PNG/WebP ≤ 10 MB each).",
    ),
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HomeworkCheckResponse:
    """
    Full homework-checker pipeline.

    Accepts:
      - problem_text  (Form field, optional) — the problem condition for context.
      - files         (one or more images)   — photos of the student's solution.

    Steps:
      A. Validate each image's content-type and size.
      B. Deduct 1 token atomically (402 if insufficient).
      C. Vision OCR — extract steps from every uploaded image and merge them
                       in upload order into a single step sequence.
      D. Tutor LLM  — Groq Llama-3 analyses steps + problem condition,
                       identifies the error concept, explains it clearly.
      E. Practice generation — find 3 templates matching the weak topic.
      F. Activity log — increment the daily heatmap counter.
    """
    allowed = {"image/jpeg", "image/png", "image/webp"}

    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one solution image is required.",
        )

    # ── A. Validate all files upfront ────────────────────────────────────
    validated: list[tuple[bytes, str]] = []
    for f in files:
        content_type = (f.content_type or "").lower()
        if content_type not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, or WebP.",
            )
        raw = await f.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image '{f.filename}' exceeds the 10 MB limit.",
            )
        validated.append((raw, content_type))

    user_id = uuid.UUID(current_user.sub)

    # ── B. Token deduction ────────────────────────────────────────────────
    result = await db.execute(
        select(BillingAccount).where(BillingAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()
    if account is None or account.token_balance < TOKEN_COST_HOMEWORK:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient token balance. 1 token required for homework checking.",
        )
    account.token_balance = round(account.token_balance - TOKEN_COST_HOMEWORK, 2)
    await db.commit()

    # ── C. Vision OCR — extract steps from every image and merge ─────────
    all_steps: list[str] = []
    for raw, mime in validated:
        try:
            page_steps = await VisionAgent.extract_steps(raw, mime_type=mime)
            all_steps.extend(page_steps)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Could not extract steps from one of the images. "
                    "Please ensure the handwriting is clear and well-lit. "
                    f"Detail: {exc}"
                ),
            ) from exc

    steps = all_steps
    if not steps:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No solution steps found in the uploaded images. Please upload clearer photos.",
        )

    # ── D. LLM Tutor analysis ─────────────────────────────────────────────
    try:
        analysis = await _call_tutor_llm(steps, locale, problem_text=problem_text)
    except Exception:
        analysis = {
            "is_correct": False,
            "error_step_index": None,
            "feedback": "AI tutor is temporarily unavailable. Please try again shortly.",
            "weak_topic": None,
        }

    # ── E. Practice task generation ───────────────────────────────────────
    practice_tasks: list[HomeworkPracticeTask] = []
    try:
        templates = await _find_practice_templates(analysis["weak_topic"], db, count=3)
        for tpl in templates:
            tj = tpl.template_json
            if not tj:
                continue
            try:
                generated = TaskGenerator.generate(tj, locale)
                practice_tasks.append(
                    HomeworkPracticeTask(
                        question_text=generated["question_text"],
                        condition_latex=generated["condition_latex"],
                        answer_latex=generated["answer_latex"],
                        topic=generated["topic"],
                    )
                )
            except Exception:
                continue  # skip broken templates silently
    except Exception:
        pass  # practice tasks are best-effort — never fail the response

    # ── F. Activity log ───────────────────────────────────────────────────
    try:
        await _log_activity(user_id, db)
    except Exception:
        pass

    return HomeworkCheckResponse(
        is_correct=analysis["is_correct"],
        error_step_index=analysis["error_step_index"],
        feedback=analysis["feedback"],
        weak_topic=analysis["weak_topic"],
        extracted_steps=steps,
        practice_tasks=practice_tasks,
    )
