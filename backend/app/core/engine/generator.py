import random
import sympy as sp

# Protect single-letter SymPy builtins from being interpreted as functions/constants
_SAFE_LOCALS = {name: sp.Symbol(name) for name in ['N', 'I', 'E', 'O', 'S', 'C', 'Q']}


class TaskGenerator:
    @staticmethod
    def generate(template_json: dict, locale: str = "ru") -> dict:
        ranges = template_json.get("ranges", {})
        constraints = template_json.get("constraints", [])
        sympy_expr_str = template_json.get("sympy_expr", "0")
        topic = template_json.get("topic", "")

        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)

        try:
            raw_expr = sp.sympify(sympy_expr_str, locals=_SAFE_LOCALS)
            final_expr = raw_expr.subs(coeffs)

            # ── Question text ──────────────────────────────────────────────────
            # Templates may store the text template under "question_text" or "texts".
            # Substitute sampled coefficient values into the template string.
            q_texts = template_json.get("question_text") or template_json.get("texts", {})
            q_template = q_texts.get(locale, q_texts.get("en", ""))
            try:
                question_text = q_template.format(**{str(k): v for k, v in coeffs.items()})
            except (KeyError, ValueError):
                question_text = q_template

            # ── condition_latex & answer_latex ─────────────────────────────────
            equation_rhs = template_json.get("equation_rhs")

            if equation_rhs is not None:
                # Equation-solving task: produce "lhs = rhs" and solve for x.
                rhs_expr = sp.sympify(str(equation_rhs), locals=_SAFE_LOCALS)
                condition_latex = f"${sp.latex(final_expr)} = {sp.latex(rhs_expr)}$"

                # Try to solve the equation for x symbolically.
                try:
                    x = sp.Symbol("x")
                    solutions = sp.solve(sp.Eq(final_expr, rhs_expr), x)
                    if solutions:
                        if len(solutions) == 1:
                            answer_latex = f"$x = {sp.latex(solutions[0])}$"
                        else:
                            parts = ", ".join(f"x = {sp.latex(s)}" for s in solutions)
                            answer_latex = f"${parts}$"
                    else:
                        answer_latex = f"${sp.latex(sp.simplify(final_expr))}$"
                except Exception:
                    answer_latex = f"${sp.latex(sp.simplify(final_expr))}$"
            else:
                # Evaluation / simplification task: show the computed value.
                condition_latex = f"${sp.latex(final_expr)}$"
                answer_latex = f"${sp.latex(sp.simplify(final_expr))}$"

            return {
                "topic": topic,
                "question_text": question_text,
                "condition_latex": condition_latex,
                "answer_latex": answer_latex,
            }

        except Exception as exc:
            raise RuntimeError(f"SymPy error: {exc}") from exc

    @staticmethod
    def _sample_coefficients(ranges: dict, constraints: list[str]) -> dict:
        parsed_constraints = [sp.sympify(c, locals=_SAFE_LOCALS) for c in constraints]

        for _ in range(100):
            subs = {var: random.randint(r[0], r[1]) for var, r in ranges.items()}
            if all(
                bool(c.subs(subs) if hasattr(c, "subs") else c)
                for c in parsed_constraints
            ):
                return subs

        raise ValueError("Could not satisfy constraints after 100 attempts")
