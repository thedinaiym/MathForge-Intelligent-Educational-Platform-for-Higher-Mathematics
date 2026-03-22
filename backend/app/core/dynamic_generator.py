import sympy as sp
import random

class UniversalSympyGenerator:
    def __init__(self, template_json: dict):
        self.template = template_json

    def generate(self):
        # 1. Генерируем случайные числа для переменных на основе диапазонов (ranges)
        vals = {}
        for var in self.template["variables"]:
            min_val, max_val = self.template["ranges"][var]
            val = random.randint(min_val, max_val)
            
            # Исключаем нули, если это указано в шаблоне (например, x не может делиться на 0)
            if var in self.template.get("exclude_zero", []) and val == 0:
                val = 1 
            vals[var] = val

        # 2. Создаем символы SymPy
        x = sp.Symbol('x')
        
        # 3. Подставляем числа в выражение безопасно
        # Превращаем строку "Eq(A*x + B, C)" в реальный объект SymPy
        expr_str = self.template["expression"]
        for var, val in vals.items():
            expr_str = expr_str.replace(var, str(val))
            
        # Parse expression (безопасный парсинг строки в математику)
        from sympy.parsing.sympy_parser import parse_expr
        parsed_expr = parse_expr(expr_str)

        # 4. Решаем через SymPy (100% точность, никаких галлюцинаций ИИ!)
        if self.template["type"] == "equation":
            solution = sp.solve(parsed_expr, x)
        
        # 5. Возвращаем результат для фронтенда / PDF
        return {
            "condition_latex": sp.latex(parsed_expr),
            "answer": sp.latex(solution[0]) if solution else "Нет решений",
            "json_steps": { "equation": str(parsed_expr), "result": str(solution) }
        }