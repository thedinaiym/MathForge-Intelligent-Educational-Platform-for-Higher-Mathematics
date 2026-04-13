"""
Step-by-Step Arbitrator — Phase 3 implementation.

Input: list of strings representing a student's solution steps.
       Steps may be plain expressions ("2*x + 4") or equations ("2*x + 4 = 10").
       Both Python-style notation (2*x) and LaTeX (\frac{1}{2}) are accepted.

For each consecutive pair (Step N, Step N+1):
  1. Normalise both to a single SymPy expression:
       - equations  →  lhs − rhs
       - expressions → expression as-is
  2. Compute  simplify(expr_N − expr_{N+1})
  3. If result == 0  →  transition is mathematically valid
     If result != 0  →  error flagged at index N+1

CRITICAL: Never use an LLM for validation — SymPy only.
"""
from __future__ import annotations

from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import (
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

# Lazy-import to avoid hard-crashing when antlr4 / latex parser is absent.
try:
    from sympy.parsing.latex import parse_latex as _parse_latex  # type: ignore

    _LATEX_AVAILABLE = True
except Exception:  # pragma: no cover
    _LATEX_AVAILABLE = False

_IMPLICIT_TRANSFORMS = standard_transformations + (implicit_multiplication_application,)


# ── Internal parsing helpers ──────────────────────────────────────────────────

def _parse_expression(s: str) -> sp.Expr:
    """
    Parse a single expression string (no '=') to a SymPy Expr.

    Tries, in order:
      1. sympify         — handles Python-style notation: "2*x + 4"
      2. parse_latex     — handles proper LaTeX: "\\frac{x^2}{2}"
      3. parse_expr with implicit multiplication — handles "2x + 4"

    Raises ValueError if all strategies fail.
    """
    s = s.strip()

    # Strategy 1: sympify (covers the vast majority of well-formed Python strings)
    try:
        result = sp.sympify(s, evaluate=True)
        if isinstance(result, sp.Basic):
            return result
    except Exception:
        pass

    # Strategy 2: LaTeX parser (for OCR output that arrives as real LaTeX)
    if _LATEX_AVAILABLE:
        try:
            return _parse_latex(s)
        except Exception:
            pass

    # Strategy 3: parse_expr with implicit multiplication (e.g. "2x + 4")
    try:
        return parse_expr(s, transformations=_IMPLICIT_TRANSFORMS)
    except Exception:
        pass

    raise ValueError(f"Cannot parse expression: {s!r}")


def _step_to_expr(step: str) -> sp.Expr:
    """
    Convert a solution step to a canonical SymPy expression.

    Equations (contain '=') are returned as  lhs − rhs, so that two
    equivalent equations yield a difference of 0.
    Pure expressions are returned as-is.
    """
    step = step.strip()
    if "=" in step:
        lhs_str, rhs_str = step.split("=", 1)
        lhs = _parse_expression(lhs_str)
        rhs = _parse_expression(rhs_str)
        return lhs - rhs
    return _parse_expression(step)


# ── Public Arbitrator class ───────────────────────────────────────────────────

class Arbitrator:
    """
    Validates a student's step-by-step solution using SymPy symbolic
    simplification.  Purely deterministic — no AI involved.
    """

    @staticmethod
    def validate_steps(steps: list[str]) -> dict[str, Any]:
        """
        Validate a sequence of solution steps.

        Args:
            steps: List of step strings (LaTeX or Python-notation expressions /
                   equations).  Minimum 2 elements for a meaningful check.

        Returns:
            dict with keys:
              is_correct      (bool)        True if every transition is valid.
              error_index     (int | None)  0-indexed position of the first
                                            erroneous step; None if correct.
              step_before     (str | None)  The step just before the error.
              step_with_error (str | None)  The step that introduced the error.
              valid_up_to     (int)         Index of the last confirmed-valid step.
              parse_error     (str | None)  Set when a step could not be parsed.
        """
        if len(steps) < 2:
            return {
                "is_correct": True,
                "error_index": None,
                "step_before": None,
                "step_with_error": None,
                "valid_up_to": max(len(steps) - 1, 0),
                "parse_error": None,
            }

        for i in range(len(steps) - 1):
            step_a = steps[i]
            step_b = steps[i + 1]

            try:
                expr_a = _step_to_expr(step_a)
                expr_b = _step_to_expr(step_b)
            except ValueError as exc:
                return {
                    "is_correct": False,
                    "error_index": i + 1,
                    "step_before": step_a,
                    "step_with_error": step_b,
                    "valid_up_to": i,
                    "parse_error": str(exc),
                }

            try:
                diff = sp.simplify(expr_a - expr_b)
            except Exception as exc:
                # SymPy internal error (RecursionError, NotImplementedError, etc.)
                return {
                    "is_correct": False,
                    "error_index": i + 1,
                    "step_before": step_a,
                    "step_with_error": step_b,
                    "valid_up_to": i,
                    "parse_error": f"Simplification failed: {exc}",
                }

            if diff != 0:
                # Secondary check: multiplicative equivalence.
                # Dividing / multiplying both sides by a nonzero constant changes
                # lhs − rhs but leaves the equation equivalent (e.g. 2x = 6 → x = 3).
                # If expr_a / expr_b simplifies to a nonzero numeric constant, the
                # transition is valid.
                transition_valid = False
                if expr_b != 0:
                    try:
                        ratio = sp.simplify(expr_a / expr_b)
                        if ratio.is_number and ratio != 0:
                            transition_valid = True
                    except Exception:
                        pass

                if not transition_valid:
                    return {
                        "is_correct": False,
                        "error_index": i + 1,
                        "step_before": step_a,
                        "step_with_error": step_b,
                        "valid_up_to": i,
                        "parse_error": None,
                    }

        return {
            "is_correct": True,
            "error_index": None,
            "step_before": None,
            "step_with_error": None,
            "valid_up_to": len(steps) - 1,
            "parse_error": None,
        }
