import sympy as sp
import random

def generate_determinant_2x2():
    """
    Генерирует задачу на поиск определителя матрицы 2x2.
    """
    # Генерируем случайные числа
    a, b = random.randint(-5, 5), random.randint(-5, 5)
    c, d = random.randint(-5, 5), random.randint(-5, 5)
    
    matrix = sp.Matrix([[a, b], [c, d]])
    det = matrix.det()
    
    return {
        "title": "Определитель матрицы 2x2",
        "task_text": "Вычислите определитель заданной матрицы:",
        "matrix_latex": sp.latex(matrix),
        "answer": int(det),
        "step_by_step": f"det(A) = {a}*({d}) - {b}*({c}) = {det}"
    }