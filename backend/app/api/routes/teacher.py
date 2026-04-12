"""
Teacher-specific routes.

POST /api/teachers/upload-pdf
    Accepts a textbook PDF, runs the RAG pipeline, saves extracted templates
    as drafts (is_active=False), and returns a preview for the UI.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import asyncio

from app.api.dependencies import get_current_user, get_locale, require_role
from app.db.database import get_db
from app.db.models import Category, StudentTracking, TaskTemplate, User
from app.models.schemas import TokenPayload
from app.services.rag_parser import extract_templates_from_pdf_bytes
from app.services.translator import auto_translate_content, auto_translate_dict

router = APIRouter()

_MAX_PDF_MB = 20


# ── Response schema ───────────────────────────────────────────────────────────

class ExtractedTemplatePreview(BaseModel):
    saved_id: uuid.UUID
    topic: str
    difficulty: str
    sympy_expr: str
    title: dict[str, str]
    texts: dict[str, str]


class UploadPdfResponse(BaseModel):
    count: int
    category_id: str
    templates: list[ExtractedTemplatePreview]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/upload-pdf", response_model=UploadPdfResponse)
async def upload_pdf_and_extract_templates(
    file: UploadFile = File(
        ...,
        description="Textbook PDF (≤ 20 MB). First 10 pages are analysed.",
    ),
    category_id: str | None = Form(default=None, description="Target category UUID (optional)."),
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> UploadPdfResponse:
    """
    RAG pipeline: PDF upload → Groq template extraction → draft DB save.

    Steps:
      1. Validate content-type and file size.
      2. Extract text from first 5 pages with pypdf.
      3. Send text to Groq Llama-3 (strict JSON-mode prompt).
      4. Save each valid template as a draft TaskTemplate (is_active=False).
         An admin must approve it before students can practice with it.
      5. Return a preview list of extracted templates.

    Error handling:
      - 415 — not a PDF
      - 413 — file > 20 MB
      - 422 — unreadable PDF / LLM returned no templates
      - 502 — Groq API unreachable / invalid key
    """
    # ── 1. Validate content-type ─────────────────────────────────────────────
    ct = (file.content_type or "").lower()
    if ct not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted (.pdf).",
        )

    # ── 2. Read & size-check ─────────────────────────────────────────────────
    pdf_bytes = await file.read()

    if len(pdf_bytes) < 64:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file appears to be empty or corrupted.",
        )
    if len(pdf_bytes) > _MAX_PDF_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"PDF exceeds the {_MAX_PDF_MB} MB limit.",
        )

    # ── 3. RAG extraction ────────────────────────────────────────────────────
    try:
        raw_templates = await extract_templates_from_pdf_bytes(pdf_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    if not raw_templates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No math templates could be identified in this PDF. "
                "Upload a textbook with clearly stated parameterised problems "
                "(e.g. 'Solve Ax² + Bx + C = 0 for x')."
            ),
        )

    # ── 4. Resolve a category for the new templates ──────────────────────────
    # Prefer the caller-supplied category_id; fall back to first existing one;
    # last resort: create a placeholder so the FK constraint is satisfied.
    category = None
    if category_id:
        try:
            cat_uuid = uuid.UUID(category_id)
            cat_result = await db.execute(select(Category).where(Category.id == cat_uuid))
            category = cat_result.scalar_one_or_none()
        except (ValueError, Exception):
            category = None  # bad UUID — fall through to default

    if category is None:
        cat_result = await db.execute(select(Category).limit(1))
        category = cat_result.scalar_one_or_none()

    if category is None:
        category = Category(
            id=uuid.uuid4(),
            name_translations={
                "en": "Uploaded",
                "ru": "Uploaded",
                "kg": "Uploaded",
            },
        )
        db.add(category)
        await db.flush()  # materialize the ID before using it in FK

    # ── 5. Auto-translate all templates concurrently ─────────────────────────
    # Run translation for every template in parallel — one Groq call per
    # template (texts) + one per template (title), all gathered at once.
    # If translation fails for any template, it falls back gracefully.

    async def _enrich(tpl: dict) -> tuple[dict, dict]:
        """Return (title_translations, enriched_texts) for one template."""
        topic: str = str(tpl.get("topic", "unknown_topic"))
        label: str = topic.replace("_", " ").title()
        raw_texts: dict = tpl.get("texts", {})

        try:
            title_tr, texts_tr = await asyncio.gather(
                auto_translate_content(label, source_lang="ru"),
                auto_translate_dict(raw_texts, prefer_source="ru"),
            )
        except Exception:
            # Translation is best-effort; never block a successful PDF upload
            title_tr = {"en": label, "ru": label, "kg": label}
            texts_tr = {
                "en": raw_texts.get("en") or raw_texts.get("ru", ""),
                "ru": raw_texts.get("ru", ""),
                "kg": raw_texts.get("kg") or raw_texts.get("ru", ""),
            }

        return title_tr, texts_tr

    enriched = await asyncio.gather(*[_enrich(t) for t in raw_templates])

    # ── 6. Persist templates as drafts ───────────────────────────────────────
    previews: list[ExtractedTemplatePreview] = []

    for tpl, (title_translations, texts_tr) in zip(raw_templates, enriched):
        topic: str = str(tpl.get("topic", "unknown_topic"))
        difficulty: str = str(tpl.get("difficulty", "medium"))
        sympy_expr: str = str(tpl.get("sympy_expr", ""))

        record = TaskTemplate(
            id=uuid.uuid4(),
            category_id=category.id,
            difficulty=difficulty,
            title_translations={
                "en": title_translations.get("en", topic),
                "ru": title_translations.get("ru", topic),
                "kg": title_translations.get("kg", topic),
            },
            template_json={
                "topic": topic,
                "sympy_expr": sympy_expr,
                "ranges": tpl.get("ranges", {}),
                "constraints": tpl.get("constraints", []),
                "texts": texts_tr,
            },
            is_active=True,   # Teachers can upload and use immediately
        )
        db.add(record)

        previews.append(
            ExtractedTemplatePreview(
                saved_id=record.id,
                topic=topic,
                difficulty=difficulty,
                sympy_expr=sympy_expr,
                title={
                    "en": title_translations.get("en", topic),
                    "ru": title_translations.get("ru", topic),
                    "kg": title_translations.get("kg", topic),
                },
                texts=texts_tr,
            )
        )

    await db.commit()

    return UploadPdfResponse(
        count=len(previews),
        category_id=str(category.id),
        templates=previews,
    )


# ── Activate template ─────────────────────────────────────────────────────────

class ActivateResponse(BaseModel):
    id: uuid.UUID
    is_active: bool


@router.patch("/templates/{template_id}/activate", response_model=ActivateResponse)
async def activate_template(
    template_id: uuid.UUID,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ActivateResponse:
    """
    Activate a draft template so students can practice with it.

    Teachers can activate their own uploaded templates.
    Admins can activate any template.
    """
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found.",
        )

    template.is_active = True
    await db.commit()

    return ActivateResponse(id=template.id, is_active=True)


# ── Teacher class roster ──────────────────────────────────────────────────────

class StudentMasteryEntry(BaseModel):
    student_id: uuid.UUID
    student_name: str
    category_name: str
    mastery_level: float
    last_error_type: str | None


class StudentSummary(BaseModel):
    student_id: uuid.UUID
    student_name: str
    mastery: list[StudentMasteryEntry]


@router.get("/my-students", response_model=list[StudentSummary])
async def get_my_students(
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[StudentSummary]:
    """
    Return all students linked to this teacher, with per-category mastery data.
    Students link themselves by entering the teacher's UUID in their profile.
    """
    teacher_id = uuid.UUID(current_user.sub)

    # Fetch all students linked to this teacher
    students_result = await db.execute(
        select(User).where(User.teacher_id == teacher_id, User.role == "student")
    )
    students = students_result.scalars().all()

    summaries: list[StudentSummary] = []
    for student in students:
        tracking_result = await db.execute(
            select(StudentTracking, Category)
            .join(Category, StudentTracking.category_id == Category.id)
            .where(StudentTracking.user_id == student.id)
            .order_by(StudentTracking.mastery_level.asc())
        )
        rows = tracking_result.all()

        mastery = [
            StudentMasteryEntry(
                student_id=student.id,
                student_name=student.name,
                category_name=category.get_name(locale),
                mastery_level=round(min(tracking.mastery_level, 100.0), 1),
                last_error_type=tracking.last_error_type,
            )
            for tracking, category in rows
        ]

        summaries.append(StudentSummary(
            student_id=student.id,
            student_name=student.name,
            mastery=mastery,
        ))

    return summaries


class JoinClassRequest(BaseModel):
    teacher_id: uuid.UUID


@router.post("/join-class", status_code=200)
async def join_class(
    payload: JoinClassRequest,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Link a student to a teacher by the teacher's UUID.
    Students call this to join a class. Pass teacher_id=null to leave.
    """
    student_id = uuid.UUID(current_user.sub)

    # Verify teacher exists and has role teacher/admin
    teacher_result = await db.execute(
        select(User).where(User.id == payload.teacher_id)
    )
    teacher = teacher_result.scalar_one_or_none()

    if teacher is None or teacher.role not in ("teacher", "admin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found. Check the teacher ID.",
        )

    # Link the student
    student_result = await db.execute(select(User).where(User.id == student_id))
    student = student_result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")

    student.teacher_id = payload.teacher_id
    await db.commit()

    return {"teacher_name": teacher.name, "teacher_id": str(teacher.id)}
