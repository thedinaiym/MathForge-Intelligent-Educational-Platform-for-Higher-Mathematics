"""
SQLAlchemy ORM models matching the CLAUDE.md database schema.
All user-facing text uses JSONB columns for multilingual support.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    """Platform user. Role is stored here, not delegated to Supabase metadata."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    role: Mapped[str] = mapped_column(
        SAEnum("admin", "teacher", "student", name="user_role"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    locale: Mapped[str] = mapped_column(
        SAEnum("en", "ru", "kg", name="user_locale"), default="ru", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    # Student → Teacher link. Students enter the teacher's UUID to join a class.
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, default=None
    )

    # Relationships
    billing_account: Mapped["BillingAccount"] = relationship(
        "BillingAccount", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    tracking_records: Mapped[list["StudentTracking"]] = relationship(
        "StudentTracking", back_populates="user", cascade="all, delete-orphan"
    )


class BillingAccount(Base):
    """Token wallet for a user. Balance must be >= 0 (enforced by DB constraint)."""

    __tablename__ = "billing_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    token_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Date of last daily bonus credit (NULL = never received)
    last_daily_bonus: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)

    __table_args__ = (
        CheckConstraint("token_balance >= 0", name="ck_billing_token_balance_non_negative"),
    )

    user: Mapped["User"] = relationship("User", back_populates="billing_account")


class Category(Base):
    """
    Math topic category (e.g. Calculus, Linear Algebra).
    name_translations JSONB: {"en": "Calculus", "ru": "Матанализ", "kg": "..."}
    """

    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name_translations: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Relationships
    task_templates: Mapped[list["TaskTemplate"]] = relationship(
        "TaskTemplate", back_populates="category"
    )
    tracking_records: Mapped[list["StudentTracking"]] = relationship(
        "StudentTracking", back_populates="category"
    )

    def get_name(self, locale: str = "ru") -> str:
        """Resolve the translated name for the given locale."""
        return self.name_translations.get(locale) or self.name_translations.get("ru", "")


class TaskTemplate(Base):
    """
    Template driving SymPy task generation. All math rules live in template_json.

    template_json shape (example):
    {
        "topic": "quadratic_equation",
        "sympy_expr": "A*x**2 + B*x + C",
        "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
        "constraints": ["B**2 - 4*A*C >= 0"],
        "texts": {
            "en": "Solve: {expr} = 0",
            "ru": "Решите уравнение: {expr} = 0",
            "kg": "Теңдемени чечиңиз: {expr} = 0"
        }
    }
    """

    __tablename__ = "task_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    difficulty: Mapped[str] = mapped_column(
        SAEnum("easy", "medium", "hard", name="difficulty_level"), nullable=False
    )
    title_translations: Mapped[dict] = mapped_column(JSONB, nullable=False)
    template_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    category: Mapped["Category"] = relationship("Category", back_populates="task_templates")

    def get_title(self, locale: str = "ru") -> str:
        """Resolve the translated title for the given locale."""
        return self.title_translations.get(locale) or self.title_translations.get("ru", "")


class StudentTracking(Base):
    """Per-student, per-category mastery tracking."""

    __tablename__ = "student_tracking"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    mastery_level: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    last_error_type: Mapped[str | None] = mapped_column(String, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="tracking_records")
    category: Mapped["Category"] = relationship("Category", back_populates="tracking_records")


class Classroom(Base):
    """
    A virtual classroom created by a teacher.
    Students join via a short alphanumeric join_code.
    """

    __tablename__ = "classrooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    join_code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])
    members: Mapped[list["ClassroomMember"]] = relationship(
        "ClassroomMember", back_populates="classroom", cascade="all, delete-orphan"
    )


class ClassroomMember(Base):
    """Join table linking students to classrooms."""

    __tablename__ = "classroom_members"

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    classroom: Mapped["Classroom"] = relationship("Classroom", back_populates="members")
    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])


class VideoLesson(Base):
    """
    A video lesson uploaded by a teacher and assigned to a classroom.
    The actual video file lives in Supabase Storage (bucket: video_lessons).
    video_url is the public Supabase Storage URL returned after upload.
    """

    __tablename__ = "video_lessons"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    video_url: Mapped[str] = mapped_column(String, nullable=False)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])
    classroom: Mapped["Classroom"] = relationship("Classroom", foreign_keys=[classroom_id])


class ActivityLog(Base):
    """
    Daily activity counter per user — drives the GitHub-style heatmap.

    One row per (user, date). Upserted via PostgreSQL ON CONFLICT DO UPDATE
    so the count increments atomically rather than inserting duplicates.
    """

    __tablename__ = "activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    activity_date: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "activity_date", name="uq_activity_user_date"),
    )

    user: Mapped["User"] = relationship("User")
