"""
Task routes.
GET  /api/tasks/categories    — list all active categories (name resolved by locale)
POST /api/tasks/generate      — generate PDF worksheet (costs 5 tokens)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale, require_role
from app.db.database import get_db
from app.db.models import BillingAccount, Category, TaskTemplate
from app.models.schemas import (
    CategoryResponse,
    GenerateTaskRequest,
    GenerateTaskResponse,
    TokenPayload,
)

router = APIRouter()

TOKEN_COST_PDF = 5.0


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    locale: str = Depends(get_locale),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all categories with names resolved for the request locale.
    Header: Accept-Language: ru | en | kg
    """
    result = await db.execute(select(Category))
    categories = result.scalars().all()

    return [
        CategoryResponse(id=cat.id, name=cat.get_name(locale))
        for cat in categories
    ]


@router.post("/generate", response_model=GenerateTaskResponse)
async def generate_tasks(
    payload: GenerateTaskRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch matching templates → TaskGenerator (SymPy) → compile LaTeX → pdflatex.
    Costs 5 tokens per generation request.
    """
    user_id = uuid.UUID(current_user.sub)

    # ── 1. Token check and deduction ──────────────────────────────────────
    result = await db.execute(
        select(BillingAccount).where(BillingAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()

    if account is None or account.token_balance < TOKEN_COST_PDF:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient tokens. PDF generation costs {TOKEN_COST_PDF} tokens.",
        )

    # ── 2. Fetch templates ────────────────────────────────────────────────
    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.category_id == payload.category_id,
            TaskTemplate.difficulty == payload.difficulty,
            TaskTemplate.is_active.is_(True),
        )
    )
    templates = result.scalars().all()

    if not templates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active templates found for the selected category and difficulty",
        )

    # ── 3. Deduct tokens ──────────────────────────────────────────────────
    account.token_balance = round(account.token_balance - TOKEN_COST_PDF, 2)
    await db.commit()

    # ── 4. Generate tasks (SymPy) ─────────────────────────────────────────
    # Full SymPy + pdflatex pipeline wired here when PDF service is ready.
    # Returns sample tasks from the matched templates for now.
    from app.core.engine.generator import TaskGenerator

    generated = []
    for i in range(min(payload.count, len(templates) * 10)):
        tmpl = templates[i % len(templates)]
        try:
            task = TaskGenerator.generate(tmpl.template_json, locale=locale)
            generated.append({
                "question_text": task.get("question_text", ""),
                "condition_latex": task.get("condition_latex", ""),
                "answer_latex": task.get("answer_latex", ""),
            })
        except Exception:
            continue

    return GenerateTaskResponse(pdf_url=None, tasks=generated)
