"""
Database seeder — runs on every startup using INSERT … ON CONFLICT DO NOTHING.

Safe to call repeatedly: existing rows are never touched, missing rows are
inserted automatically.  No manual admin step required for MVP.
"""
import uuid

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Category, TaskTemplate

# ── Fixed UUIDs keep the seed fully idempotent across restarts ────────────────

_CAT_CALCULUS      = uuid.UUID("00000000-0000-0000-0000-000000000001")
_CAT_LINEAR_ALG    = uuid.UUID("00000000-0000-0000-0000-000000000002")
_CAT_ORT           = uuid.UUID("00000000-0000-0000-0000-000000000003")

# ── Category rows ─────────────────────────────────────────────────────────────

CATEGORIES = [
    {
        "id": _CAT_CALCULUS,
        "name_translations": {
            "en": "Calculus",
            "ru": "Математический анализ",
            "kg": "Математикалык анализ",
        },
    },
    {
        "id": _CAT_LINEAR_ALG,
        "name_translations": {
            "en": "Linear Algebra",
            "ru": "Линейная алгебра",
            "kg": "Сызыктуу алгебра",
        },
    },
    {
        "id": _CAT_ORT,
        "name_translations": {
            "en": "ORT Math",
            "ru": "ОРТ Математика",
            "kg": "ОРТ Математика",
        },
    },
]

# ── Template rows ─────────────────────────────────────────────────────────────

TEMPLATES = [

    # ════════════════════════════════════════════════════════════════════════
    # Calculus
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {"en": "Linear Equation", "ru": "Линейное уравнение", "kg": "Сызыктуу теңдеме"},
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
        "id": uuid.UUID("10000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {"en": "Power Derivative", "ru": "Производная степени", "kg": "Даражанын туундусу"},
        "template_json": {
            "topic": "power_derivative",
            "sympy_expr": "A * N * x**(N-1)",
            "ranges": {"A": [1, 6], "N": [2, 5]},
            "constraints": [],
            "texts": {
                "en": "Find the derivative of f(x) = {A}x^{N}",
                "ru": "Найдите производную функции f(x) = {A}x^{N}",
                "kg": "f(x) = {A}x^{N} функциясынын туундусун табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {"en": "Quadratic Equation", "ru": "Квадратное уравнение", "kg": "Квадраттык теңдеме"},
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
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {"en": "Definite Integral", "ru": "Определённый интеграл", "kg": "Аныкталган интеграл"},
        "template_json": {
            "topic": "definite_integral",
            "sympy_expr": "A * B**(N+1) / (N+1) - A * 0",
            "ranges": {"A": [1, 4], "B": [1, 5], "N": [1, 3]},
            "constraints": [],
            "texts": {
                "en": "Compute the definite integral of {A}x^{N} from 0 to {B}",
                "ru": "Вычислите определённый интеграл ∫₀^{B} {A}x^{N} dx",
                "kg": "∫₀^{B} {A}x^{N} dx аныкталган интегралын эсептеңиз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "hard",
        "title_translations": {"en": "Optimization Problem", "ru": "Задача на оптимизацию", "kg": "Оптимизация масаласы"},
        "template_json": {
            "topic": "optimization",
            "sympy_expr": "3*A*x**2 - 2*B*x",
            "ranges": {"A": [1, 4], "B": [2, 8]},
            "constraints": ["A != 0"],
            "texts": {
                "en": "Find the critical points of f(x) = {A}x³ - {B}x² + C",
                "ru": "Найдите критические точки функции f(x) = {A}x³ - {B}x² + C",
                "kg": "f(x) = {A}x³ - {B}x² + C функциясынын критикалык чекиттерин табыңыз",
            },
        },
        "is_active": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # Linear Algebra
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "easy",
        "title_translations": {"en": "2×2 Determinant", "ru": "Определитель 2×2", "kg": "2×2 Детерминант"},
        "template_json": {
            "topic": "determinant_2x2",
            "sympy_expr": "A*D - B*C",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "C": [-5, 5], "D": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Find det([[{A},{B}],[{C},{D}]])",
                "ru": "Найдите det([[{A},{B}],[{C},{D}]])",
                "kg": "det([[{A},{B}],[{C},{D}]]) табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "easy",
        "title_translations": {"en": "Vector Addition", "ru": "Сложение векторов", "kg": "Векторлорду кошуу"},
        "template_json": {
            "topic": "vector_addition",
            "sympy_expr": "A+D, B+E, C+F",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "C": [-5, 5], "D": [-5, 5], "E": [-5, 5], "F": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Add vectors ({A},{B},{C}) and ({D},{E},{F})",
                "ru": "Сложите векторы ({A},{B},{C}) и ({D},{E},{F})",
                "kg": "({A},{B},{C}) жана ({D},{E},{F}) векторлорун кошуңуз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {"en": "Dot Product", "ru": "Скалярное произведение", "kg": "Скалярдык көбөйтүү"},
        "template_json": {
            "topic": "dot_product",
            "sympy_expr": "A*D + B*E + C*F",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "C": [-5, 5], "D": [-5, 5], "E": [-5, 5], "F": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Find the dot product of ({A},{B},{C}) · ({D},{E},{F})",
                "ru": "Найдите скалярное произведение ({A},{B},{C}) · ({D},{E},{F})",
                "kg": "({A},{B},{C}) · ({D},{E},{F}) скалярдык көбөйтүүсүн табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {"en": "2×2 Matrix Multiplication", "ru": "Умножение матриц 2×2", "kg": "2×2 матрицаны көбөйтүү"},
        "template_json": {
            "topic": "matrix_multiply_2x2",
            "sympy_expr": "A*E+B*G, A*F+B*H, C*E+D*G, C*F+D*H",
            "ranges": {"A": [-3, 3], "B": [-3, 3], "C": [-3, 3], "D": [-3, 3],
                       "E": [-3, 3], "F": [-3, 3], "G": [-3, 3], "H": [-3, 3]},
            "constraints": [],
            "texts": {
                "en": "Multiply [[{A},{B}],[{C},{D}]] × [[{E},{F}],[{G},{H}]]",
                "ru": "Перемножьте матрицы [[{A},{B}],[{C},{D}]] × [[{E},{F}],[{G},{H}]]",
                "kg": "[[{A},{B}],[{C},{D}]] × [[{E},{F}],[{G},{H}]] матрицаларын көбөйтүңүз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "hard",
        "title_translations": {"en": "Eigenvalues 2×2", "ru": "Собственные значения 2×2", "kg": "2×2 матрицанын меншик маанилери"},
        "template_json": {
            "topic": "eigenvalues_2x2",
            "sympy_expr": "((A+D) + sqrt((A-D)**2 + 4*B*C)) / 2",
            "ranges": {"A": [-3, 3], "B": [1, 3], "C": [1, 3], "D": [-3, 3]},
            "constraints": ["(A-D)**2 + 4*B*C >= 0"],
            "texts": {
                "en": "Find the eigenvalues of [[{A},{B}],[{C},{D}]]",
                "ru": "Найдите собственные значения матрицы [[{A},{B}],[{C},{D}]]",
                "kg": "[[{A},{B}],[{C},{D}]] матрицасынын меншик маанилерин табыңыз",
            },
        },
        "is_active": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # ORT Math
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {"en": "Percentage", "ru": "Задача на проценты", "kg": "Пайыздык масала"},
        "template_json": {
            "topic": "percentage",
            "sympy_expr": "A * B / 100",
            "ranges": {"A": [100, 1000], "B": [5, 50]},
            "constraints": [],
            "texts": {
                "en": "Find {B}% of {A}",
                "ru": "Найдите {B}% от {A}",
                "kg": "{A} санынын {B}% табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {"en": "Simple Ratio", "ru": "Простое соотношение", "kg": "Жөнөкөй катыш"},
        "template_json": {
            "topic": "simple_ratio",
            "sympy_expr": "A * C / B",
            "ranges": {"A": [2, 10], "B": [2, 10], "C": [10, 100]},
            "constraints": ["A != B"],
            "texts": {
                "en": "If {A} items cost {C}, how much do {B} items cost?",
                "ru": "Если {A} предметов стоят {C}, сколько стоят {B} предметов?",
                "kg": "Эгер {A} буюм {C} турса, {B} буюм канча турат?",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {"en": "Arithmetic Progression", "ru": "Арифметическая прогрессия", "kg": "Арифметикалык прогрессия"},
        "template_json": {
            "topic": "arithmetic_progression",
            "sympy_expr": "A + (N - 1) * D",
            "ranges": {"A": [1, 20], "D": [1, 10], "N": [5, 15]},
            "constraints": [],
            "texts": {
                "en": "Find the {N}-th term of AP: first term {A}, common difference {D}",
                "ru": "Найдите {N}-й член АП: первый член {A}, разность {D}",
                "kg": "АП нын {N}-мүчөсүн табыңыз: биринчи мүчө {A}, айырма {D}",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {"en": "Speed & Distance", "ru": "Скорость и расстояние", "kg": "Ылдамдык жана аралык"},
        "template_json": {
            "topic": "speed_distance",
            "sympy_expr": "A * T",
            "ranges": {"A": [40, 120], "T": [1, 5]},
            "constraints": [],
            "texts": {
                "en": "A car travels at {A} km/h for {T} hours. Find the distance.",
                "ru": "Автомобиль едет со скоростью {A} км/ч в течение {T} часов. Найдите расстояние.",
                "kg": "Унаа {A} км/саат ылдамдыкта {T} саат жүрөт. Аралыкты табыңыз.",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_ORT,
        "difficulty": "hard",
        "title_translations": {"en": "Geometric Progression", "ru": "Геометрическая прогрессия", "kg": "Геометриялык прогрессия"},
        "template_json": {
            "topic": "geometric_progression",
            "sympy_expr": "A * R**(N-1)",
            "ranges": {"A": [1, 5], "R": [2, 4], "N": [3, 7]},
            "constraints": [],
            "texts": {
                "en": "Find the {N}-th term of GP: first term {A}, ratio {R}",
                "ru": "Найдите {N}-й член ГП: первый член {A}, знаменатель {R}",
                "kg": "ГП нын {N}-мүчөсүн табыңыз: биринчи мүчө {A}, катыш {R}",
            },
        },
        "is_active": True,
    },
]


# ── Seeder ────────────────────────────────────────────────────────────────────

async def seed_database(db: AsyncSession) -> None:
    """
    Upsert all seed rows on every startup.

    Uses INSERT … ON CONFLICT DO NOTHING so:
      - First run  → inserts everything
      - Re-runs    → skips rows that already exist (no duplicates, no errors)
      - New rows   → added automatically when CATEGORIES / TEMPLATES grows
    """

    # ── Categories ────────────────────────────────────────────────────────
    cats_inserted = 0
    for cat_data in CATEGORIES:
        stmt = (
            pg_insert(Category)
            .values(**cat_data)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        result = await db.execute(stmt)
        cats_inserted += result.rowcount

    await db.flush()  # ensure category PKs exist before FK references below

    # ── Templates ─────────────────────────────────────────────────────────
    tmpls_inserted = 0
    for tmpl_data in TEMPLATES:
        stmt = (
            pg_insert(TaskTemplate)
            .values(**tmpl_data)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        result = await db.execute(stmt)
        tmpls_inserted += result.rowcount

    await db.commit()

    if cats_inserted or tmpls_inserted:
        print(
            f"🌱 Seed: inserted {cats_inserted} categories "
            f"and {tmpls_inserted} templates."
        )
    else:
        print("✅ Seed: all rows already present — nothing to insert.")
