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
    """

    @staticmethod
    def generate(template_json: dict[str, Any], locale: str = "ru") -> dict[str, Any]:
        """
        Generate a single task from a template.

        Args:
            template_json: The JSONB template from task_templates table.
            locale: One of 'en', 'ru', 'kg'.

        Returns:
            dict with keys:
              - topic (str)
              - question_text (str): Localized human-readable prompt.
              - condition_latex (str): The expression in LaTeX, e.g. "x^2 + 3x - 4 = 0"
              - answer_latex (str): LaTeX-formatted solution(s).
              - solutions (list): Raw SymPy solution objects.
              - coefficients (dict): The sampled integer coefficients.
        """
        topic = template_json.get("topic", "unknown")
        sympy_expr_str: str = template_json["sympy_expr"]
        ranges: dict[str, list[int]] = template_json["ranges"]
        constraints: list[str] = template_json.get("constraints", [])
        texts: dict[str, str] = template_json.get("texts", {})

        # Step 1: sample integer coefficients that satisfy all constraints.
        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)

        # Step 2: parse the symbolic expression (coefficients are still symbols here).
        raw_expr = sp.sympify(sympy_expr_str)

        # Step 3: substitute sampled integer values for coefficient symbols.
        subs_dict = {sp.Symbol(k): v for k, v in coeffs.items()}
        final_expr = raw_expr.subs(subs_dict)

        # Step 4: identify the solve variable — symbols remaining after substitution.
        free_syms = final_expr.free_symbols
        if free_syms:
            # Sort alphabetically for determinism; typically this is 'x'.
            solve_var = sorted(free_syms, key=lambda s: s.name)[0]
        else:
            # Degenerate case: expression fully collapsed to a constant.
            solve_var = sp.Symbol("x")

        # Step 5: solve equation final_expr = 0 with SymPy (exact, no numerics).
        solutions: list = sp.solve(final_expr, solve_var)

        # Step 6: build LaTeX strings.
        expr_latex = sp.latex(final_expr)
        condition_latex = f"{expr_latex} = 0"

        if solutions:
            answer_parts = [
                f"{sp.latex(solve_var)} = {sp.latex(sol)}" for sol in solutions
            ]
            answer_latex = r",\quad ".join(answer_parts)
        else:
            answer_latex = r"\text{No real solutions}"

        # Step 7: format localized question text.
        text_template = texts.get(locale) or texts.get("en") or "Solve: {expr} = 0"
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

        Returns:
            dict with keys:
                problem_latex   — LaTeX string for the problem statement
                answer          — one of "А", "Б", "В", "Г"
                solution_latex  — step-by-step LaTeX solution string
                coefficients    — sampled integer values dict
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
        max_attempts: int = 100,
    ) -> dict[str, int]:
        """
        Sample random integer coefficients satisfying all SymPy constraints.

        Args:
            ranges: Mapping of symbol name → [lo, hi] (inclusive).
            constraints: List of SymPy-parseable inequality strings, e.g. "B**2 - 4*A*C >= 0".
            max_attempts: Retry limit before giving up.

        Returns:
            Dict mapping symbol name → sampled integer value.

        Raises:
            ValueError: If no valid combination is found within max_attempts.
        """
        sym_map = {k: sp.Symbol(k) for k in ranges}

        # Pre-parse constraint expressions once for efficiency.
        parsed_constraints = [sp.sympify(c) for c in constraints]

        for _ in range(max_attempts):
            vals = {k: random.randint(lo, hi) for k, (lo, hi) in ranges.items()}
            subs_dict = {sym_map[k]: v for k, v in vals.items()}

            if all(bool(c.subs(subs_dict)) for c in parsed_constraints):
                return vals

        raise ValueError(
            f"Could not find valid coefficients satisfying constraints after "
            f"{max_attempts} attempts: {constraints}"
        )
