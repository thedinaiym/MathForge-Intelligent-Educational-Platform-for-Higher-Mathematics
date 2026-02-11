import os

# Структура проекта
structure = {
    "mathforge": [
        ".gitignore",
        "README.md",
        "requirements.txt",
        "docker-compose.yml",
        "docs/diagrams",
        "docs/thesis_draft.docx",
        "backend/main.py",
        "backend/config.py",
        "backend/app/__init__.py",
        "backend/app/api/__init__.py",
        "backend/app/api/auth.py",
        "backend/app/api/tasks.py",
        "backend/app/api/generate.py",
        "backend/app/core/__init__.py",
        "backend/app/core/utils.py",
        # ЛИНЕЙНАЯ АЛГЕБРА (Твоя структура)
        "backend/app/core/algebra/__init__.py",
        "backend/app/core/algebra/matrix.py",
        "backend/app/core/algebra/systems.py",
        # МАТАНАЛИЗ (Твоя структура)
        "backend/app/core/calculus/__init__.py",
        "backend/app/core/calculus/integrals.py",
        "backend/app/core/calculus/limits.py",
        "backend/app/services/__init__.py",
        "backend/app/services/ai_client.py",
        "backend/app/services/pdf_maker.py",
        "backend/app/templates/tex/exam_template.tex",
        "backend/app/templates/tex/answer_key_template.tex",
        "backend/app/models/database.py",
        "frontend", # Просто папка, внутри инициализируем через npm
        "lean_proofs/LinearAlgebra.lean",
        "lean_proofs/Calculus.lean"
    ]
}

file_contents = {
    "mathforge/.gitignore": "venv/\n__pycache__/\n*.pdf\n.env\nnode_modules/\n.DS_Store",
    
    "mathforge/requirements.txt": "fastapi\nuvicorn\nsympy\njinja2\npython-multipart\nsqlalchemy\n",

    "mathforge/backend/main.py": """from fastapi import FastAPI
from app.api import tasks, generate

app = FastAPI(title="MathForge API")

# Подключаем роутеры
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(generate.router, prefix="/api/generate", tags=["Generation"])

@app.get("/")
async def root():
    return {"message": "MathForge Backend is Running!"}
""",

    "mathforge/backend/app/api/generate.py": """from fastapi import APIRouter
from app.core.algebra.matrix import generate_determinant_problem

router = APIRouter()

@router.get("/demo")
async def demo_generation():
    # Тестовая генерация задачи через ядро
    problem = generate_determinant_problem()
    return {"problem": problem}
""",

    "mathforge/backend/app/api/tasks.py": """from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def get_tasks():
    return [{"id": 1, "topic": "Matrix", "name": "Find Determinant"}]
""",

    
    "mathforge/backend/app/core/algebra/matrix.py": """import sympy as sp
import random

def generate_determinant_problem(min_val=-5, max_val=5):
    \"\"\"
    Генерация задачи на поиск определителя матрицы 2x2.
    \"\"\"
    # 1. Генерируем числа (Logic)
    a, b = random.randint(min_val, max_val), random.randint(min_val, max_val)
    c, d = random.randint(min_val, max_val), random.randint(min_val, max_val)
    
    # 2. Создаем матрицу SymPy
    matrix = sp.Matrix([[a, b], [c, d]])
    
    # 3. Считаем решение
    det = matrix.det()
    
    # 4. Формируем LaTeX
    latex_condition = sp.latex(matrix)
    
    return {
        "type": "matrix_determinant",
        "question_latex": f"Compute the determinant: $$ {latex_condition} $$",
        "answer": int(det),
        "solution_latex": f"Det = ({a})*({d}) - ({b})*({c}) = {det}"
    }
""",

    "mathforge/backend/app/core/calculus/integrals.py": """import sympy as sp

def generate_simple_integral():
    x = sp.symbols('x')
    # Пример логики для интегралов...
    pass
""",
    
    "mathforge/README.md": "# MathForge Project\nGenerated via script."
}

def create_structure():
    for root_dir, paths in structure.items():
        if not os.path.exists(root_dir):
            os.makedirs(root_dir)
            
        for path in paths:
            full_path = os.path.join(root_dir, path)
            
            if "." not in os.path.basename(path): 
                os.makedirs(full_path, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                
                content = file_contents.get(os.path.join(root_dir, path), "")
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(content)
                    
    print(f"✅ Проект успешно создан в папке 'mathforge'!")
    print("Теперь следуй инструкции в чате.")

if __name__ == "__main__":
    create_structure()