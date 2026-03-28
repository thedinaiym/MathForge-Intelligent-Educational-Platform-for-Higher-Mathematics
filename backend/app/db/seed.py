"""
Database seeder — runs at startup if categories table is empty.
Idempotent: checks row count before inserting anything.
"""
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Category, TaskTemplate


# ── Category definitions ──────────────────────────────────────────────────────

CATEGORIES = [
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "name_translations": {
            "en": "Calculus",
            "ru": "Математический анализ",
            "kg": "Математикалык анализ",
        },
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "name_translations": {
            "en": "Linear Algebra",
            "ru": "Линейная алгебра",
            "kg": "Сызыктуу алгебра",
        },
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
        "name_translations": {
            "en": "ORT Math",
            "ru": "ОРТ Математика",
            "kg": "ОРТ Математика",
        },
    },
]

# ── Task template definitions ─────────────────────────────────────────────────

TEMPLATES = [
    # ── Calculus ──────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000001"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "difficulty": "easy",
        "title_translations": {
            "en": "Linear Equation",
            "ru": "Линейное уравнение",
            "kg": "Сызыктуу теңдеме",
        },
        "template_json": {
            "topic": "linear_equation",
            "sympy_expr": "A*x + B",
            "ranges": {"A": [1, 9], "B": [-20, 20]},
            "constraints": ["A != 0"],
            "texts": {
                "en": "Solve: {expr} = 0",
                "ru": "Решите уравнение: {expr} = 0",
                "kg": "Теңдемени чечиңиз: {expr} = 0",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000002"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "difficulty": "medium",
        "title_translations": {
            "en": "Quadratic Equation",
            "ru": "Квадратное уравнение",
            "kg": "Квадраттык теңдеме",
        },
        "template_json": {
            "topic": "quadratic_equation",
            "sympy_expr": "A*x**2 + B*x + C",
            "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
            "constraints": ["B**2 - 4*A*C >= 0"],
            "texts": {
                "en": "Solve: {expr} = 0",
                "ru": "Решите уравнение: {expr} = 0",
                "kg": "Теңдемени чечиңиз: {expr} = 0",
            },
        },
        "is_active": True,
    },
    # ── Linear Algebra ────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000001"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "difficulty": "easy",
        "title_translations": {
            "en": "2×2 Determinant",
            "ru": "Определитель 2×2",
            "kg": "2×2 Детерминант",
        },
        "template_json": {
            "topic": "determinant_2x2",
            "sympy_expr": "A*D - B*C",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "C": [-5, 5], "D": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Find the determinant of matrix [[A, B], [C, D]]: {expr}",
                "ru": "Найдите определитель матрицы [[A, B], [C, D]]: {expr}",
                "kg": "[[A, B], [C, D]] матрицасынын детерминантын табыңыз: {expr}",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000002"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "difficulty": "medium",
        "title_translations": {
            "en": "Dot Product",
            "ru": "Скалярное произведение",
            "kg": "Скалярдык көбөйтүү",
        },
        "template_json": {
            "topic": "dot_product",
            "sympy_expr": "A*D + B*E + C*F",
            "ranges": {
                "A": [-5, 5], "B": [-5, 5], "C": [-5, 5],
                "D": [-5, 5], "E": [-5, 5], "F": [-5, 5],
            },
            "constraints": [],
            "texts": {
                "en": "Find the dot product of vectors (A, B, C) and (D, E, F): {expr}",
                "ru": "Найдите скалярное произведение векторов (A, B, C) и (D, E, F): {expr}",
                "kg": "(A, B, C) жана (D, E, F) векторлорунун скалярдык көбөйтүүсүн табыңыз: {expr}",
            },
        },
        "is_active": True,
    },
    # ── ORT Math ──────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000001"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
        "difficulty": "easy",
        "title_translations": {
            "en": "Percentage Problem",
            "ru": "Задача на проценты",
            "kg": "Пайыздык масала",
        },
        "template_json": {
            "topic": "percentage",
            "sympy_expr": "A * B / 100",
            "ranges": {"A": [100, 1000], "B": [5, 50]},
            "constraints": [],
            "texts": {
                "en": "Find {B}% of {A}: {expr}",
                "ru": "Найдите {B}% от {A}: {expr}",
                "kg": "{A} санынын {B}% табыңыз: {expr}",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000002"),
        "category_id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
        "difficulty": "medium",
        "title_translations": {
            "en": "Arithmetic Progression",
            "ru": "Арифметическая прогрессия",
            "kg": "Арифметикалык прогрессия",
        },
        "template_json": {
            "topic": "arithmetic_progression",
            "sympy_expr": "A + (N - 1) * D",
            "ranges": {"A": [1, 20], "D": [1, 10], "N": [5, 15]},
            "constraints": [],
            "texts": {
                "en": "Find the {N}-th term of AP with first term {A} and common difference {D}: {expr}",
                "ru": "Найдите {N}-й член АП с первым членом {A} и разностью {D}: {expr}",
                "kg": "Биринчи мүчөсү {A}, айырмасы {D} болгон АП нын {N}-мүчөсүн табыңыз: {expr}",
            },
        },
        "is_active": True,
    },
]


async def seed_database(db: AsyncSession) -> None:
    """Insert seed data if the categories table is empty. Fully idempotent."""

    count = await db.scalar(select(func.count()).select_from(Category))
    if count and count > 0:
        return  # Already seeded — nothing to do

    print("🌱 Seeding database with initial categories and templates...")

    for cat_data in CATEGORIES:
        db.add(Category(**cat_data))

    await db.flush()  # ensure category PKs exist before template FKs

    for tmpl_data in TEMPLATES:
        db.add(TaskTemplate(**tmpl_data))

    await db.commit()
    print(f"✅ Seeded {len(CATEGORIES)} categories and {len(TEMPLATES)} templates.")
