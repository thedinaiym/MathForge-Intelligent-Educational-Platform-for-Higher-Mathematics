"""
Unit tests for TaskGenerator — Phase 3.

Uses the exact sample template_json from CLAUDE.md (quadratic equation).
Verifies mathematical correctness, locale extraction, and robustness.
"""
import pytest
import sympy as sp

from app.core.engine.generator import TaskGenerator

# ── Canonical template from CLAUDE.md ─────────────────────────────────────────
QUADRATIC_TEMPLATE = {
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _run(locale: str = "ru") -> dict:
    """Convenience wrapper to call generate() once."""
    return TaskGenerator.generate(QUADRATIC_TEMPLATE, locale=locale)


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestGenerateReturnShape:
    """The result dict must have all required keys with non-empty strings."""

    def test_has_required_keys(self):
        result = _run()
        for key in ("topic", "question_text", "condition_latex", "answer_latex",
                    "solutions", "coefficients"):
            assert key in result, f"Missing key: {key}"

    def test_topic_matches_template(self):
        result = _run()
        assert result["topic"] == "quadratic_equation"

    def test_condition_latex_is_non_empty_string(self):
        result = _run()
        assert isinstance(result["condition_latex"], str)
        assert len(result["condition_latex"]) > 0

    def test_condition_latex_ends_with_equals_zero(self):
        result = _run()
        assert result["condition_latex"].endswith("= 0")

    def test_answer_latex_is_non_empty_string(self):
        result = _run()
        assert isinstance(result["answer_latex"], str)
        assert len(result["answer_latex"]) > 0


class TestCoefficients:
    """Generated coefficients must respect the declared ranges."""

    def test_A_in_range(self):
        for _ in range(20):
            result = _run()
            A = result["coefficients"]["A"]
            assert 1 <= A <= 5, f"A={A} out of [1, 5]"

    def test_B_in_range(self):
        for _ in range(20):
            result = _run()
            B = result["coefficients"]["B"]
            assert -10 <= B <= 10, f"B={B} out of [-10, 10]"

    def test_C_in_range(self):
        for _ in range(20):
            result = _run()
            C = result["coefficients"]["C"]
            assert -20 <= C <= 20, f"C={C} out of [-20, 20]"

    def test_discriminant_non_negative(self):
        """Constraint B**2 - 4*A*C >= 0 must always be satisfied."""
        for _ in range(30):
            result = _run()
            A = result["coefficients"]["A"]
            B = result["coefficients"]["B"]
            C = result["coefficients"]["C"]
            discriminant = B**2 - 4 * A * C
            assert discriminant >= 0, (
                f"Constraint violated: discriminant={discriminant} for A={A}, B={B}, C={C}"
            )


class TestMathematicalCorrectness:
    """Each solution returned must actually satisfy the original equation."""

    def test_solutions_are_roots(self):
        """
        Substitute each solution back into A*x**2 + B*x + C and verify it equals 0.
        Checked over multiple random samples.
        """
        x = sp.Symbol("x")
        for _ in range(30):
            result = _run()
            A = result["coefficients"]["A"]
            B = result["coefficients"]["B"]
            C = result["coefficients"]["C"]
            poly = A * x**2 + B * x + C

            assert len(result["solutions"]) > 0, (
                f"Expected at least one solution for A={A}, B={B}, C={C}"
            )
            for sol in result["solutions"]:
                residual = sp.simplify(poly.subs(x, sol))
                assert residual == 0, (
                    f"Solution {sol} is not a root of {A}x²+{B}x+{C}: residual={residual}"
                )

    def test_solution_count_matches_discriminant(self):
        """
        Discriminant > 0  → 2 distinct real roots.
        Discriminant == 0 → 1 repeated real root (SymPy may return one element).
        """
        for _ in range(30):
            result = _run()
            A = result["coefficients"]["A"]
            B = result["coefficients"]["B"]
            C = result["coefficients"]["C"]
            disc = B**2 - 4 * A * C

            n = len(result["solutions"])
            if disc > 0:
                assert n == 2, f"Expected 2 roots for disc={disc}, got {n}"
            elif disc == 0:
                assert n == 1, f"Expected 1 root for disc=0, got {n}"


class TestLocaleExtraction:
    """question_text must contain the correct locale-specific prefix."""

    def test_russian_prompt_prefix(self):
        result = TaskGenerator.generate(QUADRATIC_TEMPLATE, locale="ru")
        assert result["question_text"].startswith("Решите уравнение:"), (
            f"Unexpected ru text: {result['question_text']}"
        )

    def test_english_prompt_prefix(self):
        result = TaskGenerator.generate(QUADRATIC_TEMPLATE, locale="en")
        assert result["question_text"].startswith("Solve:"), (
            f"Unexpected en text: {result['question_text']}"
        )

    def test_kyrgyz_prompt_prefix(self):
        result = TaskGenerator.generate(QUADRATIC_TEMPLATE, locale="kg")
        assert result["question_text"].startswith("Теңдемени чечиңиз:"), (
            f"Unexpected kg text: {result['question_text']}"
        )

    def test_unknown_locale_falls_back_to_english(self):
        result = TaskGenerator.generate(QUADRATIC_TEMPLATE, locale="xx")
        assert result["question_text"].startswith("Solve:"), (
            f"Expected en fallback, got: {result['question_text']}"
        )

    def test_question_text_contains_latex_expression(self):
        """The formatted expression (wrapped in $...$) must appear in the text."""
        result = _run("en")
        assert "$" in result["question_text"], (
            "question_text should embed a LaTeX expression"
        )


class TestSampleCoefficientsDirectly:
    """Unit tests for the internal _sample_coefficients helper."""

    def test_returns_dict_with_correct_keys(self):
        coeffs = TaskGenerator._sample_coefficients(
            {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
            ["B**2 - 4*A*C >= 0"],
        )
        assert set(coeffs.keys()) == {"A", "B", "C"}

    def test_values_are_integers(self):
        coeffs = TaskGenerator._sample_coefficients(
            {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
            ["B**2 - 4*A*C >= 0"],
        )
        for k, v in coeffs.items():
            assert isinstance(v, int), f"{k}={v} is not int"

    def test_unsatisfiable_constraint_raises_value_error(self):
        """A constraint that can never be true must raise ValueError."""
        with pytest.raises(ValueError, match="Could not find valid coefficients"):
            TaskGenerator._sample_coefficients(
                {"A": [1, 5]},
                constraints=["A < 0"],   # A is always positive — impossible
                max_attempts=10,
            )

    def test_no_constraints_always_succeeds(self):
        coeffs = TaskGenerator._sample_coefficients(
            {"A": [1, 5], "B": [-10, 10]},
            constraints=[],
        )
        assert "A" in coeffs and "B" in coeffs


class TestImportedTemplateRobustness:
    """Regression tests for malformed or inconsistent imported templates."""

    def test_lowercase_expr_parameters_use_uppercase_ranges(self):
        template = {
            "topic": "linear_equation",
            "sympy_expr": "a*x + b",
            "ranges": {"A": [1, 1], "B": [2, 2]},
            "constraints": [],
            "equation_rhs": "0",
            "texts": {"en": "Solve: {expr} = 0"},
        }

        result = TaskGenerator.generate(template, locale="en")

        assert result["coefficients"] == {"A": 1, "B": 2}
        assert result["solutions"] == [-2]
        assert "a" not in result["answer_latex"]
        assert "b" not in result["answer_latex"]

    def test_tuple_sympy_expression_reports_clear_error(self):
        template = {
            "topic": "bad_tuple",
            "sympy_expr": "x, 1",
            "ranges": {},
            "constraints": [],
            "texts": {"en": "Compute: {expr}"},
        }

        with pytest.raises(RuntimeError, match="single SymPy expression"):
            TaskGenerator.generate(template, locale="en")
