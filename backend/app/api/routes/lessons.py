"""
Video Lessons routes — Phase 22.

Upload flow:
  1. Frontend uploads the video file directly to Supabase Storage (bucket: video_lessons)
     using the Supabase JS client and gets back a public URL.
  2. Frontend calls POST /api/lessons with title, description, classroom_id, video_url.
  3. Backend validates classroom ownership and saves the metadata record.

Endpoints:
  POST   /api/lessons                         Teacher creates a lesson record
  GET    /api/lessons/classroom/{id}          Teacher fetches lessons for their classroom
  GET    /api/lessons/student                 Student fetches lessons from enrolled classrooms
  DELETE /api/lessons/{id}                    Teacher deletes their lesson
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, require_role
from app.db.database import get_db
from app.db.models import Classroom, ClassroomMember, VideoLesson
from app.models.schemas import TokenPayload

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateLessonRequest(BaseModel):
    classroom_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    video_url: str = Field(..., description="Public Supabase Storage URL of the uploaded video")
    duration_sec: int | None = Field(default=None, ge=0)


class LessonResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    classroom_id: uuid.UUID
    classroom_name: str
    title: str
    description: str | None
    video_url: str
    duration_sec: int | None
    created_at: datetime


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=LessonResponse)
async def create_lesson(
    payload: CreateLessonRequest,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    """
    Save a video lesson metadata record.
    The teacher must own the target classroom.
    """
    teacher_id = uuid.UUID(current_user.sub)

    # Verify the classroom belongs to this teacher
    result = await db.execute(
        select(Classroom).where(
            Classroom.id == payload.classroom_id,
            Classroom.teacher_id == teacher_id,
        )
    )
    classroom = result.scalar_one_or_none()
    if classroom is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found or you do not own it.",
        )

    lesson = VideoLesson(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        classroom_id=payload.classroom_id,
        title=payload.title.strip(),
        description=payload.description,
        video_url=payload.video_url,
        duration_sec=payload.duration_sec,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)

    return LessonResponse(
        id=lesson.id,
        teacher_id=lesson.teacher_id,
        classroom_id=lesson.classroom_id,
        classroom_name=classroom.name,
        title=lesson.title,
        description=lesson.description,
        video_url=lesson.video_url,
        duration_sec=lesson.duration_sec,
        created_at=lesson.created_at,
    )


@router.get("/classroom/{classroom_id}", response_model=list[LessonResponse])
async def get_classroom_lessons(
    classroom_id: uuid.UUID,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[LessonResponse]:
    """
    Return all video lessons in a classroom that the teacher owns.
    """
    teacher_id = uuid.UUID(current_user.sub)

    # Verify ownership
    cls_result = await db.execute(
        select(Classroom).where(
            Classroom.id == classroom_id,
            Classroom.teacher_id == teacher_id,
        )
    )
    classroom = cls_result.scalar_one_or_none()
    if classroom is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found or you do not own it.",
        )

    result = await db.execute(
        select(VideoLesson)
        .where(VideoLesson.classroom_id == classroom_id)
        .order_by(VideoLesson.created_at.desc())
    )
    lessons = result.scalars().all()

    return [
        LessonResponse(
            id=l.id,
            teacher_id=l.teacher_id,
            classroom_id=l.classroom_id,
            classroom_name=classroom.name,
            title=l.title,
            description=l.description,
            video_url=l.video_url,
            duration_sec=l.duration_sec,
            created_at=l.created_at,
        )
        for l in lessons
    ]


@router.get("/student", response_model=list[LessonResponse])
async def get_student_lessons(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LessonResponse]:
    """
    Return all video lessons from classrooms the current student is enrolled in.
    Access-controlled: only enrolled students see a lesson.
    """
    student_id = uuid.UUID(current_user.sub)

    # Fetch classroom IDs where the student is a member
    memberships = await db.execute(
        select(ClassroomMember.classroom_id).where(
            ClassroomMember.student_id == student_id
        )
    )
    classroom_ids = [row[0] for row in memberships.all()]

    if not classroom_ids:
        return []

    result = await db.execute(
        select(VideoLesson, Classroom)
        .join(Classroom, VideoLesson.classroom_id == Classroom.id)
        .where(VideoLesson.classroom_id.in_(classroom_ids))
        .order_by(VideoLesson.created_at.desc())
    )
    rows = result.all()

    return [
        LessonResponse(
            id=lesson.id,
            teacher_id=lesson.teacher_id,
            classroom_id=lesson.classroom_id,
            classroom_name=classroom.name,
            title=lesson.title,
            description=lesson.description,
            video_url=lesson.video_url,
            duration_sec=lesson.duration_sec,
            created_at=lesson.created_at,
        )
        for lesson, classroom in rows
    ]


@router.get("/teacher", response_model=list[LessonResponse])
async def get_teacher_all_lessons(
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[LessonResponse]:
    """Return all lessons uploaded by this teacher across all their classrooms."""
    teacher_id = uuid.UUID(current_user.sub)

    result = await db.execute(
        select(VideoLesson, Classroom)
        .join(Classroom, VideoLesson.classroom_id == Classroom.id)
        .where(VideoLesson.teacher_id == teacher_id)
        .order_by(VideoLesson.created_at.desc())
    )
    rows = result.all()

    return [
        LessonResponse(
            id=lesson.id,
            teacher_id=lesson.teacher_id,
            classroom_id=lesson.classroom_id,
            classroom_name=classroom.name,
            title=lesson.title,
            description=lesson.description,
            video_url=lesson.video_url,
            duration_sec=lesson.duration_sec,
            created_at=lesson.created_at,
        )
        for lesson, classroom in rows
    ]


@router.delete("/{lesson_id}", status_code=200)
async def delete_lesson(
    lesson_id: uuid.UUID,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a video lesson record (teacher must own it).
    Note: the Supabase Storage file must be deleted separately from the frontend.
    """
    teacher_id = uuid.UUID(current_user.sub)

    result = await db.execute(
        select(VideoLesson).where(
            VideoLesson.id == lesson_id,
            VideoLesson.teacher_id == teacher_id,
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found or you do not own it.",
        )

    await db.delete(lesson)
    await db.commit()
    return {"deleted": str(lesson_id)}
