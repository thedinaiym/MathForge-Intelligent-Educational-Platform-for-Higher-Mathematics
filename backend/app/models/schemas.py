"""
Pydantic schemas for MathForge API request/response validation.
All user-facing text fields are resolved from JSONB by locale before returning.
"""
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared / Base
# ---------------------------------------------------------------------------

LocaleType = Literal["en", "ru", "kg"]
RoleType = Literal["admin", "teacher", "student"]
DifficultyType = Literal["easy", "medium", "hard"]


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str
    role: RoleType
    locale: LocaleType = "ru"


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    role: RoleType
    locale: LocaleType
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

class BillingBalanceResponse(BaseModel):
    token_balance: float

    model_config = {"from_attributes": True}


class BillingPackage(BaseModel):
    id: str
    tokens: int
    price_soms: int
    label: str


class PurchaseRequest(BaseModel):
    package_id: Literal["pkg_100", "pkg_200"]


class PurchaseResponse(BaseModel):
    token_balance: float
    tokens_added: int
    message: str


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

class CategoryResponse(BaseModel):
    """Resolved category — name already translated into the request locale."""
    id: uuid.UUID
    name: str  # resolved from name_translations JSONB by locale


class CategoryCreate(BaseModel):
    name_translations: dict[LocaleType, str] = Field(
        example={"en": "Calculus", "ru": "Матанализ", "kg": "Матанализ"}
    )


# ---------------------------------------------------------------------------
# Task Templates
# ---------------------------------------------------------------------------

class TaskTemplateCreate(BaseModel):
    category_id: uuid.UUID
    difficulty: DifficultyType
    title_translations: dict[LocaleType, str]
    template_json: dict[str, Any] = Field(
        example={
            "topic": "quadratic_equation",
            "sympy_expr": "A*x**2 + B*x + C",
            "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
            "constraints": ["B**2 - 4*A*C >= 0"],
            "texts": {
                "en": "Solve: {expr} = 0",
                "ru": "Решите уравнение: {expr} = 0",
                "kg": "Теңдемени чечиңиз: {expr} = 0",
            },
        }
    )
    is_active: bool = True


class TaskTemplateResponse(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    difficulty: DifficultyType
    title: str  # resolved from title_translations by locale
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Task Generation
# ---------------------------------------------------------------------------

class GenerateTaskRequest(BaseModel):
    category_id: uuid.UUID
    difficulty: DifficultyType
    count: int = Field(default=10, ge=1, le=50)
    variant_count: int = Field(default=1, ge=1, le=5)
    template_id: uuid.UUID | None = Field(default=None)


class GeneratedTask(BaseModel):
    question_text: str
    condition_latex: str
    answer_latex: str


class TaskTemplateInfo(BaseModel):
    """Lightweight template info for cascading topic dropdown."""
    id: uuid.UUID
    title: str
    difficulty: DifficultyType


class GenerateTaskResponse(BaseModel):
    pdf_url: str | None = None
    tasks: list[GeneratedTask] = []


# ---------------------------------------------------------------------------
# Study / OCR Analysis
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    """
    Request body for POST /api/study/analyze.

    During Phase 3 the Vision OCR step is mocked: the client sends the
    already-extracted list of step strings directly.  The real OCR
    integration (Google Cloud Vision) is wired in Phase 5.
    """
    steps: list[str] = Field(..., min_length=2, description="Ordered list of solution steps.")
    category_id: uuid.UUID | None = Field(
        default=None,
        description="Optional: used to update student_tracking mastery level.",
    )


class AnalyzeResponse(BaseModel):
    status: Literal["correct", "error_found"]
    error_index: int | None = None   # 0-indexed step where the error was detected
    hint: str | None = None          # Natural language hint from Groq (NLP only)


# ---------------------------------------------------------------------------
# Student Tracking
# ---------------------------------------------------------------------------

class StudentTrackingResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    mastery_level: float
    last_error_type: str | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Stats / Heatmap / Mastery
# ---------------------------------------------------------------------------

class HeatmapEntry(BaseModel):
    date: str   # "YYYY-MM-DD"
    count: int


class MasteryEntry(BaseModel):
    category_id: uuid.UUID
    category_name: str
    mastery_percentage: float   # 0.0 – 100.0


class StatsResponse(BaseModel):
    heatmap_data: list[HeatmapEntry]
    mastery_data: list[MasteryEntry]
    total_analyses: int


# ---------------------------------------------------------------------------
# Adaptive task generation
# ---------------------------------------------------------------------------

class AdaptiveGenerateRequest(BaseModel):
    difficulty: DifficultyType = "easy"
    count: int = Field(default=10, ge=1, le=50)


# ---------------------------------------------------------------------------
# ORT (Общереспубликанское тестирование) — Kyrgyz National Testing
# ---------------------------------------------------------------------------

OrtPartType = Literal[1, 2]


class OrtGenerateRequest(BaseModel):
    """Request body for POST /api/ort/generate."""
    part: OrtPartType = Field(
        description="1 = comparison (Column A vs B), 2 = multiple-choice (5 options А–Д)"
    )
    count: int = Field(default=30, ge=1, le=30)
    locale: LocaleType = "ru"


class OrtComparisonProblem(BaseModel):
    """One comparison problem from ORT Part 1."""
    number: int
    given: str                  # localised condition, e.g. "$a = 5$"
    col_a_label: str            # LaTeX expression for Column A
    col_b_label: str            # LaTeX expression for Column B
    col_a_value: str            # computed value LaTeX (for answer key)
    col_b_value: str            # computed value LaTeX (for answer key)
    answer_label: Literal["А", "Б", "В", "Г"]  # А>B, A<B, A=B, cannot determine


class OrtMcProblem(BaseModel):
    """One multiple-choice problem from ORT Part 2."""
    number: int
    question: str               # localised question text (with concrete numbers)
    choices: list[str]          # 5 LaTeX strings, one per option А–Д
    correct_label: Literal["А", "Б", "В", "Г", "Д"]


class OrtGenerateResponse(BaseModel):
    part: OrtPartType
    problems: list[OrtComparisonProblem] | list[OrtMcProblem]
    answer_key: list[str]       # ["А", "Б", "В", ...] length == len(problems)


class OrtVariantRequest(BaseModel):
    """Request body for POST /api/tasks/generate-ort."""
    variant_count: int = Field(
        default=1, ge=1, le=5,
        description="Number of independent exam variants to generate (1–5).",
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TokenPayload(BaseModel):
    sub: str  # Supabase user UUID
    role: RoleType | None = None
