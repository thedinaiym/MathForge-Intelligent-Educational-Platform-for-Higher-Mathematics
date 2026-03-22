"""
Unit tests for the Step-by-Step Arbitrator — Phase 3.

Covers:
  - Sign error detection (the canonical CLAUDE.md test case)
  - Correct solutions (no false positives)
  - Error position accuracy (first wrong transition only)
  - Edge cases: single step, identical steps, last-step error
  - Equation vs. pure-expression inputs
  - Unparseable step handling
"""
import pytest

from app.core.engine.arbitrator import Arbitrator


# ── Helpers ────────────────────────────────────────────────────────────────────

def validate(steps):
    return Arbitrator.validate_steps(steps)


# ── 1. Canonical sign-error test case ─────────────────────────────────────────

class TestSignError:
    """
    Student moves +4 to the right side but keeps the sign (should subtract).

    Correct algebra:
        2x + 4 = 10  →  2x = 10 - 4  →  2x = 6  →  x = 3

    Student writes:
        Step 0: 2*x + 4 = 10    (correct)
        Step 1: 2*x = 10 + 4    ← WRONG: sign not flipped when moving term
        Step 2: 2*x = 14        (consistent with their wrong step 1)
    """

    STEPS = ["2*x + 4 = 10", "2*x = 10 + 4", "2*x = 14"]

    def test_error_is_detected(self):
        result = validate(self.STEPS)
        assert result["is_correct"] is False

    def test_error_index_is_one(self):
        """Error occurs at the transition from step 0 to step 1 → index 1."""
        result = validate(self.STEPS)
        assert result["error_index"] == 1

    def test_step_before_is_correct_step(self):
        result = validate(self.STEPS)
        assert result["step_before"] == "2*x + 4 = 10"

    def test_step_with_error_is_wrong_step(self):
        result = validate(self.STEPS)
        assert result["step_with_error"] == "2*x = 10 + 4"

    def test_valid_up_to_is_zero(self):
        result = validate(self.STEPS)
        assert result["valid_up_to"] == 0

    def test_no_parse_error(self):
        result = validate(self.STEPS)
        assert result["parse_error"] is None


# ── 2. Correct solutions — no false positives ──────────────────────────────────

class TestCorrectSolution:

    def test_correct_linear_steps(self):
        """2x + 4 = 10 → 2x = 6 → x = 3  (all steps valid)."""
        steps = ["2*x + 4 = 10", "2*x = 6", "x = 3"]
        result = validate(steps)
        assert result["is_correct"] is True
        assert result["error_index"] is None

    def test_correct_pure_expressions(self):
        """Sequence of equivalent expressions: 2+3, 5, 5 — all the same value."""
        steps = ["2 + 3", "5", "5"]
        result = validate(steps)
        assert result["is_correct"] is True

    def test_correct_single_variable_simplification(self):
        """x**2 - 1 and (x-1)*(x+1) are symbolically identical."""
        steps = ["x**2 - 1", "(x - 1)*(x + 1)"]
        result = validate(steps)
        assert result["is_correct"] is True

    def test_correct_quadratic_steps(self):
        """x**2 - 5*x + 6 = 0 → (x-2)*(x-3) = 0 (factored form, equivalent)."""
        steps = ["x**2 - 5*x + 6 = 0", "(x - 2)*(x - 3) = 0"]
        result = validate(steps)
        assert result["is_correct"] is True


# ── 3. Error position accuracy ─────────────────────────────────────────────────

class TestErrorPosition:

    def test_error_at_last_transition(self):
        """All steps correct except the final one."""
        steps = ["2*x + 4 = 10", "2*x = 6", "x = 4"]  # x = 4 is wrong (should be 3)
        result = validate(steps)
        assert result["is_correct"] is False
        assert result["error_index"] == 2
        assert result["valid_up_to"] == 1

    def test_error_at_first_transition(self):
        """Error introduced immediately at step 1."""
        steps = ["x + 1 = 5", "x = 7", "x = 7"]  # x = 7 is wrong (should be 4)
        result = validate(steps)
        assert result["is_correct"] is False
        assert result["error_index"] == 1
        assert result["valid_up_to"] == 0

    def test_only_first_error_is_reported(self):
        """Multiple wrong transitions — only the earliest one is returned."""
        steps = [
            "2*x + 4 = 10",  # step 0
            "2*x = 10 + 4",  # step 1: first error (sign flip missing)
            "2*x = 99",      # step 2: another error
        ]
        result = validate(steps)
        assert result["error_index"] == 1  # not 2


# ── 4. Edge cases ──────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_single_step_is_trivially_correct(self):
        result = validate(["x + 1 = 5"])
        assert result["is_correct"] is True
        assert result["error_index"] is None

    def test_empty_list_is_trivially_correct(self):
        result = validate([])
        assert result["is_correct"] is True

    def test_two_identical_steps_are_valid(self):
        result = validate(["3*x - 2 = 7", "3*x - 2 = 7"])
        assert result["is_correct"] is True

    def test_two_step_correct(self):
        result = validate(["x + 5 = 12", "x = 7"])
        assert result["is_correct"] is True

    def test_two_step_error(self):
        result = validate(["x + 5 = 12", "x = 8"])  # 8 ≠ 7
        assert result["is_correct"] is False
        assert result["error_index"] == 1

    def test_numeric_only_steps(self):
        """Pure arithmetic: 2 + 3 = 5 followed by 5 = 5."""
        result = validate(["2 + 3 = 5", "5 = 5"])
        assert result["is_correct"] is True


# ── 5. Pure-expression (no '=') steps ─────────────────────────────────────────

class TestPureExpressions:

    def test_equivalent_expressions_valid(self):
        result = validate(["x**2 + 2*x + 1", "(x + 1)**2"])
        assert result["is_correct"] is True

    def test_non_equivalent_expressions_invalid(self):
        result = validate(["x**2 + 2*x + 1", "x**2 + 2*x + 2"])
        assert result["is_correct"] is False
        assert result["error_index"] == 1


# ── 6. Unparseable step ────────────────────────────────────────────────────────

class TestParseError:

    def test_unparseable_step_returns_error(self):
        """A garbled step that cannot be parsed must be flagged, not crash."""
        steps = ["2*x + 4 = 10", "@@##??"]
        result = validate(steps)
        assert result["is_correct"] is False
        assert result["error_index"] == 1
        assert result["parse_error"] is not None


# ── 7. Return shape contract ───────────────────────────────────────────────────

class TestReturnShape:

    def test_correct_result_has_all_keys(self):
        result = validate(["x = 5", "x = 5"])
        for key in ("is_correct", "error_index", "step_before",
                    "step_with_error", "valid_up_to", "parse_error"):
            assert key in result, f"Missing key: {key}"

    def test_error_result_has_all_keys(self):
        result = validate(["x + 1 = 5", "x = 99"])
        for key in ("is_correct", "error_index", "step_before",
                    "step_with_error", "valid_up_to", "parse_error"):
            assert key in result, f"Missing key: {key}"

    def test_correct_result_nones_are_null(self):
        result = validate(["x = 5", "x = 5"])
        assert result["error_index"] is None
        assert result["step_before"] is None
        assert result["step_with_error"] is None
        assert result["parse_error"] is None
