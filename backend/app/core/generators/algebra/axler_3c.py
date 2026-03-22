import sympy as sp
import random
from app.core.generators.base import BaseTaskGenerator
from app.core.generators.registry import TaskRegistry

@TaskRegistry.register(topic_id="axler_3c_mult", name="Умножение матриц", chapter="3C Matrices")
class MatrixMultiplicationGenerator(BaseTaskGenerator):
    def generate(self, difficulty: str = "medium"):
        # Логика сложности
        dim = 2 if difficulty == "easy" else 3
        val_range = (1, 5) if difficulty == "easy" else (-5, 5)

        # Генерируем случайные матрицы
        A = sp.Matrix(dim, dim, [random.randint(*val_range) for _ in range(dim*dim)])
        B = sp.Matrix(dim, dim, [random.randint(*val_range) for _ in range(dim*dim)])
        C = A * B
        
        return {
            "condition_latex": f"A = {sp.latex(A)}, \\quad B = {sp.latex(B)}",
            "title": "Найдите произведение матриц A и B",
            "answer": str(C.tolist()),
            "json_steps": {
                "A": A.tolist(), 
                "B": B.tolist(), 
                "result": C.tolist()
            }
        }