"""
ORT routes.

POST /api/ort/generate       — generate problems as JSON (costs 2 tokens)
POST /api/ort/generate/pdf   — generate + compile PDF  (costs 5 tokens)
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale
from app.db.database import get_db
from app.db.models import ActivityLog, BillingAccount
from app.models.schemas import (
    OrtComparisonProblem,
    OrtGenerateRequest,
    OrtGenerateResponse,
    OrtMcProblem,
    TokenPayload,
)
from app.services.ort_generator import generate_ort_part1, generate_ort_part2
from app.services.pdf_maker import _compile_sync, _jinja_env

router = APIRouter()

TOKEN_COST_JSON = 2.0
TOKEN_COST_PDF = 5.0


# ── Token helper ─────────────────────────────────────────────────────────────

async def _deduct_tokens(user_id: uuid.UUID, amount: float, db: AsyncSession) -> None:
    result = await db.execute(
        select(BillingAccount).where(BillingAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()
    if account is None or account.token_balance < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient tokens. This action costs {amount} token(s).",
        )
    account.token_balance = round(account.token_balance - amount, 2)
    await db.commit()


# ── Shared generation logic ───────────────────────────────────────────────────

def _run_generator(payload: OrtGenerateRequest, locale: str) -> tuple[list, list[str]]:
    """
    Run the SymPy ORT generator (CPU-bound, called in thread pool).
    Returns (raw_problems, answer_key).
    """
    if payload.part == 1:
        raw = generate_ort_part1(count=payload.count, locale=locale)
    else:
        raw = generate_ort_part2(count=payload.count, locale=locale)

    answer_key = [p["answer_label"] if payload.part == 1 else p["correct_label"] for p in raw]
    return raw, answer_key


def _build_response(
    payload: OrtGenerateRequest,
    raw: list,
    answer_key: list[str],
) -> OrtGenerateResponse:
    """Convert raw dicts from ort_generator into typed Pydantic models."""
    if payload.part == 1:
        problems = [OrtComparisonProblem(**p) for p in raw]
    else:
        problems = [OrtMcProblem(**p) for p in raw]

    return OrtGenerateResponse(part=payload.part, problems=problems, answer_key=answer_key)


# ── Route: JSON generation ────────────────────────────────────────────────────

@router.post("/generate", response_model=OrtGenerateResponse)
async def generate_ort(
    payload: OrtGenerateRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate ORT problems and return them as JSON.

    Part 1 — comparison (А/Б/В/Г per problem)
    Part 2 — multiple choice (А–Д per problem)

    Costs 2 tokens. No PDF compilation.
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_JSON, db)

    loop = asyncio.get_running_loop()
    try:
        raw, answer_key = await loop.run_in_executor(
            None, _run_generator, payload, locale
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    # Log activity for heatmap
    try:
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
    except Exception:
        pass

    return _build_response(payload, raw, answer_key)


# ── Route: PDF generation ─────────────────────────────────────────────────────

@router.post("/generate/pdf")
async def generate_ort_pdf(
    payload: OrtGenerateRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate ORT problems and compile to PDF.

    Steps:
      1. Deduct 5 tokens.
      2. Run SymPy ORT generator in thread pool.
      3. Render ort_exam.tex Jinja2 template.
      4. Compile with pdflatex (thread pool).
      5. Return raw PDF bytes.
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_PDF, db)

    loop = asyncio.get_running_loop()

    # Step 2 — generate problems
    try:
        raw, answer_key = await loop.run_in_executor(
            None, _run_generator, payload, locale
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    # Step 3 — render LaTeX
    part_labels = {
        "ru": {1: "Часть I — Сравнение", 2: "Часть II — Выбор ответа"},
        "en": {1: "Part I — Comparison",  2: "Part II — Multiple Choice"},
        "kg": {1: "I бөлүк — Салыштыруу", 2: "II бөлүк — Жооп тандоо"},
    }
    resolved_locale = locale if locale in part_labels else "ru"
    part_title = part_labels[resolved_locale][payload.part]

    context = {
        "title": "ORT — Математика",
        "part_title": part_title,
        "part": payload.part,
        "problems": raw,
        "answer_key": answer_key,
        "mc_labels": ["А", "Б", "В", "Г", "Д"],
    }

    template = _jinja_env.get_template("ort_exam.tex")
    latex_source = template.render(**context)

    # Step 4 — compile PDF
    try:
        pdf_bytes = await loop.run_in_executor(None, _compile_sync, latex_source)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    filename = f"ort_part{payload.part}_{payload.count}q.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
