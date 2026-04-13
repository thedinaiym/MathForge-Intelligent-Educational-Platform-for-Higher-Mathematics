import random
import sympy as sp

class TaskGenerator:
    @staticmethod
    def generate(template_json: dict, locale: str = "ru"):
        """
        Генерирует задачу на основе шаблона.
        """
        # 1. Извлекаем данные из шаблона
        ranges = template_json.get("ranges", {})
        constraints = template_json.get("constraints", [])
        sympy_expr_str = template_json.get("sympy_expr", "0")
        
        # 2. Генерируем коэффициенты, соблюдая ограничения
        coeffs = TaskGenerator._sample_coefficients(ranges, constraints)
        
        # 3. Подставляем коэффициенты в выражение
        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: защищаем символы N, I, E, O, S от превращения в функции
        safe_locals = {name: sp.Symbol(name) for name in ['N', 'I', 'E', 'O', 'S', 'C', 'Q']}
        
        try:
            raw_expr = sp.sympify(sympy_expr_str, locals=safe_locals)
            # Вычисляем финальное выражение
            final_expr = raw_expr.subs(coeffs)
            
            # Формируем ответ 
            return {
                "question_text": template_json.get("question_text", {}).get(locale, ""),
                "condition_latex": sp.latex(final_expr),
                "answer_latex": sp.latex(sp.simplify(final_expr))
            }
        except Exception as e:
            raise RuntimeError(f"SymPy error: {str(e)}")

    @staticmethod
    def _sample_coefficients(ranges: dict, constraints: list[str]) -> dict:
        """
        Подбирает случайные числа для переменных, пока не будут выполнены все условия.
        """
        safe_locals = {name: sp.Symbol(name) for name in ['N', 'I', 'E', 'O', 'S', 'C', 'Q']}
        parsed_constraints = [sp.sympify(c, locals=safe_locals) for c in constraints]
        
        max_attempts = 100
        for _ in range(max_attempts):
            subs_dict = {}
            for var, r in ranges.items():
                subs_dict[var] = random.randint(r[0], r[1])
            
            # ИСПРАВЛЕНИЕ: Безопасный вызов .subs() только если объект является выражением SymPy (hasattr)
            if all(bool(c.subs(subs_dict) if hasattr(c, 'subs') else c) for c in parsed_constraints):
                return subs_dict
                
        raise ValueError("Could not satisfy constraints after 100 attempts")