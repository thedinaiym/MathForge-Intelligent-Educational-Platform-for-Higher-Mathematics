"""
Student self-practice PDF generation.

POST /api/student/generate-pdf
  Request:  {
      category_id:  UUID,
      difficulty:   "easy" | "medium" | "hard",
      template_ids: list[UUID]  (empty = all topics for category),
      count:        int (1–30),
  }
  Response: application/pdf — study guide with problems first, answers last page.

Cost: TOKEN_COST_STUDY_GUIDE (3 tokens) — cheaper than teacher PDF (5 tokens)
      but more expensive than a plain JSON practice call (1 token) because
      LaTeX compilation is compute-intensive.

Accessible to all authenticated roles; intended primarily for students.
"""
from __future__ import annotations

import traceback  # <--- Модуль для детализированного вывода ошибок
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.dependencies import get_current_user, get_locale
from app.db.database import get_db
from app.db.models import ActivityLog, BillingAccount, Category, TaskTemplate
from app.core.engine.generator import TaskGenerator
from app.models.schemas import DifficultyType, TokenPayload
from app.services.pdf_maker import compile_study_guide_to_pdf

router = APIRouter()

TOKEN_COST_STUDY_GUIDE = 3.0

_DIFFICULTY_LABELS: dict[str, dict] = {
    "en": {"easy": "Easy",    "medium": "Medium",   "hard": "Hard"},
    "ru": {"easy": "Лёгкий",  "medium": "Средний",  "hard": "Сложный"},
    "kg": {"easy": "Жеңил",   "medium": "Орто",     "hard": "Кыйын"},
}


# ── Schema ────────────────────────────────────────────────────────────────────

class StudyGuideRequest(BaseModel):
    category_id:  uuid.UUID
    difficulty:   DifficultyType = "medium"
    template_ids: list[uuid.UUID] = Field(default_factory=list)
    count:        int = Field(default=10, ge=1, le=30)


# ── Helpers ───────────────────────────────────────────────────────────────────

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


async def _log_activity(user_id: uuid.UUID, db: AsyncSession) -> None:
    today = date.today()
    stmt = (
        pg_insert(ActivityLog)
        .values(id=uuid.uuid4(), user_id=user_id, activity_date=today, count=1)
        .on_conflict_do_update(
            constraint="uq_activity_user_date",
            set_={"count": ActivityLog.__table__.c.count + 1},
        )
    )
    try:
        await db.execute(stmt)
        await db.commit()
    except Exception:
        pass


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/generate-pdf")
async def generate_study_guide_pdf(
    payload: StudyGuideRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a personal study-guide PDF for the student.

    Structure:
      • Pages 1+: Problems only — numbered, with blank work space.
      • Last page: Answer key — problem + answer side-by-side.

    Token cost: 3 per call.
    """
    user_id = uuid.UUID(current_user.sub)

    # ── 1. Deduct tokens first ────────────────────────────────────────────────
    await _deduct_tokens(user_id, TOKEN_COST_STUDY_GUIDE, db)

    # ── 2. Fetch matching templates ───────────────────────────────────────────
    filters = [
        TaskTemplate.category_id == payload.category_id,
        TaskTemplate.difficulty  == payload.difficulty,
        TaskTemplate.is_active.is_(True),
    ]
    if payload.template_ids:
        filters.append(TaskTemplate.id.in_(payload.template_ids))

    result = await db.execute(select(TaskTemplate).where(*filters))
    templates = result.scalars().all()

    if not templates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No active templates found for the selected topic and difficulty. "
                "Ask your teacher to upload templates for this category."
            ),
        )

    # ── 3. Generate tasks ─────────────────────────────────────────────────────
    generated: list[dict] = []
    for i in range(min(payload.count, len(templates) * 10)):
        tmpl = templates[i % len(templates)]
        try:
            task = TaskGenerator.generate(tmpl.template_json, locale=locale)
            generated.append({
                "question_text":   task.get("question_text", ""),
                "condition_latex": task.get("condition_latex", ""),
                "answer_latex":    task.get("answer_latex", ""),
            })
        except Exception as e:
            # === ПЕРЕХВАТ ОШИБОК ОТ SymPy И Groq ===
            print(f"🔥 ОШИБКА ГЕНЕРАЦИИ (Шаблон {tmpl.id}): {str(e)}", flush=True)
            print(traceback.format_exc(), flush=True)
            continue
            # =======================================

    if not generated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Task generation failed. Check that template constraints are satisfiable.",
        )

    # Cap to requested count
    generated = generated[: payload.count]

    # ── 4. Resolve category name for the title ────────────────────────────────
    cat_result = await db.execute(select(Category).where(Category.id == payload.category_id))
    category = cat_result.scalar_one_or_none()
    category_name = category.get_name(locale) if category else "Study Guide"

    diff_labels = _DIFFICULTY_LABELS.get(locale, _DIFFICULTY_LABELS["ru"])
    difficulty_label = diff_labels.get(payload.difficulty, payload.difficulty.capitalize())
    title = f"{category_name} — {difficulty_label}"

    # ── 5. Compile PDF ────────────────────────────────────────────────────────
    try:
        pdf_bytes = await compile_study_guide_to_pdf(
            title=title,
            tasks=generated,
            difficulty_label=difficulty_label,
            locale=locale,
        )
    except Exception as exc: 
        # === ПЕРЕХВАТ ОШИБОК ОТ Jinja2 И pdflatex ===
        print(f"🔥 ОШИБКА КОМПИЛЯЦИИ PDF: {str(exc)}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
        # ============================================

    # ── 6. Log activity, return PDF ───────────────────────────────────────────
    await _log_activity(user_id, db)

    filename = f"mathforge_studyguide_{payload.difficulty}_{len(generated)}q.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )