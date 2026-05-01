"""
Task routes.

GET  /api/tasks/categories    — list all active categories (name resolved by locale)
POST /api/tasks/generate      — generate task list as JSON (LibraryPage inline preview)
POST /api/tasks/generate/pdf  — generate task list and compile to PDF (TeacherGenerator download)
"""
import asyncio
import logging
import random
import uuid
import traceback  # <--- ДОБАВЛЕНО ДЛЯ ЛОГИРОВАНИЯ ОШИБОК
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale, require_role
from app.core.engine.generator import TaskGenerator
from app.db.database import get_db
from app.db.models import ActivityLog, BillingAccount, Category, StudentTracking, TaskTemplate
from app.models.schemas import (
    AdaptiveGenerateRequest,
    CategoryResponse,
    GenerateTaskRequest,
    GenerateTaskResponse,
    GeneratedTask,
    OrtVariantRequest,
    TaskTemplateInfo,
    TokenPayload,
)
from app.services.ort_generator import generate_ort_part1, generate_ort_part2
from app.services.pdf_maker import _compile_sync, compile_latex_to_pdf

router = APIRouter()

TOKEN_COST_PDF = 5.0
TOKEN_COST_ADAPTIVE = 1.0   # cheap — JSON only, no PDF compilation


async def _log_activity(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Upsert daily heatmap counter for the given user."""
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


# ── Shared helpers ────────────────────────────────────────────────────────────

async def _deduct_tokens(
    user_id: uuid.UUID,
    amount: float,
    db: AsyncSession,
) -> None:
    """
    Atomically deduct *amount* tokens.  Raises 402 if balance is insufficient.
    Must be called BEFORE any generation work.
    """
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


async def _generate_tasks(
    payload: GenerateTaskRequest,
    locale: str,
    db: AsyncSession,
    template_id_override: "uuid.UUID | None" = None,
) -> list[dict]:
    """
    Fetch active templates matching (category, difficulty), run TaskGenerator
    for the requested count, and return a list of task dicts.
    Raises 404 if no matching templates exist.
    """
    tid = template_id_override or payload.template_id
    filters = [
        TaskTemplate.category_id == payload.category_id,
        TaskTemplate.difficulty == payload.difficulty,
        TaskTemplate.is_active.is_(True),
    ]
    if payload.template_ids:
        filters.append(TaskTemplate.id.in_(payload.template_ids))
    elif tid:
        filters.append(TaskTemplate.id == tid)

    try:
        result = await db.execute(select(TaskTemplate).where(*filters))
        templates = result.scalars().all()
    except SQLAlchemyError as exc:
        logger.error("DB error fetching templates: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection error. Please try again in a moment.",
        ) from exc

    if not templates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active templates found for the selected category and difficulty.",
        )

    # Shuffle so each generate call picks a different template first,
    # giving variety when count=1 (the common student practice case).
    templates = list(templates)
    random.shuffle(templates)

    generated: list[dict] = []
    for i in range(min(payload.count, len(templates) * 10)):
        tmpl = templates[i % len(templates)]
        try:
            task = TaskGenerator.generate(tmpl.template_json, locale=locale)
            generated.append({
                "question_text": task.get("question_text", ""),
                "condition_latex": task.get("condition_latex", ""),
                "answer_latex": task.get("answer_latex", ""),
            })
        except Exception as e:
            # === ИСПРАВЛЕННАЯ ЛОВУШКА ОШИБОК ===
            print(f"🔥 ОШИБКА ГЕНЕРАЦИИ (Шаблон {tmpl.id}): {str(e)}", flush=True)
            print(traceback.format_exc(), flush=True)
            logger.error(f"Generation error for template {tmpl.id}: {e}")
            continue
            # ===================================

    if not generated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Task generation failed for all sampled templates. "
                   "Check that template constraints are satisfiable.",
        )

    return generated


# ── Route: list all templates (admin dataset page) ────────────────────────────

@router.get("/templates/list")
async def list_all_templates(
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all task templates — used by the Admin Dataset page."""
    result = await db.execute(select(TaskTemplate))
    templates = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "title": t.get_title(locale),
            "difficulty": t.difficulty,
            "is_active": t.is_active,
            "topic": t.template_json.get("topic", ""),
        }
        for t in templates
    ]


# ── Route: list categories ────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    locale: str = Depends(get_locale),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all categories with names resolved for the request locale.
    Header: Accept-Language: ru | en | kg
    """
    try:
        result = await db.execute(select(Category))
        categories = result.scalars().all()
    except SQLAlchemyError as exc:
        logger.error("DB error fetching categories: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please refresh the page.",
        ) from exc

    return [
        CategoryResponse(id=cat.id, name=cat.get_name(locale))
        for cat in categories
    ]


# ── Kyrgyz topic-name translation map ────────────────────────────────────────
# LLM-seeded templates store English topic names even in the 'kg' slot.
# This map translates the most common ones to proper Kyrgyz math terminology.
_TOPIC_KG_MAP: dict[str, str] = {
    "quadratic equations": "Квадраттык теңдемелер",
    "quadratic equation": "Квадраттык теңдеме",
    "linear equations": "Сызыктуу теңдемелер",
    "linear equation": "Сызыктуу теңдеме",
    "linear inequalities": "Сызыктуу теңсиздиктер",
    "systems of equations": "Теңдемелер системасы",
    "systems of linear equations": "Сызыктуу теңдемелер системасы",
    "inequalities": "Теңсиздиктер",
    "quadratic inequalities": "Квадраттык теңсиздиктер",
    "absolute value inequalities": "Модулу бар теңсиздиктер",
    "rational inequalities": "Рационалдык теңсиздиктер",
    "logarithmic inequalities": "Логарифмдик теңсиздиктер",
    "absolute value": "Модуль",
    "limits": "Чектер",
    "limits of functions": "Функциялардын чектери",
    "derivatives": "Туунду",
    "derivatives of logarithmic functions": "Логарифмдик функциялардын туундулары",
    "higher-order derivatives": "Жогорку тартиптеги туундулар",
    "implicit differentiation": "Кыйыр дифференциациялоо",
    "differentials": "Дифференциалдар",
    "indefinite integrals": "Аныкталбаган интегралдар",
    "definite integrals": "Аныкталган интегралдар",
    "integration": "Интегралдоо",
    "integration of rational functions": "Рационалдык функцияларды интегралдоо",
    "integration of exponential functions": "Экспоненциалдык функцияларды интегралдоо",
    "double integrals": "Кош интегралдар",
    "triple integrals": "Үч эселик интегралдар",
    "line integrals": "Контурдук интегралдар",
    "series": "Катарлар",
    "series convergence": "Катардын жыйышуусу",
    "geometric series": "Геометриялык катар",
    "alternating series": "Кезектешкен катарлар",
    "infinite series": "Чексиз катарлар",
    "power series": "Даражалык катарлар",
    "series expansion": "Катарга жайуу",
    "series and sequences": "Катарлар жана ырааттуулуктар",
    "sequences": "Ырааттуулуктар",
    "partial derivatives": "Жарым туунду",
    "parametric functions": "Параметрдик функциялар",
    "parametric equations": "Параметрдик теңдемелер",
    "logarithmic equations": "Логарифмдик теңдемелер",
    "trigonometric equations": "Тригонометриялык теңдемелер",
    "logarithmic functions": "Логарифмдик функциялар",
    "linear functions": "Сызыктуу функциялар",
    "quadratic functions": "Квадраттык функциялар",
    "radical functions": "Радикалдык функциялар",
    "exponential functions": "Экспоненциалдык функциялар",
    "trigonometric functions": "Тригонометриялык функциялар",
    "absolute value functions": "Модулу бар функциялар",
    "polynomial functions": "Полиномдук функциялар",
    "algebraic functions": "Алгебралык функциялар",
    "power functions": "Даражалык функциялар",
    "inverse functions": "Кери функциялар",
    "functions and domains": "Функциялар жана аныкталуу чөйрөсү",
    "continuity": "Үзгүлтүксүздүк",
    "uniform continuity": "Бирдей үзгүлтүксүздүк",
    "tangents and normals": "Жанамалар жана нормалдар",
    "maxima and minima": "Максимум жана минимум",
    "curvature": "Ийриlik",
    "extremum of a function of several variables": "Бир нече өзгөрмөлүү функциянын экстремуму",
    "surfaces and volumes": "Беттер жана көлөмдөр",
    "volumes of solids": "Телолордун көлөмдөрү",
    "volumes of revolution": "Айлануу денесинин көлөмү",
    "arc length": "Доганын узундугу",
    "area in polar coordinates": "Полярдык координаталардагы аянт",
    "gradient": "Градиент",
    "potential energy": "Потенциалдык энергия",
    "permutations": "Которуштуруулар",
    "combinations": "Айкалыштар",
    "divisibility": "Бөлүнүүчүлүк",
    "divisibility of integers": "Бүтүн сандардын бөлүнүүчүлүгү",
    "last digit": "Акыркы цифра",
    "radicals": "Радикалдар",
    "polynomials": "Полиномдор",
    "factorials": "Факториалдар",
    "exponents": "Даражалар",
    "roots": "Тамырлар",
    "differential equations": "Дифференциалдык теңдемелер",
    "upper and lower bounds": "Жогорку жана төмөнкү чектер",
}

import re as _re

def _apply_kg_topic_translation(title: str) -> str:
    """Translate English topic prefix to Kyrgyz, preserve source book suffix."""
    m = _re.match(r"^(.+?)\s*\((.+)\)$", title)
    if m:
        topic_en = m.group(1).strip().lower()
        source   = m.group(2).strip()
        kg = _TOPIC_KG_MAP.get(topic_en)
        return f"{kg} ({source})" if kg else title
    kg = _TOPIC_KG_MAP.get(title.strip().lower())
    return kg if kg else title


# ── Route: list templates for a category (teacher topic cascade) ──────────────

@router.get("/templates", response_model=list[TaskTemplateInfo])
async def list_templates(
    category_id: uuid.UUID,
    locale: str = Depends(get_locale),
    db: AsyncSession = Depends(get_db),
):
    """
    Return active templates for a given category, with titles resolved by locale.
    Used by the teacher UI for the cascading topic dropdown.
    """
    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.category_id == category_id,
            TaskTemplate.is_active.is_(True),
        )
    )
    templates = result.scalars().all()
    items = []
    for t in templates:
        title = t.get_title(locale)
        if locale == "kg":
            title = _apply_kg_topic_translation(title)
        items.append(TaskTemplateInfo(id=t.id, title=title, difficulty=t.difficulty))
    return items


# ── Route: generate JSON preview (LibraryPage inline view) ────────────────────

@router.post("/generate", response_model=GenerateTaskResponse)
async def generate_tasks(
    payload: GenerateTaskRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate tasks and return them as JSON for the inline LibraryPage preview.
    Costs TOKEN_COST_PDF tokens.  Does NOT compile a PDF.
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_ADAPTIVE, db)

    generated = await _generate_tasks(payload, locale, db)

    return GenerateTaskResponse(
        pdf_url=None,
        tasks=[GeneratedTask(**t) for t in generated],
    )


# ── Route: generate + compile to PDF (TeacherGenerator download) ──────────────

@router.post("/generate/pdf")
async def generate_tasks_pdf(
    payload: GenerateTaskRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Full pipeline: SymPy generation → pdflatex compilation → PDF download.

    Steps:
      1. Deduct TOKEN_COST_PDF tokens atomically (fail 402 if insufficient).
      2. Fetch active templates and run TaskGenerator for each question.
      3. Compile to PDF via pdflatex (runs in thread pool, ~3–20 s).
      4. Return the raw PDF bytes with Content-Disposition: attachment.

    Token is deducted before compilation.  If pdflatex fails after deduction,
    the charge still applies (the SymPy generation work was done).
    """
    user_id = uuid.UUID(current_user.sub)

    # Step 1 — Deduct tokens before doing any work
    await _deduct_tokens(user_id, TOKEN_COST_PDF, db)

    # Step 2 — Fetch category name for the worksheet title
    cat_result = await db.execute(
        select(Category).where(Category.id == payload.category_id)
    )
    category = cat_result.scalar_one_or_none()
    category_name = category.get_name(locale) if category else "Worksheet"
    difficulty_label = payload.difficulty.capitalize()
    title = f"{category_name} — {difficulty_label}"

    # Step 3 — SymPy task generation for each variant independently
    variants_tasks: list[list[dict]] = []
    for _ in range(payload.variant_count):
        variant_tasks = await _generate_tasks(payload, locale, db)
        variants_tasks.append(variant_tasks)

    # Step 4 — Compile PDF (blocking work runs in thread pool)
    try:
        pdf_bytes = await compile_latex_to_pdf(
            title=title,
            variants_tasks=variants_tasks,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    # Step 5 — Return raw PDF
    filename = f"mathforge_{payload.difficulty}_{payload.variant_count}v_{payload.count}q.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Route: practice by topic (student-accessible, 1 token) ───────────────────

@router.post("/generate/practice", response_model=GenerateTaskResponse)
async def generate_practice_tasks(
    payload: GenerateTaskRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate practice tasks for a specific category + difficulty.
    Accessible to all authenticated roles (students use it for self-practice).
    Costs 1 token (same as adaptive).
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_ADAPTIVE, db)
    generated = await _generate_tasks(payload, locale, db)
    await _log_activity(user_id, db)
    return GenerateTaskResponse(
        pdf_url=None,
        tasks=[GeneratedTask(**t) for t in generated[: payload.count]],
    )


# ── Route: adaptive practice (weakest categories, JSON) ───────────────────────

@router.post("/generate/adaptive", response_model=GenerateTaskResponse)
async def generate_adaptive_tasks(
    payload: AdaptiveGenerateRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Adaptive practice mode — generates tasks from the user's weakest categories.

    Steps:
      1. Deduct TOKEN_COST_ADAPTIVE tokens (1 token).
      2. Query student_tracking sorted by mastery_level ASC → take top 3 weakest.
         If no tracking data yet, fall back to the first 3 available categories.
      3. Distribute `count` tasks across the weak categories.
      4. If no templates found at requested difficulty → fall back to 'easy'.
      5. Return JSON tasks (no PDF compilation).

    Accessible to all authenticated roles (students use it for practice,
    teachers for preview).
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_ADAPTIVE, db)

    # Step 2 — Find the 3 weakest categories from student_tracking
    tracking_result = await db.execute(
        select(StudentTracking)
        .where(StudentTracking.user_id == user_id)
        .order_by(StudentTracking.mastery_level.asc())
        .limit(3)
    )
    weak_trackings = tracking_result.scalars().all()

    if weak_trackings:
        weak_category_ids = [t.category_id for t in weak_trackings]
    else:
        # No tracking data yet — cold start: use first 3 available categories
        cat_result = await db.execute(select(Category).limit(3))
        first_cats = cat_result.scalars().all()
        weak_category_ids = [cat.id for cat in first_cats]

    if not weak_category_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Категории не найдены. Обратитесь к администратору для заполнения базы данных.",
        )

    # Step 3 — Generate tasks distributed across weak categories
    per_cat = max(1, payload.count // len(weak_category_ids))
    all_tasks: list[dict] = []

    async def _try_generate(cat_ids: list, difficulty: str) -> list[dict]:
        """Try to generate tasks for each category at the given difficulty."""
        results: list[dict] = []
        for cat_id in cat_ids:
            if len(results) >= payload.count:
                break
            try:
                tasks = await _generate_tasks(
                    GenerateTaskRequest(
                        category_id=cat_id,
                        difficulty=difficulty,
                        count=per_cat,
                    ),
                    locale,
                    db,
                )
                results.extend(tasks)
            except HTTPException:
                continue  # no templates for this category+difficulty — skip
        return results

    # First pass: requested difficulty on weak categories
    all_tasks = await _try_generate(weak_category_ids, payload.difficulty)

    # Second pass: if nothing found, try ALL categories at requested difficulty
    if not all_tasks:
        all_cats_result = await db.execute(select(Category))
        all_cat_ids = [c.id for c in all_cats_result.scalars().all()
                       if c.id not in weak_category_ids]
        all_tasks = await _try_generate(all_cat_ids, payload.difficulty)

    # Third pass: difficulty fallback — try easy across ALL categories
    if not all_tasks and payload.difficulty != "easy":
        all_cats_result2 = await db.execute(select(Category))
        all_cat_ids2 = [c.id for c in all_cats_result2.scalars().all()]
        all_tasks = await _try_generate(all_cat_ids2, "easy")

    if not all_tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Не найдено шаблонов задач. "
                "Обратитесь к преподавателю или администратору."
            ),
        )

    await _log_activity(user_id, db)

    return GenerateTaskResponse(
        pdf_url=None,
        tasks=[GeneratedTask(**t) for t in all_tasks[: payload.count]],
    )


# ── ORT exam generation (string-concatenation LaTeX, no Jinja2) ───────────────

_HEAD_TEX = Path(__file__).parent.parent.parent / "templates" / "tex" / "head.tex"

_ORT_LABELS: dict[str, dict] = {
    "ru": {
        "title": "ОРТ --- Математика",
        "variant": "Вариант",
        "part1_title": "Часть I --- Сравнение",
        "part2_title": "Часть II --- Выбор ответа",
        "col_a_name": "Колонка А",
        "col_b_name": "Колонка Б",
        "instruction1": (
            r"\textbf{Инструкция.} Сравните значения в Колонке А и Колонке Б. "
            r"Выберите ответ: \textbf{А}~--- если А $>$ Б;\quad"
            r"\textbf{Б}~--- если А $<$ Б;\quad"
            r"\textbf{В}~--- если А $=$ Б;\quad"
            r"\textbf{Г}~--- если определить невозможно."
        ),
        "instruction2": (
            r"\textbf{Инструкция.} Для каждого задания выберите один правильный "
            r"ответ из пяти предложенных вариантов "
            r"(\textbf{А}, \textbf{Б}, \textbf{В}, \textbf{Г}, \textbf{Д})."
        ),
        "answer_key": "Ключ ответов (для учителя)",
        "part1_key": "Часть I",
        "part2_key": "Часть II",
    },
    "en": {
        "title": "ORT --- Mathematics",
        "variant": "Variant",
        "part1_title": "Part I --- Comparison",
        "part2_title": "Part II --- Multiple Choice",
        "col_a_name": "Column A",
        "col_b_name": "Column B",
        "instruction1": (
            r"\textbf{Instructions.} Compare Column A and Column B. "
            r"Choose: \textbf{A}~--- if A $>$ B;\quad"
            r"\textbf{B}~--- if A $<$ B;\quad"
            r"\textbf{C}~--- if A $=$ B;\quad"
            r"\textbf{D}~--- if it cannot be determined."
        ),
        "instruction2": (
            r"\textbf{Instructions.} Choose one correct answer from five options "
            r"(\textbf{A}, \textbf{B}, \textbf{C}, \textbf{D}, \textbf{E})."
        ),
        "answer_key": "Answer Key (for teacher)",
        "part1_key": "Part I",
        "part2_key": "Part II",
    },
    "kg": {
        "title": "ОРТ --- Математика",
        "variant": "Вариант",
        "part1_title": "I бөлүк --- Салыштыруу",
        "part2_title": "II бөлүк --- Жооп тандоо",
        "col_a_name": "А Мамычасы",
        "col_b_name": "Б Мамычасы",
        "instruction1": (
            r"\textbf{Нускама.} А жана Б Мамычаларындагы маанилерди салыштырыңыз. "
            r"Жооп тандаңыз: \textbf{А}~--- А $>$ Б болсо;\quad"
            r"\textbf{Б}~--- А $<$ Б болсо;\quad"
            r"\textbf{В}~--- А $=$ Б болсо;\quad"
            r"\textbf{Г}~--- аныкталбаса."
        ),
        "instruction2": (
            r"\textbf{Нускама.} Ар бир тапшырма үчүн бештен берилген вариантардан "
            r"(\textbf{А}, \textbf{Б}, \textbf{В}, \textbf{Г}, \textbf{Д}) "
            r"бир туура жооп тандаңыз."
        ),
        "answer_key": "Жооптордун ачкычы (мугалим үчүн)",
        "part1_key": "I бөлүк",
        "part2_key": "II бөлүк",
    },
}


def _render_cmp_problem(p: dict, col_a_name: str, col_b_name: str) -> str:
    """Render one ORT Part 1 comparison problem as LaTeX using TikZ rectangles."""
    n = p["number"]
    given = p["given"]
    col_a = p["col_a_label"]
    col_b = p["col_b_label"]

    s = "\\needspace{5\\baselineskip}\n"
    s += f"\\noindent\\textbf{{{n}.}}\\ {given}\n\n"
    s += "\\noindent\n"
    # Column A box
    s += "\\begin{tikzpicture}[scale=1.0]\n"
    s += "  \\draw[thick] (0,0) rectangle (5,2.5);\n"
    s += f"  \\node at (2.5,2.1) {{\\small\\textbf{{{col_a_name}}}}};\n"
    s += f"  \\path (0,1.1) -- (5,1.1) node[midway] {{{col_a}}};\n"
    s += "\\end{tikzpicture}%\n"
    s += "\\hspace{1.5cm}%\n"
    # Column B box
    s += "\\begin{tikzpicture}[scale=1.0]\n"
    s += "  \\draw[thick] (0,0) rectangle (5,2.5);\n"
    s += f"  \\node at (2.5,2.1) {{\\small\\textbf{{{col_b_name}}}}};\n"
    s += f"  \\path (0,1.1) -- (5,1.1) node[midway] {{{col_b}}};\n"
    s += "\\end{tikzpicture}\n\n"
    s += "\\vspace{0.4cm}\n\n"
    return s


def _render_ort_mc_problem(p: dict) -> str:
    """Render one ORT Part 2 multiple-choice problem as LaTeX."""
    mc_labels = ["А", "Б", "В", "Г", "Д"]
    n = p["number"]
    question = p["question"]
    choices = p["choices"]

    s = "\\needspace{3\\baselineskip}\n"
    s += f"\\noindent\\textbf{{{n}.}}\\ {question}\n\n"
    s += "\\noindent "
    parts = [f"\\textbf{{{lbl})}}~${ch}$" for lbl, ch in zip(mc_labels, choices)]
    s += "\\quad ".join(parts)
    s += "\n\n"
    s += "\\vspace{0.3cm}\n\n"
    return s


def _render_answer_key_table(problems: list[dict], answer_field: str, part_label: str) -> str:
    """Render a compact 5-column answer key table for up to 30 problems."""
    answers = [p[answer_field] for p in problems]
    n = len(answers)
    rows = (n + 4) // 5  # ceil(n/5)

    s = "\\begin{center}\n"
    s += f"\\textbf{{{part_label}}}\n\n"
    s += "\\begin{tabular}{|c|c||c|c||c|c||c|c||c|c|}\n"
    s += "\\hline\n"
    s += (
        "\\textbf{№} & \\textbf{Отв.} & "
        "\\textbf{№} & \\textbf{Отв.} & "
        "\\textbf{№} & \\textbf{Отв.} & "
        "\\textbf{№} & \\textbf{Отв.} & "
        "\\textbf{№} & \\textbf{Отв.} \\\\\n"
    )
    s += "\\hline\n"
    for row in range(rows):
        cells: list[str] = []
        for col in range(5):
            idx = row + col * rows
            if idx < n:
                cells += [str(idx + 1), answers[idx]]
            else:
                cells += ["", ""]
        s += " & ".join(cells) + " \\\\\n"
        s += "\\hline\n"
    s += "\\end{tabular}\n"
    s += "\\end{center}\n"
    return s


def _build_ort_exam_sync(variant_count: int, locale: str) -> bytes:
    """
    Build the full ORT exam LaTeX source via string concatenation
    (prototype approach — no Jinja2), then compile with pdflatex.
    Runs in a thread-pool executor — never called on the async event loop.
    """
    lbl = _ORT_LABELS.get(locale, _ORT_LABELS["ru"])
    preamble = _HEAD_TEX.read_text(encoding="utf-8")

    final_output = preamble + "\n"

    for v in range(1, variant_count + 1):
        if v > 1:
            final_output += "\\newpage\n\n"

        # ── Variant header ────────────────────────────────────────────────────
        final_output += "\\begin{center}\n"
        final_output += f"  \\Large\\textbf{{{lbl['title']}}}\\\\[4pt]\n"
        final_output += f"  \\large\\textbf{{{lbl['variant']} {v}}}\n"
        final_output += "\\end{center}\n"
        final_output += "\\vspace{0.5cm}\n\n"

        # ── Part 1 ────────────────────────────────────────────────────────────
        part1 = generate_ort_part1(30, locale)

        final_output += "\\begin{center}\n"
        final_output += f"  \\large\\textbf{{{lbl['part1_title']}}}\n"
        final_output += "\\end{center}\n"
        final_output += "\\vspace{0.2cm}\n"
        final_output += lbl["instruction1"] + "\n"
        final_output += "\\vspace{0.5cm}\n\n"

        for p in part1:
            final_output += _render_cmp_problem(p, lbl["col_a_name"], lbl["col_b_name"])

        # ── Part 2 ────────────────────────────────────────────────────────────
        final_output += "\\newpage\n\n"
        part2 = generate_ort_part2(30, locale)

        final_output += "\\begin{center}\n"
        final_output += f"  \\large\\textbf{{{lbl['part2_title']}}}\n"
        final_output += "\\end{center}\n"
        final_output += "\\vspace{0.2cm}\n"
        final_output += lbl["instruction2"] + "\n"
        final_output += "\\vspace{0.5cm}\n\n"

        for p in part2:
            final_output += _render_ort_mc_problem(p)

        # ── Answer key ────────────────────────────────────────────────────────
        final_output += "\\newpage\n\n"
        final_output += "\\begin{center}\n"
        final_output += f"  \\Large\\textbf{{{lbl['answer_key']}}}\\\\[4pt]\n"
        final_output += f"  \\large {lbl['variant']} {v}\n"
        final_output += "\\end{center}\n"
        final_output += "\\vspace{0.5cm}\n\n"
        final_output += _render_answer_key_table(part1, "answer_label", lbl["part1_key"])
        final_output += "\\vspace{1cm}\n\n"
        final_output += _render_answer_key_table(part2, "correct_label", lbl["part2_key"])

    final_output += "\n\\end{document}\n"
    return _compile_sync(final_output)


# ── Route: ORT exam PDF generation ───────────────────────────────────────────

@router.post("/generate-ort")
async def generate_ort_exam(
    payload: OrtVariantRequest,
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a full ORT exam PDF (Part I comparison + Part II multiple-choice).

    Steps:
      1. Deduct 5 tokens atomically.
      2. Run SymPy ORT generators (Part 1 + Part 2) in thread pool.
      3. Build LaTeX via string concatenation — preamble from head.tex,
         TikZ rectangles for Part 1, enumerate-style choices for Part 2.
      4. Compile with pdflatex in a temp directory.
      5. Return raw PDF bytes.

    Costs 5 tokens per call regardless of variant_count.
    """
    user_id = uuid.UUID(current_user.sub)
    await _deduct_tokens(user_id, TOKEN_COST_PDF, db)

    loop = asyncio.get_running_loop()
    try:
        pdf_bytes = await loop.run_in_executor(
            None, _build_ort_exam_sync, payload.variant_count, locale
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    filename = f"ort_exam_{payload.variant_count}v.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )