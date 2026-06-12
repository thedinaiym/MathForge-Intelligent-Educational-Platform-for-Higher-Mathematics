import random
import re

import sympy as sp


# Protect single-letter SymPy builtins from being interpreted as functions/constants.
_SAFE_LOCALS = {name: sp.Symbol(name) for name in ["N", "I", "E", "O", "S", "C", "Q"]}

# Detect LaTeX-notation expressions the LLM sometimes emits instead of Python/SymPy.
_LATEX_EXPR_RE = re.compile(r"\\[a-zA-Z]")
_UNRESOLVED_PLACEHOLDER_RE = re.compile(r"\{[A-Za-z][A-Za-z0-9_]*\}")


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
        substitutions = TaskGenerator._build_substitutions(coeffs)

        try:
            raw_expr = sp.sympify(sympy_expr_str, locals=_SAFE_LOCALS)
            if not isinstance(raw_expr, sp.Expr):
                raise ValueError(
                    "sympy_expr must parse to a single SymPy expression, "
                    f"got {type(raw_expr).__name__}"
                )
            final_expr = raw_expr.subs(substitutions)
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
                and "= 0" in q_template
            )
            if inferred_zero_equation:
                equation_rhs = "0"

            if equation_rhs is not None and final_expr.free_symbols:
                rhs_expr = sp.sympify(str(equation_rhs), locals=_SAFE_LOCALS).subs(substitutions)
                TaskGenerator._validate_supported_equation(final_expr, rhs_expr)
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
            except (KeyError, ValueError) as exc:
                raise RuntimeError(f"question text has unresolved placeholders: {exc}") from exc

            TaskGenerator._validate_generated_payload(
                question_text=question_text,
                condition_latex=condition_latex,
                answer_latex=answer_latex,
                coefficients=coeffs,
                final_expr=final_expr,
                equation_rhs=equation_rhs,
            )

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

    @staticmethod
    def _build_substitutions(coefficients: dict) -> dict:
        """
        Build SymPy substitutions for declared coefficients.

        Imported LLM templates sometimes use lowercase parameter names in
        sympy_expr while ranges use the required uppercase names. Treat a
        single-letter lowercase form as an alias for its uppercase coefficient
        so templates like ``a*x + b`` still sample from ranges ``A`` and ``B``.
        """
        substitutions: dict = {}
        for name, value in coefficients.items():
            key = str(name)
            substitutions[sp.Symbol(key)] = value
            if len(key) == 1 and key.isalpha():
                substitutions[sp.Symbol(key.lower())] = value
        return substitutions

    @staticmethod
    def _validate_supported_equation(final_expr: sp.Expr, rhs_expr: sp.Expr) -> None:
        x = sp.Symbol("x")
        unsupported = (final_expr - rhs_expr).free_symbols - {x}
        if unsupported:
            names = ", ".join(sorted(str(s) for s in unsupported))
            raise ValueError(f"unsupported symbolic parameters remain after sampling: {names}")

        if x in (final_expr - rhs_expr).free_symbols:
            try:
                poly = sp.Poly(final_expr - rhs_expr, x)
            except sp.PolynomialError as exc:
                raise ValueError(
                    "unsupported non-polynomial equation for automatic PDF generation"
                ) from exc
            if poly.degree() > 2:
                raise ValueError(
                    "unsupported equation degree for automatic PDF generation: "
                    f"{poly.degree()}"
                )

    @staticmethod
    def _validate_generated_payload(
        *,
        question_text: str,
        condition_latex: str,
        answer_latex: str,
        coefficients: dict,
        final_expr: sp.Expr,
        equation_rhs: str | None,
    ) -> None:
        rendered = "\n".join([question_text, condition_latex, answer_latex])
        unresolved = sorted(set(_UNRESOLVED_PLACEHOLDER_RE.findall(rendered)))
        if unresolved:
            raise ValueError(
                "unresolved template placeholders in generated task: "
                + ", ".join(unresolved)
            )

        allowed_symbols = {sp.Symbol("x")} if equation_rhs is not None else set()
        unsupported = final_expr.free_symbols - allowed_symbols
        if unsupported:
            names = ", ".join(sorted(str(s) for s in unsupported))
            raise ValueError(f"unsupported free symbols in generated task: {names}")

        coeff_names = set(str(k) for k in coefficients)
        leaked_coeffs = []
        for name in coeff_names:
            if re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", answer_latex):
                leaked_coeffs.append(name)
        if leaked_coeffs:
            raise ValueError(
                "coefficient placeholders leaked into answer: "
                + ", ".join(sorted(leaked_coeffs))
            )
