"""
TaskGenerator — Phase 3 implementation.

Accepts template_json from DB, generates random coefficients within ranges,
validates constraints using SymPy, computes exact answer via sympy.solve(),
and returns the final LaTeX string in the requested locale.

CRITICAL: Never hardcode math topics. All math comes from template_json.
"""
import random
from typing import Any

import sympy as sp


class TaskGenerator:
    """
    Deterministic task generator driven entirely by template_json from the DB.
    Uses SymPy for 100% correct math — no LLM involved in solving.

    Two template modes are supported:

    ── Equation mode  (sympy_expr contains variable 'x') ─────────────────────
      sympy_expr encodes the LHS of "expr = 0".
      After parameter substitution, the generator solves for x.
      Example: "A*x**2 + B*x + C"

    ── Computation mode  (sympy_expr is a parameter-only formula) ────────────
      sympy_expr evaluates to a scalar once parameters are substituted.
      The answer IS the evaluated value (no equation to solve).
      Example: "A*D - B*C"  →  determinant of 2×2 matrix

    In both modes question_text is rendered by calling
        text_template.format(expr=..., **coefficients)
    so templates may use either {expr} or {A}/{B}/… placeholders freely.
    """

    @staticmethod
    def generate(template_json: dict[str, Any], locale: str = "ru") -> dict[str, Any]:
        """
        Generate a single task from a template.

        Returns a dict with keys:
          topic, question_text, condition_latex, answer_latex,
          solutions, coefficients
        """
        topic: str = template_json.get("topic", "unknown")
        sympy_expr_str: str = template_json["sympy_expr"]
        ranges: dict[str, list[int]] = template_json["ranges"]
        constraints: list[str] = template_json.get("constraints", [])
        texts: dict[str, str] = template_json.get("texts", {})

        # ── Step 1: sample integer coefficients ──────────────────────────────
        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)

        # ── Step 2: parse and substitute ─────────────────────────────────────
        raw_expr = sp.sympify(sympy_expr_str)
        subs_dict = {sp.Symbol(k): v for k, v in coeffs.items()}
        final_expr = raw_expr.subs(subs_dict)

        # ── Step 3: detect mode by remaining free symbols ────────────────────
        free_syms = final_expr.free_symbols

        if free_syms:
            # ── Equation mode ─────────────────────────────────────────────────
            solve_var = sorted(free_syms, key=lambda s: s.name)[0]
            solutions: list = sp.solve(final_expr, solve_var)

            expr_latex = sp.latex(final_expr)
            condition_latex = f"{expr_latex} = 0"

            if solutions:
                parts = [
                    f"{sp.latex(solve_var)} = {sp.latex(sol)}"
                    for sol in solutions
                ]
                answer_latex = r",\quad ".join(parts)
            else:
                answer_latex = r"\text{Нет вещественных решений}"

        else:
            # ── Computation mode ──────────────────────────────────────────────
            # The expression fully collapses to a number; that number IS the answer.
            value = sp.simplify(final_expr)
            solutions = [value]

            # Show the un-substituted formula (with letters) as the "question expr"
            # and the evaluated number as the answer.
            expr_latex = sp.latex(raw_expr)          # e.g. "A D - B C"
            condition_latex = sp.latex(raw_expr.subs(subs_dict))  # actual number
            answer_latex = sp.latex(value)

        # ── Step 4: build localised question text ────────────────────────────
        # Templates may use any combination of:
        #   {expr}  → substituted LaTeX expression
        #   {A}, {B}, … → individual sampled coefficients
        text_template = (
            texts.get(locale)
            or texts.get("ru")
            or texts.get("en")
            or "Вычислите: {expr}"
        )
        try:
            question_text = text_template.format(expr=f"${expr_latex}$", **coeffs)
        except (KeyError, IndexError):
            # Fallback: replace unknown placeholders gracefully
            question_text = text_template.format(expr=f"${expr_latex}$")

        return {
            "topic": topic,
            "question_text": question_text,
            "condition_latex": condition_latex,
            "answer_latex": answer_latex,
            "solutions": solutions,
            "coefficients": coeffs,
        }

    @staticmethod
    def generate_ort_comparison(template_json: dict[str, Any]) -> dict[str, Any]:
        """
        Generate one ORT comparison problem from a DB template_json.

        Expected template_json keys:
            sympy_expr_A    — SymPy expression string for Column A
            sympy_expr_B    — SymPy expression string for Column B
            ranges          — {param: [lo, hi]} integer sampling ranges
            constraints     — list of SymPy inequality strings (optional)
            label_A         — LaTeX display string for Column A (optional)
            label_B         — LaTeX display string for Column B (optional)
            given_template  — Python .format()-compatible condition string (optional)
        """
        expr_A_str: str = template_json["sympy_expr_A"]
        expr_B_str: str = template_json["sympy_expr_B"]
        ranges: dict[str, list[int]] = template_json["ranges"]
        constraints: list[str] = template_json.get("constraints", [])
        label_A: str = template_json.get("label_A", f"${expr_A_str}$")
        label_B: str = template_json.get("label_B", f"${expr_B_str}$")
        given_tmpl: str = template_json.get("given_template", "")

        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)
        subs = {sp.Symbol(k): v for k, v in coeffs.items()}

        val_A = sp.sympify(expr_A_str).subs(subs)
        val_B = sp.sympify(expr_B_str).subs(subs)
        diff = sp.simplify(val_A - val_B)

        try:
            f_diff = float(diff)
            if f_diff > 1e-9:
                answer, rel_sym = "А", ">"
            elif f_diff < -1e-9:
                answer, rel_sym = "Б", "<"
            else:
                answer, rel_sym = "В", "="
        except (TypeError, ValueError):
            answer, rel_sym = "Г", "?"

        val_A_latex = sp.latex(val_A)
        val_B_latex = sp.latex(val_B)

        if given_tmpl:
            given_text = given_tmpl.format(**coeffs)
        else:
            given_text = ",\\ ".join(f"${k} = {v}$" for k, v in coeffs.items())

        problem_latex = (
            f"{given_text}\\qquad"
            f"\\textbf{{A:}}\\ {label_A}\\qquad"
            f"\\textbf{{B:}}\\ {label_B}"
        )

        if answer != "Г":
            solution_latex = (
                f"A = {val_A_latex},\\quad B = {val_B_latex}"
                f"\\quad\\Rightarrow\\quad {val_A_latex} {rel_sym} {val_B_latex}."
                f"\\quad\\text{{Ответ: {answer}}}"
            )
        else:
            solution_latex = r"\text{Нельзя однозначно определить.}\quad\text{Ответ: Г}"

        return {
            "problem_latex": problem_latex,
            "answer": answer,
            "solution_latex": solution_latex,
            "coefficients": coeffs,
        }

    @staticmethod
    def _sample_coefficients(
        ranges: dict[str, list[int]],
        constraints: list[str],
        max_attempts: int = 200,
    ) -> dict[str, int]:
        """
        Sample random integer coefficients satisfying all SymPy constraints.

        Raises ValueError if no valid combination is found within max_attempts.
        """
        sym_map = {k: sp.Symbol(k) for k in ranges}
        parsed_constraints = [sp.sympify(c) for c in constraints]

        for _ in range(max_attempts):
            vals = {k: random.randint(lo, hi) for k, (lo, hi) in ranges.items()}
            subs_dict = {sym_map[k]: v for k, v in vals.items()}

            if all(bool(c.subs(subs_dict)) for c in parsed_constraints):
                return vals

        raise ValueError(
            f"Could not find valid coefficients after {max_attempts} attempts. "
            f"Constraints: {constraints}"
        )
