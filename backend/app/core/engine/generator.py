import random
import re

import sympy as sp


# Protect single-letter SymPy builtins from being interpreted as functions/constants.
_SAFE_LOCALS = {name: sp.Symbol(name) for name in ["N", "I", "E", "O", "S", "C", "Q"]}

# Detect LaTeX-notation expressions the LLM sometimes emits instead of Python/SymPy.
_LATEX_EXPR_RE = re.compile(r"\\[a-zA-Z]")


class TaskGenerator:
    @staticmethod
    def generate(template_json: dict, locale: str = "ru") -> dict:
        ranges = template_json.get("ranges", {})
        constraints = template_json.get("constraints", [])
        sympy_expr_str = template_json.get("sympy_expr", "0")
        sympy_expr_str = sympy_expr_str.replace("{", "").replace("}", "")
        topic = template_json.get("topic", "")

        if _LATEX_EXPR_RE.search(sympy_expr_str):
            raise RuntimeError(
                "sympy_expr contains LaTeX notation which SymPy cannot parse: "
                f"{sympy_expr_str!r:.120}"
            )

        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)

        try:
            raw_expr = sp.sympify(sympy_expr_str, locals=_SAFE_LOCALS)
            final_expr = raw_expr.subs(coeffs)
            latex_expr = sp.latex(final_expr)

            q_texts = template_json.get("question_text") or template_json.get("texts", {})
            if isinstance(q_texts, dict):
                q_template = q_texts.get(locale, q_texts.get("en", ""))
            else:
                q_template = str(q_texts)

            equation_rhs = template_json.get("equation_rhs")
            inferred_zero_equation = (
                equation_rhs is None
                and bool(final_expr.free_symbols)
                and "{expr}" in q_template
                and "= 0" in q_template
            )
            if inferred_zero_equation:
                equation_rhs = "0"

            if equation_rhs is not None and final_expr.free_symbols:
                rhs_expr = sp.sympify(str(equation_rhs), locals=_SAFE_LOCALS)
                condition_latex = f"{latex_expr} = {sp.latex(rhs_expr)}"

                try:
                    x = sp.Symbol("x")
                    solutions = sp.solve(sp.Eq(final_expr, rhs_expr), x)
                    if solutions:
                        if len(solutions) == 1:
                            answer_latex = f"x = {sp.latex(solutions[0])}"
                        else:
                            answer_latex = ", \\ ".join(
                                f"x = {sp.latex(solution)}" for solution in solutions
                            )
                    else:
                        answer_latex = sp.latex(sp.simplify(final_expr))
                except Exception:
                    solutions = []
                    answer_latex = sp.latex(sp.simplify(final_expr))
            else:
                solutions = []
                condition_latex = latex_expr
                answer_latex = sp.latex(sp.simplify(final_expr))

            try:
                question_text = q_template.format(
                    **{str(k): v for k, v in coeffs.items()},
                    expr=f"${latex_expr}$",
                )
            except (KeyError, ValueError):
                question_text = q_template

            return {
                "topic": topic,
                "question_text": question_text,
                "condition_latex": condition_latex,
                "answer_latex": answer_latex,
                "solutions": solutions,
                "coefficients": coeffs,
            }

        except Exception as exc:
            raise RuntimeError(f"SymPy error: {exc}") from exc

    @staticmethod
    def _sample_coefficients(
        ranges: dict,
        constraints: list[str],
        max_attempts: int = 200,
    ) -> dict:
        # Constraints are internal seed strings, not user input.
        safe_globals = {"__builtins__": {}, "abs": abs}
        compiled = []
        for constraint in constraints:
            try:
                compiled.append(compile(constraint, "<constraint>", "eval"))
            except SyntaxError as exc:
                raise ValueError(
                    f"Invalid constraint expression {constraint!r}: {exc}"
                ) from exc

        for _ in range(max_attempts):
            subs = {var: random.randint(bounds[0], bounds[1]) for var, bounds in ranges.items()}
            if all(eval(code, safe_globals, subs) for code in compiled):
                return subs

        raise ValueError(f"Could not find valid coefficients after {max_attempts} attempts")
