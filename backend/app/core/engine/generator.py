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
        # LLM sometimes wraps parameters in {A} instead of plain A.
        # {A} is a Python set in SymPy — strip braces before parsing.
        sympy_expr_str = sympy_expr_str.replace("{", "").replace("}", "")
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

            if equation_rhs is not None and final_expr.free_symbols:
                # Equation-solving task: produce "lhs = rhs" and solve for x.
                # Only when final_expr still has symbolic unknowns (e.g. x).
                # If all variables were substituted to a number, fall through to evaluation.
                rhs_expr = sp.sympify(str(equation_rhs), locals=_SAFE_LOCALS)
                condition_latex = f"{sp.latex(final_expr)} = {sp.latex(rhs_expr)}"

                try:
                    x = sp.Symbol("x")
                    solutions = sp.solve(sp.Eq(final_expr, rhs_expr), x)
                    if solutions:
                        if len(solutions) == 1:
                            answer_latex = f"x = {sp.latex(solutions[0])}"
                        else:
                            answer_latex = ", \\ ".join(f"x = {sp.latex(s)}" for s in solutions)
                    else:
                        answer_latex = sp.latex(sp.simplify(final_expr))
                except Exception:
                    answer_latex = sp.latex(sp.simplify(final_expr))
            else:
                # Evaluation / simplification task (no unknowns left, or no equation_rhs).
                condition_latex = sp.latex(final_expr)
                answer_latex = sp.latex(sp.simplify(final_expr))

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
        # Compile constraints once as Python bytecode — 50-100× faster than SymPy subs()
        # Constraints are our own seed strings (not user input), so eval is safe.
        _safe = {"__builtins__": {}, "abs": abs}
        compiled = [compile(c, "<constraint>", "eval") for c in constraints]

        for _ in range(200):
            subs = {var: random.randint(r[0], r[1]) for var, r in ranges.items()}
            if all(eval(code, _safe, subs) for code in compiled):
                return subs

        raise ValueError("Could not satisfy constraints after 200 attempts")
