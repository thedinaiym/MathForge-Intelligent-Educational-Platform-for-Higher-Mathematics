"""
Database seeder — runs on every startup using INSERT … ON CONFLICT DO UPDATE.

Safe to call repeatedly: new rows are inserted, existing rows have their
template_json/title updated so fixes propagate automatically.
No manual admin step required for MVP.
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

# ── Template rows (10 per category = 30 total) ────────────────────────────────

TEMPLATES = [

    # ════════════════════════════════════════════════════════════════════════
    # CALCULUS  (IDs 10…001 – 10…010)
    # ════════════════════════════════════════════════════════════════════════

    # ── easy ──────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Linear Equation",
            "ru": "Линейное уравнение",
            "kg": "Сызыктуу теңдеме",
        },
        "template_json": {
            "topic": "linear_equation",
            "sympy_expr": "A*x + B",
            "equation_rhs": "0",
            "ranges": {"A": [1, 9], "B": [-20, 20]},
            "constraints": ["A != 0"],
            "texts": {
                "en": "Solve for x: {A}x + {B} = 0",
                "ru": "Решите уравнение: {A}x + {B} = 0",
                "kg": "Теңдемени чечиңиз: {A}x + {B} = 0",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Function Value",
            "ru": "Значение функции",
            "kg": "Функциянын мааниси",
        },
        "template_json": {
            "topic": "function_value_quadratic",
            "sympy_expr": "A*P**2 + B*P",
            "ranges": {"A": [1, 5], "B": [-6, 6], "P": [1, 6]},
            "constraints": [],
            "texts": {
                "en": "Find $f({P})$ for $f(x) = {A}x^2 + {B}x$",
                "ru": "Найдите $f({P})$ для $f(x) = {A}x^2 + {B}x$",
                "kg": "$f(x) = {A}x^2 + {B}x$ үчүн $f({P})$ табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Definite Integral (Linear)",
            "ru": "Определённый интеграл (линейный)",
            "kg": "Аныкталган интеграл (сызыктуу)",
        },
        "template_json": {
            "topic": "definite_integral_linear",
            "sympy_expr": "A * B**2 / 2",
            "ranges": {"A": [1, 5], "B": [1, 6]},
            "constraints": [],
            "texts": {
                "en": "Compute $\\int_0^{{{B}}} {A}x\\, dx$",
                "ru": "Вычислите $\\int_0^{{{B}}} {A}x\\, dx$",
                "kg": "$\\int_0^{{{B}}} {A}x\\, dx$ эсептеңиз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Discriminant",
            "ru": "Дискриминант",
            "kg": "Дискриминант",
        },
        "template_json": {
            "topic": "discriminant",
            "sympy_expr": "B**2 - 4*A*C",
            "ranges": {"A": [1, 4], "B": [-8, 8], "C": [-6, 6]},
            "constraints": [],
            "texts": {
                "en": "Find the discriminant of ${A}x^2 + {B}x + {C}$",
                "ru": "Найдите дискриминант ${A}x^2 + {B}x + {C}$",
                "kg": "${A}x^2 + {B}x + {C}$ дискриминантын табыңыз",
            },
        },
        "is_active": True,
    },

    # ── easy (additional variety) ──────────────────────────────────────────
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000011"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Two-Step Linear Equation",
            "ru": "Линейное уравнение (два шага)",
            "kg": "Эки кадамдуу сызыктуу теңдеме",
        },
        "template_json": {
            "topic": "linear_two_step",
            "sympy_expr": "A*x + B - C",
            "equation_rhs": "0",
            "ranges": {"A": [1, 8], "B": [-15, 15], "C": [-15, 15]},
            "constraints": ["A != 0", "B != C"],
            "texts": {
                "en": "Solve for x: {A}x + {B} = {C}",
                "ru": "Решите: {A}x + {B} = {C}",
                "kg": "Чечиңиз: {A}x + {B} = {C}",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000012"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Fraction Equation",
            "ru": "Дробное уравнение",
            "kg": "Бөлчөктүү теңдеме",
        },
        "template_json": {
            "topic": "fraction_equation",
            "sympy_expr": "x/B - C",
            "equation_rhs": "0",
            "ranges": {"B": [2, 9], "C": [1, 8]},
            "constraints": [],
            "texts": {
                "en": "Solve for x: x / {B} = {C}",
                "ru": "Решите: x / {B} = {C}",
                "kg": "Чечиңиз: x / {B} = {C}",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000013"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Arithmetic Sequence — nth Term",
            "ru": "Арифметическая прогрессия — n-й член",
            "kg": "Арифметикалык прогрессия — n-чи мүчө",
        },
        "template_json": {
            "topic": "arithmetic_sequence_nth",
            "sympy_expr": "A + (N - 1) * B",
            "ranges": {"A": [1, 20], "B": [2, 10], "N": [5, 15]},
            "constraints": [],
            "texts": {
                "en": "Find the {N}th term of an arithmetic sequence with first term {A} and common difference {B}",
                "ru": "Найдите {N}-й член арифметической прогрессии с первым членом {A} и разностью {B}",
                "kg": "Биринчи мүчөсү {A}, айырмасы {B} болгон арифметикалык прогрессиянын {N}-чи мүчөсүн табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000014"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Power Evaluation",
            "ru": "Степень числа",
            "kg": "Сандын даражасы",
        },
        "template_json": {
            "topic": "power_evaluation",
            "sympy_expr": "A**N",
            "ranges": {"A": [2, 5], "N": [2, 4]},
            "constraints": [],
            "texts": {
                "en": "Compute ${A}^{{{N}}}$",
                "ru": "Вычислите ${A}^{{{N}}}$",
                "kg": "${A}^{{{N}}}$ эсептеңиз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000015"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Percentage",
            "ru": "Процент числа",
            "kg": "Сандын проценти",
        },
        "template_json": {
            "topic": "percentage",
            "sympy_expr": "A * B / 100",
            "ranges": {"A": [10, 90], "B": [20, 500]},
            "constraints": ["A % 10 == 0"],
            "texts": {
                "en": "Find {A}% of {B}",
                "ru": "Найдите {A}% от {B}",
                "kg": "{B} санынын {A}% табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000016"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "easy",
        "title_translations": {
            "en": "Proportion",
            "ru": "Пропорция",
            "kg": "Пропорция",
        },
        "template_json": {
            "topic": "proportion",
            "sympy_expr": "B * C / A",
            "ranges": {"A": [2, 8], "B": [3, 9], "C": [2, 12]},
            "constraints": ["A != 0", "B*C % A == 0"],
            "texts": {
                "en": "Solve the proportion: {A} / {B} = {C} / x  →  find x",
                "ru": "Решите пропорцию: {A} / {B} = {C} / x  →  найдите x",
                "kg": "Пропорцияны чечиңиз: {A} / {B} = {C} / x  →  x табыңыз",
            },
        },
        "is_active": True,
    },

    # ── medium ─────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {
            "en": "Quadratic Equation",
            "ru": "Квадратное уравнение",
            "kg": "Квадраттык теңдеме",
        },
        "template_json": {
            "topic": "quadratic_equation",
            "sympy_expr": "A*x**2 + B*x + C",
            "equation_rhs": "0",
            "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
            "constraints": ["B**2 - 4*A*C >= 0"],
            "texts": {
                "en": "Solve for x: {A}x² + {B}x + {C} = 0",
                "ru": "Решите уравнение: {A}x² + {B}x + {C} = 0",
                "kg": "Теңдемени чечиңиз: {A}x² + {B}x + {C} = 0",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000006"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {
            "en": "Definite Integral (Power)",
            "ru": "Определённый интеграл (степень)",
            "kg": "Аныкталган интеграл (даража)",
        },
        "template_json": {
            "topic": "definite_integral_power",
            "sympy_expr": "A * B**(N+1) / (N+1)",
            "ranges": {"A": [1, 4], "B": [1, 4], "N": [2, 4]},
            "constraints": [],
            "texts": {
                "en": "Compute ∫₀^{B} {A}x^{N} dx",
                "ru": "Вычислите ∫₀^{B} {A}x^{N} dx",
                "kg": "∫₀^{B} {A}x^{N} dx эсептеңиз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000007"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {
            "en": "Critical Points",
            "ru": "Критические точки",
            "kg": "Критикалык чекиттер",
        },
        "template_json": {
            "topic": "critical_points",
            "sympy_expr": "3*A*x**2 - 2*B*x",
            "equation_rhs": "0",
            "ranges": {"A": [1, 3], "B": [2, 8]},
            "constraints": ["A != 0"],
            "texts": {
                "en": "Find the critical points of $f(x) = {A}x^3 - {B}x^2$ (set $f'(x) = 0$)",
                "ru": "Найдите критические точки $f(x) = {A}x^3 - {B}x^2$ (приравняйте $f'(x) = 0$)",
                "kg": "$f(x) = {A}x^3 - {B}x^2$ критикалык чекиттерин табыңыз ($f'(x) = 0$)",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000008"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "medium",
        "title_translations": {
            "en": "Polynomial Evaluation",
            "ru": "Вычисление значения многочлена",
            "kg": "Көп мүчөнүн маанисин эсептөө",
        },
        "template_json": {
            "topic": "polynomial_evaluation",
            "sympy_expr": "A*P**3 + B*P**2 + C*P",
            "ranges": {"A": [1, 3], "B": [-4, 4], "C": [-6, 6], "P": [1, 4]},
            "constraints": [],
            "texts": {
                "en": "Evaluate $f({P})$ for $f(x) = {A}x^3 + {B}x^2 + {C}x$",
                "ru": "Вычислите $f({P})$ для $f(x) = {A}x^3 + {B}x^2 + {C}x$",
                "kg": "$f(x) = {A}x^3 + {B}x^2 + {C}x$ үчүн $f({P})$ табыңыз",
            },
        },
        "is_active": True,
    },

    # ── hard ───────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000009"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "hard",
        "title_translations": {
            "en": "Biquadratic Equation",
            "ru": "Биквадратное уравнение",
            "kg": "Биквадраттык теңдеме",
        },
        "template_json": {
            "topic": "biquadratic_equation",
            "sympy_expr": "A*x**4 - B*x**2",
            "equation_rhs": "0",
            "ranges": {"A": [1, 4], "B": [1, 16]},
            "constraints": ["B > 0"],
            "texts": {
                "en": "Solve for x: ${A}x^4 - {B}x^2 = 0$",
                "ru": "Решите уравнение: ${A}x^4 - {B}x^2 = 0$",
                "kg": "Теңдемени чечиңиз: ${A}x^4 - {B}x^2 = 0$",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("10000000-0000-0000-0000-000000000010"),
        "category_id": _CAT_CALCULUS,
        "difficulty": "hard",
        "title_translations": {
            "en": "Function Composition Value",
            "ru": "Значение сложной функции",
            "kg": "Татаал функциянын мааниси",
        },
        "template_json": {
            "topic": "composition_value",
            "sympy_expr": "A*(B*P + C)**2",
            "ranges": {"A": [1, 4], "B": [1, 3], "C": [-3, 3], "P": [1, 4]},
            "constraints": [],
            "texts": {
                "en": "Find $f(g({P}))$ where $f(x) = {A}x^2$, $g(x) = {B}x + {C}$",
                "ru": "Найдите $f(g({P}))$, где $f(x) = {A}x^2$, $g(x) = {B}x + {C}$",
                "kg": "$f(g({P}))$ табыңыз, мында $f(x) = {A}x^2$, $g(x) = {B}x + {C}$",
            },
        },
        "is_active": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # LINEAR ALGEBRA  (IDs 20…001 – 20…010)
    # ════════════════════════════════════════════════════════════════════════

    # ── easy ──────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_LINEAR_ALG,
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
                "en": "Find det([[{A},{B}],[{C},{D}]])",
                "ru": "Найдите det([[{A},{B}],[{C},{D}]])",
                "kg": "det([[{A},{B}],[{C},{D}]]) табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "easy",
        "title_translations": {
            "en": "Dot Product 2D",
            "ru": "Скалярное произведение 2D",
            "kg": "2D скалярдык көбөйтүү",
        },
        "template_json": {
            "topic": "dot_product_2d",
            "sympy_expr": "A*C + B*D",
            "ranges": {"A": [-6, 6], "B": [-6, 6], "C": [-6, 6], "D": [-6, 6]},
            "constraints": [],
            "texts": {
                "en": "Find the dot product of ({A},{B}) · ({C},{D})",
                "ru": "Найдите скалярное произведение ({A},{B}) · ({C},{D})",
                "kg": "({A},{B}) · ({C},{D}) скалярдык көбөйтүүсүн табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "easy",
        "title_translations": {
            "en": "Vector Magnitude Squared",
            "ru": "Квадрат длины вектора",
            "kg": "Вектордун узундугунун квадраты",
        },
        "template_json": {
            "topic": "vector_magnitude_sq",
            "sympy_expr": "A**2 + B**2 + C**2",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "C": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Find $|v|^2$ for $v = ({A}, {B}, {C})$",
                "ru": "Найдите $|v|^2$ для $v = ({A}, {B}, {C})$",
                "kg": "$v = ({A}, {B}, {C})$ үчүн $|v|^2$ табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "easy",
        "title_translations": {
            "en": "Linear Equation (LA)",
            "ru": "Линейное уравнение (ЛА)",
            "kg": "Сызыктуу теңдеме (СА)",
        },
        "template_json": {
            "topic": "linear_equation_la",
            "sympy_expr": "A*x - B",
            "equation_rhs": "0",
            "ranges": {"A": [1, 8], "B": [-24, 24]},
            "constraints": ["A != 0"],
            "texts": {
                "en": "Solve for x: {A}x = {B}",
                "ru": "Решите: {A}x = {B}",
                "kg": "Чечиңиз: {A}x = {B}",
            },
        },
        "is_active": True,
    },

    # ── medium ─────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {
            "en": "Dot Product 3D",
            "ru": "Скалярное произведение 3D",
            "kg": "3D скалярдык көбөйтүү",
        },
        "template_json": {
            "topic": "dot_product_3d",
            "sympy_expr": "A*D + B*E + C*F",
            "ranges": {
                "A": [-5, 5], "B": [-5, 5], "C": [-5, 5],
                "D": [-5, 5], "E": [-5, 5], "F": [-5, 5],
            },
            "constraints": [],
            "texts": {
                "en": "Find ({A},{B},{C}) · ({D},{E},{F})",
                "ru": "Найдите ({A},{B},{C}) · ({D},{E},{F})",
                "kg": "({A},{B},{C}) · ({D},{E},{F}) табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000006"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {
            "en": "Matrix Product Element",
            "ru": "Элемент произведения матриц",
            "kg": "Матрицалар көбөйтүндүсүнүн элементи",
        },
        "template_json": {
            "topic": "matrix_product_elem",
            "sympy_expr": "A*E + B*G",
            "ranges": {"A": [-4, 4], "B": [-4, 4], "E": [-4, 4], "G": [-4, 4]},
            "constraints": [],
            "texts": {
                "en": "Compute element (1,1) of [[{A},{B}],[C,D]] × [[{E},F],[{G},H]]",
                "ru": "Найдите элемент (1,1) матрицы [[{A},{B}],[C,D]] × [[{E},F],[{G},H]]",
                "kg": "[[{A},{B}],[C,D]] × [[{E},F],[{G},H]] матрицасынын (1,1) элементин табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000007"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {
            "en": "Cross Product Z-Component",
            "ru": "Z-компонента векторного произведения",
            "kg": "Вектордук көбөйтүүнүн Z-компоненти",
        },
        "template_json": {
            "topic": "cross_product_z",
            "sympy_expr": "A*F - B*E",
            "ranges": {"A": [-5, 5], "B": [-5, 5], "E": [-5, 5], "F": [-5, 5]},
            "constraints": [],
            "texts": {
                "en": "Find the z-component of ({A},{B},0) × ({E},{F},0)",
                "ru": "Найдите z-компоненту ({A},{B},0) × ({E},{F},0)",
                "kg": "({A},{B},0) × ({E},{F},0) вектордук көбөйтүүсүнүн z-компонентин табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000008"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "medium",
        "title_translations": {
            "en": "Trace of M²",
            "ru": "След матрицы M²",
            "kg": "M² матрицасынын изи",
        },
        "template_json": {
            "topic": "trace_matrix_sq",
            "sympy_expr": "A**2 + D**2 + 2*B*C",
            "ranges": {"A": [-3, 3], "B": [-3, 3], "C": [-3, 3], "D": [-3, 3]},
            "constraints": [],
            "texts": {
                "en": "Find $\\text{{tr}}(M^2)$ for $M = [[{A},{B}],[{C},{D}]]$",
                "ru": "Найдите $\\text{{tr}}(M^2)$ для $M = [[{A},{B}],[{C},{D}]]$",
                "kg": "$M = [[{A},{B}],[{C},{D}]]$ үчүн $\\text{{tr}}(M^2)$ табыңыз",
            },
        },
        "is_active": True,
    },

    # ── hard ───────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000009"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "hard",
        "title_translations": {
            "en": "Eigenvalues 2×2",
            "ru": "Собственные значения 2×2",
            "kg": "2×2 матрицанын меншик маанилери",
        },
        "template_json": {
            "topic": "eigenvalues_2x2",
            "sympy_expr": "x**2 - (A+D)*x + (A*D - B*C)",
            "equation_rhs": "0",
            "ranges": {"A": [-3, 3], "B": [1, 3], "C": [1, 3], "D": [-3, 3]},
            "constraints": ["(A-D)**2 + 4*B*C >= 0"],
            "texts": {
                "en": "Find the eigenvalues of [[{A},{B}],[{C},{D}]] (solve the characteristic equation)",
                "ru": "Найдите собственные значения матрицы [[{A},{B}],[{C},{D}]] (решите характеристическое уравнение)",
                "kg": "[[{A},{B}],[{C},{D}]] матрицасынын меншик маанилерин табыңыз (мүнөздөмөлүк теңдемени чечиңиз)",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("20000000-0000-0000-0000-000000000010"),
        "category_id": _CAT_LINEAR_ALG,
        "difficulty": "hard",
        "title_translations": {
            "en": "Diagonal 3×3 Determinant",
            "ru": "Определитель диагональной матрицы 3×3",
            "kg": "3×3 диагоналдык матрицанын детерминанты",
        },
        "template_json": {
            "topic": "det_diagonal_3x3",
            "sympy_expr": "A*E*I",
            "ranges": {"A": [-4, 4], "E": [-4, 4], "I": [-4, 4]},
            "constraints": ["A != 0", "E != 0", "I != 0"],
            "texts": {
                "en": "Find det of diagonal matrix diag({A}, {E}, {I})",
                "ru": "Найдите det диагональной матрицы diag({A}, {E}, {I})",
                "kg": "diag({A}, {E}, {I}) диагоналдык матрицасынын det табыңыз",
            },
        },
        "is_active": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # ORT MATH  (IDs 30…001 – 30…010)
    # ════════════════════════════════════════════════════════════════════════

    # ── easy ──────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000001"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {
            "en": "Percentage",
            "ru": "Задача на проценты",
            "kg": "Пайыздык масала",
        },
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
        "id": uuid.UUID("30000000-0000-0000-0000-000000000002"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {
            "en": "Simple Ratio",
            "ru": "Простое соотношение",
            "kg": "Жөнөкөй катыш",
        },
        "template_json": {
            "topic": "simple_ratio",
            "sympy_expr": "A * C / B",
            "ranges": {"A": [2, 8], "B": [3, 12], "C": [10, 100]},
            "constraints": ["A != B"],
            "texts": {
                "en": "If {A} items cost {C} som, how much do {B} items cost?",
                "ru": "Если {A} предмета стоят {C} сом, сколько стоят {B} предметов?",
                "kg": "Эгер {A} буюм {C} сом турса, {B} буюм канча турат?",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000003"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {
            "en": "Arithmetic Mean",
            "ru": "Среднее арифметическое",
            "kg": "Арифметикалык орточо",
        },
        "template_json": {
            "topic": "arithmetic_mean",
            "sympy_expr": "(A + B + C) / 3",
            "ranges": {"A": [10, 60], "B": [10, 60], "C": [10, 60]},
            "constraints": [],
            "texts": {
                "en": "Find the average of {A}, {B}, and {C}",
                "ru": "Найдите среднее арифметическое чисел {A}, {B} и {C}",
                "kg": "{A}, {B} жана {C} сандарынын арифметикалык ортосун табыңыз",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000004"),
        "category_id": _CAT_ORT,
        "difficulty": "easy",
        "title_translations": {
            "en": "Speed & Distance",
            "ru": "Скорость и расстояние",
            "kg": "Ылдамдык жана аралык",
        },
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

    # ── medium ─────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000005"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {
            "en": "Arithmetic Progression (N-th Term)",
            "ru": "Арифметическая прогрессия (N-й член)",
            "kg": "Арифметикалык прогрессия (N-мүчө)",
        },
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
        "id": uuid.UUID("30000000-0000-0000-0000-000000000006"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {
            "en": "Percentage Increase",
            "ru": "Увеличение на процент",
            "kg": "Пайыздык өсүш",
        },
        "template_json": {
            "topic": "percentage_increase",
            "sympy_expr": "A * (100 + B) / 100",
            "ranges": {"A": [100, 800], "B": [5, 40]},
            "constraints": [],
            "texts": {
                "en": "A price of {A} som increased by {B}%. Find the new price.",
                "ru": "Цена {A} сом выросла на {B}%. Найдите новую цену.",
                "kg": "{A} сом баасы {B}% өстү. Жаңы баасын табыңыз.",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000007"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {
            "en": "Sum of Arithmetic Progression",
            "ru": "Сумма арифметической прогрессии",
            "kg": "Арифметикалык прогрессиянын суммасы",
        },
        "template_json": {
            "topic": "sum_of_ap",
            "sympy_expr": "N * (2*A + (N-1)*D) / 2",
            "ranges": {"A": [1, 10], "D": [1, 5], "N": [4, 10]},
            "constraints": [],
            "texts": {
                "en": "Find the sum of the first {N} terms of AP: $a_1 = {A}$, $d = {D}$",
                "ru": "Найдите сумму первых {N} членов АП: $a_1 = {A}$, $d = {D}$",
                "kg": "АП нын биринчи {N} мүчөсүнүн суммасын табыңыз: $a_1 = {A}$, $d = {D}$",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000008"),
        "category_id": _CAT_ORT,
        "difficulty": "medium",
        "title_translations": {
            "en": "Geometric Progression (N-th Term)",
            "ru": "Геометрическая прогрессия (N-й член)",
            "kg": "Геометриялык прогрессия (N-мүчө)",
        },
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

    # ── hard ───────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000009"),
        "category_id": _CAT_ORT,
        "difficulty": "hard",
        "title_translations": {
            "en": "Combined Work Rate",
            "ru": "Совместная работа",
            "kg": "Биргелешкен иш",
        },
        "template_json": {
            "topic": "work_rate_combined",
            "sympy_expr": "A * B / (A + B)",
            "ranges": {"A": [2, 8], "B": [3, 12]},
            "constraints": ["A != B"],
            "texts": {
                "en": "Worker A finishes a job in {A} h, Worker B in {B} h. How long together?",
                "ru": "Рабочий A выполняет работу за {A} ч, рабочий B за {B} ч. Сколько вместе?",
                "kg": "A жумушчу иште {A} саатта, B жумушчу {B} саатта бүтүрөт. Биргелешип канча убакытта?",
            },
        },
        "is_active": True,
    },
    {
        "id": uuid.UUID("30000000-0000-0000-0000-000000000010"),
        "category_id": _CAT_ORT,
        "difficulty": "hard",
        "title_translations": {
            "en": "Compound Percentage",
            "ru": "Двойной процент",
            "kg": "Кош пайыз",
        },
        "template_json": {
            "topic": "compound_percentage",
            "sympy_expr": "A * B * C / 10000",
            "ranges": {"A": [200, 1000], "B": [10, 50], "C": [10, 50]},
            "constraints": [],
            "texts": {
                "en": "Find {B}% of {C}% of {A}",
                "ru": "Найдите {B}% от {C}% числа {A}",
                "kg": "{A} санынын {C}% инин {B}% табыңыз",
            },
        },
        "is_active": True,
    },
]


# ── Seeder ────────────────────────────────────────────────────────────────────

async def seed_database(db: AsyncSession) -> None:
    """
    Upsert all seed rows on every startup.

    Uses INSERT … ON CONFLICT DO UPDATE so:
      - First run  → inserts everything
      - Re-runs    → updates template_json/title of existing rows (fixes propagate)
      - New rows   → added automatically when CATEGORIES / TEMPLATES grows
    """

    # ── Categories ────────────────────────────────────────────────────────
    cats_inserted = 0
    for cat_data in CATEGORIES:
        stmt = pg_insert(Category).values(**cat_data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={"name_translations": stmt.excluded.name_translations},
        )
        result = await db.execute(stmt)
        cats_inserted += result.rowcount

    await db.flush()  # ensure category PKs exist before FK references below

    # ── Templates ─────────────────────────────────────────────────────────
    tmpls_upserted = 0
    for tmpl_data in TEMPLATES:
        stmt = pg_insert(TaskTemplate).values(**tmpl_data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "template_json":        stmt.excluded.template_json,
                "title_translations":   stmt.excluded.title_translations,
                "difficulty":           stmt.excluded.difficulty,
                "is_active":            stmt.excluded.is_active,
            },
        )
        result = await db.execute(stmt)
        tmpls_upserted += result.rowcount

    await db.commit()

    print(
        f"🌱 Seed: {cats_inserted} category rows, "
        f"{tmpls_upserted} template rows upserted."
    )
