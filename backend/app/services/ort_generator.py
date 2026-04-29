"""
ORT (Общереспубликанское тестирование) — Kyrgyz National Testing generator.

Part 1 — 30 comparison problems (Column А vs Column Б → answer А/Б/В/Г)
  А = Column A is greater
  Б = Column B is greater
  В = Both columns are equal
  Г = Cannot be determined from the given information

Part 2 — 30 multiple-choice problems (5 options А–Д)

All arithmetic is verified by SymPy — zero AI hallucinations.
"""
from __future__ import annotations

import random
from typing import Any

import sympy as sp


# ── Cyrillic answer labels ────────────────────────────────────────────────────

MC_LABELS = ["А", "Б", "В", "Г", "Д"]


# ── Utility helpers ───────────────────────────────────────────────────────────

def _sample(
    ranges: dict[str, list[int]],
    constraints: list[str],
    max_attempts: int = 300,
) -> dict[str, int]:
    """Sample integer parameter values satisfying all constraints.

    Uses Python eval (not SymPy) for constraint checking — 50-100× faster.
    Constraints are our own bank strings, not user input, so eval is safe.
    """
    _safe = {"__builtins__": {}, "abs": abs}
    compiled = [compile(c, "<constraint>", "eval") for c in constraints]

    for _ in range(max_attempts):
        vals = {k: random.randint(int(lo), int(hi)) for k, (lo, hi) in ranges.items()}
        if all(eval(code, _safe, vals) for code in compiled):
            return vals

    raise ValueError(
        f"Cannot satisfy constraints {constraints} after {max_attempts} attempts."
    )


def _eval_expr(expr_str: str, vals: dict[str, int]) -> sp.Expr:
    """Substitute concrete integer values into a SymPy expression string."""
    expr = sp.sympify(expr_str)
    return expr.subs({sp.Symbol(k): v for k, v in vals.items()})


def _compare(val_A: sp.Expr, val_B: sp.Expr) -> str:
    """Return comparison answer label for two evaluated SymPy expressions."""
    diff = sp.simplify(val_A - val_B)
    try:
        f = float(diff)
        if f > 1e-9:
            return "А"
        elif f < -1e-9:
            return "Б"
        else:
            return "В"
    except (TypeError, ValueError):
        return "Г"


# ── Part 1: Comparison Problem Bank ──────────────────────────────────────────
#
# Each entry defines a parametric comparison.  Fields:
#   expr_A, expr_B  — SymPy-parseable expression strings
#   ranges          — {param: [lo, hi]} integer ranges
#   constraints     — list of SymPy inequality strings (empty = no constraints)
#   label_A         — localised LaTeX label for Column A (display expression)
#   label_B         — localised LaTeX label for Column B
#   given           — localised condition string, Python .format(**vals) compatible
#
# "Г (cannot determine)" templates carry fixed_answer="Г" and the generator
# skips SymPy evaluation, using the fixed answer directly.

_CMP_BANK: list[dict] = [
    # 1. a² vs a  (a ≥ 2  →  A > B  → А)
    {
        "expr_A": "a**2",
        "expr_B": "a",
        "ranges": {"a": [2, 12]},
        "constraints": [],
        "label_A": {"ru": r"$a^2$",       "en": r"$a^2$",       "kg": r"$a^2$"},
        "label_B": {"ru": r"$a$",          "en": r"$a$",          "kg": r"$a$"},
        "given":   {"ru": r"$a = {a}$",    "en": r"$a = {a}$",    "kg": r"$a = {a}$"},
    },
    # 2. (a+b)² vs a²+b²  (a,b ≥ 1  →  A > B  → А)
    {
        "expr_A": "(a + b)**2",
        "expr_B": "a**2 + b**2",
        "ranges": {"a": [1, 9], "b": [1, 9]},
        "constraints": [],
        "label_A": {"ru": r"$(a+b)^2$",    "en": r"$(a+b)^2$",    "kg": r"$(a+b)^2$"},
        "label_B": {"ru": r"$a^2+b^2$",    "en": r"$a^2+b^2$",    "kg": r"$a^2+b^2$"},
        "given":   {"ru": r"$a={a},\ b={b}$", "en": r"$a={a},\ b={b}$", "kg": r"$a={a},\ b={b}$"},
    },
    # 3. 2(a+b) vs 2a+2b  (always equal → В)
    {
        "expr_A": "2*(a + b)",
        "expr_B": "2*a + 2*b",
        "ranges": {"a": [1, 10], "b": [1, 10]},
        "constraints": [],
        "label_A": {"ru": r"$2(a+b)$",     "en": r"$2(a+b)$",     "kg": r"$2(a+b)$"},
        "label_B": {"ru": r"$2a+2b$",      "en": r"$2a+2b$",      "kg": r"$2a+2b$"},
        "given":   {"ru": r"$a={a},\ b={b}$", "en": r"$a={a},\ b={b}$", "kg": r"$a={a},\ b={b}$"},
    },
    # 4. a²-b² vs (a-b)(a+b)  (always equal → В)
    {
        "expr_A": "a**2 - b**2",
        "expr_B": "(a - b)*(a + b)",
        "ranges": {"a": [3, 12], "b": [1, 8]},
        "constraints": ["a - b > 0"],
        "label_A": {"ru": r"$a^2-b^2$",        "en": r"$a^2-b^2$",        "kg": r"$a^2-b^2$"},
        "label_B": {"ru": r"$(a-b)(a+b)$",     "en": r"$(a-b)(a+b)$",     "kg": r"$(a-b)(a+b)$"},
        "given":   {"ru": r"$a={a},\ b={b}$",  "en": r"$a={a},\ b={b}$",  "kg": r"$a={a},\ b={b}$"},
    },
    # 5. 3a vs 2a  (a > 0  →  A > B  → А)
    {
        "expr_A": "3*a",
        "expr_B": "2*a",
        "ranges": {"a": [2, 15]},
        "constraints": [],
        "label_A": {"ru": r"$3a$",  "en": r"$3a$",  "kg": r"$3a$"},
        "label_B": {"ru": r"$2a$",  "en": r"$2a$",  "kg": r"$2a$"},
        "given":   {"ru": r"$a={a}$", "en": r"$a={a}$", "kg": r"$a={a}$"},
    },
    # 6. ab vs a+b  (a,b ≥ 3  →  A > B  → А)
    {
        "expr_A": "a*b",
        "expr_B": "a + b",
        "ranges": {"a": [3, 10], "b": [3, 10]},
        "constraints": [],
        "label_A": {"ru": r"$ab$",    "en": r"$ab$",    "kg": r"$ab$"},
        "label_B": {"ru": r"$a+b$",   "en": r"$a+b$",   "kg": r"$a+b$"},
        "given":   {"ru": r"$a={a},\ b={b}$", "en": r"$a={a},\ b={b}$", "kg": r"$a={a},\ b={b}$"},
    },
    # 7. a+c vs b+c  (a < b by range  →  A < B  → Б)
    {
        "expr_A": "a + c",
        "expr_B": "b + c",
        "ranges": {"a": [1, 6], "b": [7, 14], "c": [1, 10]},
        "constraints": [],
        "label_A": {"ru": r"$a+c$",  "en": r"$a+c$",  "kg": r"$a+c$"},
        "label_B": {"ru": r"$b+c$",  "en": r"$b+c$",  "kg": r"$b+c$"},
        "given":   {"ru": r"$a={a},\ b={b},\ c={c}$", "en": r"$a={a},\ b={b},\ c={c}$", "kg": r"$a={a},\ b={b},\ c={c}$"},
    },
    # 8. a²+2ab+b² vs (a+b)²  (always equal → В)
    {
        "expr_A": "a**2 + 2*a*b + b**2",
        "expr_B": "(a + b)**2",
        "ranges": {"a": [1, 9], "b": [1, 9]},
        "constraints": [],
        "label_A": {"ru": r"$a^2+2ab+b^2$",  "en": r"$a^2+2ab+b^2$",  "kg": r"$a^2+2ab+b^2$"},
        "label_B": {"ru": r"$(a+b)^2$",       "en": r"$(a+b)^2$",       "kg": r"$(a+b)^2$"},
        "given":   {"ru": r"$a={a},\ b={b}$", "en": r"$a={a},\ b={b}$", "kg": r"$a={a},\ b={b}$"},
    },
    # 9. n² vs n(n-1)  (n ≥ 2  →  A > B  → А)
    {
        "expr_A": "n**2",
        "expr_B": "n*(n - 1)",
        "ranges": {"n": [2, 12]},
        "constraints": [],
        "label_A": {"ru": r"$n^2$",      "en": r"$n^2$",      "kg": r"$n^2$"},
        "label_B": {"ru": r"$n(n-1)$",   "en": r"$n(n-1)$",   "kg": r"$n(n-1)$"},
        "given":   {"ru": r"$n={n}$",    "en": r"$n={n}$",    "kg": r"$n={n}$"},
    },
    # 10. a+b vs a+b+1  (always A < B  → Б)
    {
        "expr_A": "a + b",
        "expr_B": "a + b + 1",
        "ranges": {"a": [1, 10], "b": [1, 10]},
        "constraints": [],
        "label_A": {"ru": r"$a+b$",    "en": r"$a+b$",    "kg": r"$a+b$"},
        "label_B": {"ru": r"$a+b+1$",  "en": r"$a+b+1$",  "kg": r"$a+b+1$"},
        "given":   {"ru": r"$a={a},\ b={b}$", "en": r"$a={a},\ b={b}$", "kg": r"$a={a},\ b={b}$"},
    },
    # 11. a(a+1) vs a²+a  (always equal → В)
    {
        "expr_A": "a*(a + 1)",
        "expr_B": "a**2 + a",
        "ranges": {"a": [1, 15]},
        "constraints": [],
        "label_A": {"ru": r"$a(a+1)$",  "en": r"$a(a+1)$",  "kg": r"$a(a+1)$"},
        "label_B": {"ru": r"$a^2+a$",   "en": r"$a^2+a$",   "kg": r"$a^2+a$"},
        "given":   {"ru": r"$a={a}$",   "en": r"$a={a}$",   "kg": r"$a={a}$"},
    },
    # 12. a³ vs a²  (a ≥ 2  →  A > B  → А)
    {
        "expr_A": "a**3",
        "expr_B": "a**2",
        "ranges": {"a": [2, 8]},
        "constraints": [],
        "label_A": {"ru": r"$a^3$",  "en": r"$a^3$",  "kg": r"$a^3$"},
        "label_B": {"ru": r"$a^2$",  "en": r"$a^2$",  "kg": r"$a^2$"},
        "given":   {"ru": r"$a={a}$", "en": r"$a={a}$", "kg": r"$a={a}$"},
    },
    # 13. sqrt(a²) vs a  (a > 0  →  always equal  → В)
    {
        "expr_A": "sqrt(a**2)",
        "expr_B": "a",
        "ranges": {"a": [1, 12]},
        "constraints": [],
        "label_A": {"ru": r"$\sqrt{a^2}$",  "en": r"$\sqrt{a^2}$",  "kg": r"$\sqrt{a^2}$"},
        "label_B": {"ru": r"$a$",            "en": r"$a$",            "kg": r"$a$"},
        "given":   {"ru": r"$a={a}$",        "en": r"$a={a}$",        "kg": r"$a={a}$"},
    },
    # 14. (a+b)/2 vs b  (a < b by range  →  mean < max  → Б)
    {
        "expr_A": "(a + b) / 2",
        "expr_B": "b",
        "ranges": {"a": [1, 8], "b": [10, 18]},
        "constraints": [],
        "label_A": {"ru": r"$\dfrac{a+b}{2}$",  "en": r"$\dfrac{a+b}{2}$",  "kg": r"$\dfrac{a+b}{2}$"},
        "label_B": {"ru": r"$b$",                "en": r"$b$",                "kg": r"$b$"},
        "given":   {"ru": r"$a={a},\ b={b}$",   "en": r"$a={a},\ b={b}$",   "kg": r"$a={a},\ b={b}$"},
    },
    # 15. Г: x/y vs y/x — relationship depends on whether x>y, x<y, x=y
    {
        "expr_A": "x",          # placeholder — fixed_answer overrides evaluation
        "expr_B": "y",
        "ranges": {"x": [1, 10], "y": [1, 10]},
        "constraints": [],
        "fixed_answer": "Г",
        "label_A": {"ru": r"$\dfrac{x}{y}$",  "en": r"$\dfrac{x}{y}$",  "kg": r"$\dfrac{x}{y}$"},
        "label_B": {"ru": r"$\dfrac{y}{x}$",  "en": r"$\dfrac{y}{x}$",  "kg": r"$\dfrac{y}{x}$"},
        "given":   {
            "ru": r"$x$ и $y$ — натуральные числа",
            "en": r"$x$ and $y$ are natural numbers",
            "kg": r"$x$ жана $y$ — натурал сандар",
        },
    },
]


def generate_comparison_problem(idx: int, locale: str = "ru") -> dict:
    """Generate one comparison problem (ORT Part 1)."""
    tmpl = _CMP_BANK[idx % len(_CMP_BANK)]
    vals = _sample(tmpl["ranges"], tmpl["constraints"])

    fixed = tmpl.get("fixed_answer")
    if fixed:
        answer = fixed
        val_A_latex = tmpl["label_A"].get(locale, tmpl["label_A"]["ru"]).strip("$")
        val_B_latex = tmpl["label_B"].get(locale, tmpl["label_B"]["ru"]).strip("$")
    else:
        val_A = _eval_expr(tmpl["expr_A"], vals)
        val_B = _eval_expr(tmpl["expr_B"], vals)
        answer = _compare(val_A, val_B)
        val_A_latex = sp.latex(val_A)
        val_B_latex = sp.latex(val_B)

    given_raw = tmpl["given"].get(locale) or tmpl["given"]["ru"]
    given_text = given_raw.format(**vals)

    return {
        "number": idx + 1,
        "given": given_text,
        "col_a_label": tmpl["label_A"].get(locale) or tmpl["label_A"]["ru"],
        "col_b_label": tmpl["label_B"].get(locale) or tmpl["label_B"]["ru"],
        "col_a_value": val_A_latex,
        "col_b_value": val_B_latex,
        "answer_label": answer,
    }


# ── Part 2: Multiple-Choice Problem Bank ─────────────────────────────────────
#
# Each entry defines a parametric question.  Fields:
#   expr_answer    — SymPy expression that evaluates to the CORRECT answer
#   ranges         — {param: [lo, hi]} integer ranges
#   constraints    — SymPy inequality strings
#   question_tmpl  — localised question string (Python .format(**vals) compatible)
#
# Distractors are generated automatically by offsetting the correct answer.

_MC_BANK: list[dict] = [
    {
        "expr_answer": "a*b",
        "ranges": {"a": [3, 12], "b": [3, 12]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: ${a} \times {b}$",
            "en": r"Calculate: ${a} \times {b}$",
            "kg": r"Эсептеңиз: ${a} \times {b}$",
        },
    },
    {
        "expr_answer": "a + b + c",
        "ranges": {"a": [10, 40], "b": [10, 40], "c": [10, 40]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Найдите сумму: ${a} + {b} + {c}$",
            "en": r"Find the sum: ${a} + {b} + {c}$",
            "kg": r"Суммасын табыңыз: ${a} + {b} + {c}$",
        },
    },
    {
        "expr_answer": "2*(a + b)",
        "ranges": {"a": [3, 20], "b": [3, 20]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Периметр прямоугольника со сторонами ${a}$ и ${b}$:",
            "en": r"Perimeter of a rectangle with sides ${a}$ and ${b}$:",
            "kg": r"${a}$ жана ${b}$ тараптары бар тик бурчтуктун периметри:",
        },
    },
    {
        "expr_answer": "a*b",
        "ranges": {"a": [2, 15], "b": [2, 15]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Площадь прямоугольника со сторонами ${a}$ и ${b}$:",
            "en": r"Area of a rectangle with sides ${a}$ and ${b}$:",
            "kg": r"${a}$ жана ${b}$ тараптары бар тик бурчтуктун аянты:",
        },
    },
    {
        "expr_answer": "a**2",
        "ranges": {"a": [4, 15]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: ${a}^2$",
            "en": r"Calculate: ${a}^2$",
            "kg": r"Эсептеңиз: ${a}^2$",
        },
    },
    {
        "expr_answer": "a*b - c",
        "ranges": {"a": [3, 10], "b": [3, 10], "c": [1, 12]},
        "constraints": ["a*b - c > 0"],
        "question_tmpl": {
            "ru": r"Вычислите: ${a} \cdot {b} - {c}$",
            "en": r"Calculate: ${a} \cdot {b} - {c}$",
            "kg": r"Эсептеңиз: ${a} \cdot {b} - {c}$",
        },
    },
    {
        "expr_answer": "a + b*c",
        "ranges": {"a": [5, 30], "b": [2, 8], "c": [2, 8]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: ${a} + {b} \cdot {c}$",
            "en": r"Calculate: ${a} + {b} \cdot {c}$",
            "kg": r"Эсептеңиз: ${a} + {b} \cdot {c}$",
        },
    },
    {
        "expr_answer": "(a + b)**2",
        "ranges": {"a": [2, 7], "b": [2, 7]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Раскройте и вычислите: $({a}+{b})^2$",
            "en": r"Expand and calculate: $({a}+{b})^2$",
            "kg": r"Жайып эсептеңиз: $({a}+{b})^2$",
        },
    },
    {
        "expr_answer": "a*b*c",
        "ranges": {"a": [2, 6], "b": [2, 6], "c": [2, 6]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите произведение: ${a} \times {b} \times {c}$",
            "en": r"Calculate the product: ${a} \times {b} \times {c}$",
            "kg": r"Көбөйтүндүнү эсептеңиз: ${a} \times {b} \times {c}$",
        },
    },
    {
        "expr_answer": "a**2 + b**2",
        "ranges": {"a": [2, 9], "b": [2, 9]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: ${a}^2 + {b}^2$",
            "en": r"Calculate: ${a}^2 + {b}^2$",
            "kg": r"Эсептеңиз: ${a}^2 + {b}^2$",
        },
    },
    {
        "expr_answer": "a*10 + b",
        "ranges": {"a": [1, 9], "b": [1, 9]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Двузначное число: десятки — ${a}$, единицы — ${b}$. Чему оно равно?",
            "en": r"Two-digit number: tens digit ${a}$, units digit ${b}$. What is the number?",
            "kg": r"Эки орундуу сан: ондуктар ${a}$, биримдиктер ${b}$. Ал кандай?",
        },
    },
    {
        "expr_answer": "a - b + c",
        "ranges": {"a": [20, 80], "b": [5, 19], "c": [5, 19]},
        "constraints": ["a - b > 0"],
        "question_tmpl": {
            "ru": r"Вычислите: ${a} - {b} + {c}$",
            "en": r"Calculate: ${a} - {b} + {c}$",
            "kg": r"Эсептеңиз: ${a} - {b} + {c}$",
        },
    },
    {
        "expr_answer": "a**2 - b**2",
        "ranges": {"a": [5, 15], "b": [1, 8]},
        "constraints": ["a - b > 0"],
        "question_tmpl": {
            "ru": r"Вычислите: ${a}^2 - {b}^2$",
            "en": r"Calculate: ${a}^2 - {b}^2$",
            "kg": r"Эсептеңиз: ${a}^2 - {b}^2$",
        },
    },
    {
        "expr_answer": "3*a + 2*b",
        "ranges": {"a": [2, 10], "b": [2, 10]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: $3 \cdot {a} + 2 \cdot {b}$",
            "en": r"Calculate: $3 \cdot {a} + 2 \cdot {b}$",
            "kg": r"Эсептеңиз: $3 \cdot {a} + 2 \cdot {b}$",
        },
    },
    {
        "expr_answer": "a*(a - 1)",
        "ranges": {"a": [3, 12]},
        "constraints": [],
        "question_tmpl": {
            "ru": r"Вычислите: ${a} \cdot ({a} - 1)$",
            "en": r"Calculate: ${a} \cdot ({a} - 1)$",
            "kg": r"Эсептеңиз: ${a} \cdot ({a} - 1)$",
        },
    },
]


def _make_distractors(correct: sp.Expr, n: int = 4) -> list[sp.Expr]:
    """
    Generate n plausible wrong answers near the correct integer value.
    Offsets are shuffled to add variety across problems.
    """
    try:
        c = int(correct)
    except (TypeError, ValueError):
        c = round(float(correct))

    offsets = [-10, -7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7, 10, 15, 20]
    random.shuffle(offsets)

    seen: set[int] = {c}
    result: list[sp.Expr] = []
    for off in offsets:
        candidate = c + off
        if candidate > 0 and candidate not in seen:
            result.append(sp.Integer(candidate))
            seen.add(candidate)
        if len(result) == n:
            break

    # Fallback: fill remaining slots with multiples of 11
    step = 1
    while len(result) < n:
        candidate = c + step * 11
        if candidate not in seen and candidate > 0:
            result.append(sp.Integer(candidate))
            seen.add(candidate)
        step += 1

    return result[:n]


def generate_mc_problem(idx: int, locale: str = "ru") -> dict:
    """Generate one multiple-choice problem (ORT Part 2)."""
    tmpl = _MC_BANK[idx % len(_MC_BANK)]
    vals = _sample(tmpl["ranges"], tmpl["constraints"])

    correct_val = _eval_expr(tmpl["expr_answer"], vals)
    distractors = _make_distractors(correct_val)

    # Insert correct answer at a random position among the 5 choices
    choices: list[sp.Expr] = list(distractors[:4])
    correct_idx = random.randint(0, 4)
    choices.insert(correct_idx, correct_val)

    question_raw = tmpl["question_tmpl"].get(locale) or tmpl["question_tmpl"]["ru"]
    question_text = question_raw.format(**vals)

    return {
        "number": idx + 1,
        "question": question_text,
        "choices": [sp.latex(c) for c in choices],
        "correct_label": MC_LABELS[correct_idx],
    }


# ── Public API ────────────────────────────────────────────────────────────────

def generate_ort_part1(count: int = 30, locale: str = "ru") -> list[dict]:
    """Generate ``count`` comparison problems for ORT Part 1."""
    problems: list[dict] = []
    attempts = 0
    i = 0
    while len(problems) < count and attempts < count * 5:
        try:
            problems.append(generate_comparison_problem(i, locale))
            i += 1
        except ValueError:
            i += 1
        attempts += 1
    return problems


def generate_ort_part2(count: int = 30, locale: str = "ru") -> list[dict]:
    """Generate ``count`` multiple-choice problems for ORT Part 2."""
    problems: list[dict] = []
    attempts = 0
    i = 0
    while len(problems) < count and attempts < count * 5:
        try:
            problems.append(generate_mc_problem(i, locale))
            i += 1
        except ValueError:
            i += 1
        attempts += 1
    return problems
