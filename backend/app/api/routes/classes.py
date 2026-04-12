"""
Classroom routes — Phase 21.

POST /api/classes              Teacher creates a classroom (gets a join_code)
GET  /api/classes/me           List teacher's own classrooms + enrolled students
GET  /api/classes/joined       List classrooms the current student has joined
POST /api/classes/join/{code}  Student joins a classroom by join_code
DELETE /api/classes/{id}       Teacher deletes their classroom
"""
from __future__ import annotations

import random
import string
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, require_role
from app.db.database import get_db
from app.db.models import Classroom, ClassroomMember, User
from app.models.schemas import TokenPayload

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_join_code(length: int = 6) -> str:
    """Return a random uppercase alphanumeric code, e.g. 'X7K2AQ'."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


async def _unique_join_code(db: AsyncSession, length: int = 6) -> str:
    """Generate a join code guaranteed to be unique in the DB."""
    for _ in range(10):
        code = _generate_join_code(length)
        existing = await db.execute(
            select(Classroom).where(Classroom.join_code == code)
        )
        if existing.scalar_one_or_none() is None:
            return code
    raise RuntimeError("Could not generate a unique join code after 10 attempts.")


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateClassroomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class StudentInfo(BaseModel):
    id: uuid.UUID
    name: str
    joined_at: datetime


class ClassroomResponse(BaseModel):
    id: uuid.UUID
    name: str
    join_code: str
    created_at: datetime
    student_count: int
    students: list[StudentInfo]


class JoinedClassroomResponse(BaseModel):
    id: uuid.UUID
    name: str
    join_code: str
    teacher_name: str
    joined_at: datetime


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=ClassroomResponse)
async def create_classroom(
    payload: CreateClassroomRequest,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ClassroomResponse:
    """Teacher creates a new virtual classroom and receives a unique join_code."""
    teacher_id = uuid.UUID(current_user.sub)
    join_code = await _unique_join_code(db)

    classroom = Classroom(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        name=payload.name.strip(),
        join_code=join_code,
    )
    db.add(classroom)
    await db.commit()
    await db.refresh(classroom)

    return ClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        join_code=classroom.join_code,
        created_at=classroom.created_at,
        student_count=0,
        students=[],
    )


@router.get("/me", response_model=list[ClassroomResponse])
async def list_my_classrooms(
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[ClassroomResponse]:
    """Return all classrooms owned by the current teacher, with enrolled students."""
    teacher_id = uuid.UUID(current_user.sub)

    result = await db.execute(
        select(Classroom)
        .where(Classroom.teacher_id == teacher_id)
        .options(selectinload(Classroom.members).selectinload(ClassroomMember.student))
        .order_by(Classroom.created_at.desc())
    )
    classrooms = result.scalars().all()

    return [
        ClassroomResponse(
            id=c.id,
            name=c.name,
            join_code=c.join_code,
            created_at=c.created_at,
            student_count=len(c.members),
            students=[
                StudentInfo(
                    id=m.student.id,
                    name=m.student.name,
                    joined_at=m.joined_at,
                )
                for m in c.members
            ],
        )
        for c in classrooms
    ]


@router.get("/joined", response_model=list[JoinedClassroomResponse])
async def list_joined_classrooms(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JoinedClassroomResponse]:
    """Return all classrooms the current student has joined."""
    student_id = uuid.UUID(current_user.sub)

    result = await db.execute(
        select(ClassroomMember)
        .where(ClassroomMember.student_id == student_id)
        .options(
            selectinload(ClassroomMember.classroom).selectinload(Classroom.teacher)
        )
        .order_by(ClassroomMember.joined_at.desc())
    )
    memberships = result.scalars().all()

    return [
        JoinedClassroomResponse(
            id=m.classroom.id,
            name=m.classroom.name,
            join_code=m.classroom.join_code,
            teacher_name=m.classroom.teacher.name,
            joined_at=m.joined_at,
        )
        for m in memberships
    ]


@router.post("/join/{join_code}", response_model=JoinedClassroomResponse)
async def join_classroom(
    join_code: str,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinedClassroomResponse:
    """Student joins a classroom by entering the teacher's join_code."""
    student_id = uuid.UUID(current_user.sub)

    # Resolve classroom
    result = await db.execute(
        select(Classroom)
        .where(Classroom.join_code == join_code.upper().strip())
        .options(selectinload(Classroom.teacher))
    )
    classroom = result.scalar_one_or_none()
    if classroom is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found. Check the join code and try again.",
        )

    # Prevent teacher from joining their own class
    if classroom.teacher_id == student_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot join your own classroom.",
        )

    # Idempotent: already a member → return existing membership
    existing = await db.execute(
        select(ClassroomMember).where(
            ClassroomMember.classroom_id == classroom.id,
            ClassroomMember.student_id == student_id,
        )
    )
    member = existing.scalar_one_or_none()
    if member is not None:
        return JoinedClassroomResponse(
            id=classroom.id,
            name=classroom.name,
            join_code=classroom.join_code,
            teacher_name=classroom.teacher.name,
            joined_at=member.joined_at,
        )

    # Create membership
    member = ClassroomMember(
        classroom_id=classroom.id,
        student_id=student_id,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return JoinedClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        join_code=classroom.join_code,
        teacher_name=classroom.teacher.name,
        joined_at=member.joined_at,
    )


@router.delete("/{classroom_id}", status_code=200)
async def delete_classroom(
    classroom_id: uuid.UUID,
    current_user: TokenPayload = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Teacher deletes their classroom (cascades to members)."""
    teacher_id = uuid.UUID(current_user.sub)

    result = await db.execute(
        select(Classroom).where(
            Classroom.id == classroom_id,
            Classroom.teacher_id == teacher_id,
        )
    )
    classroom = result.scalar_one_or_none()
    if classroom is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found or you do not own it.",
        )

    await db.delete(classroom)
    await db.commit()
    return {"deleted": str(classroom_id)}
