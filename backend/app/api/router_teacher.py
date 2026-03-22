import os
import random
import tempfile
import subprocess
from typing import List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Пытаемся импортировать наш движок генерации задач
try:
    from app.core.engine import UniversalMathEngine
except ImportError:
    UniversalMathEngine = None

load_dotenv()
router = APIRouter()

# Подключение к БД для извлечения шаблонов
supabase_url = os.getenv("SUPABASE_REST_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url else None

class GeneratePDFRequest(BaseModel):
    title: str
    topics: List[str]
    variants: int
    questions_per_variant: int
    difficulty: str

def cleanup_temp_file(path: str):
    """Удаляет временный PDF файл после отправки пользователю"""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Ошибка при удалении временного файла: {e}")

@router.post("/generate-pdf")
async def generate_pdf(payload: GeneratePDFRequest, background_tasks: BackgroundTasks):
    print(f"Начало генерации PDF: {payload.title}, Вариантов: {payload.variants}")
    
    # 1. Достаем нужные шаблоны задач из БД
    templates = []
    if supabase:
        response = supabase.table("task_templates").select("*").in_("topic_id", payload.topics).eq("status", "approved").execute()
        templates = response.data

    if not templates:
        raise HTTPException(status_code=400, detail="Шаблоны для выбранных тем не найдены в БД.")

    # 2. Формируем LaTeX документ (Преамбула с поддержкой русского языка)
    latex_doc = r"""\documentclass[12pt, a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[russian]{babel}
\usepackage{amsmath, amssymb}
\usepackage[margin=2cm]{geometry}
\begin{document}
"""
    latex_doc += f"\\begin{{center}}\\LARGE\\textbf{{{payload.title}}}\\end{{center}}\\vspace{{1cm}}\n\n"
    
    # Отдельная строка для ответов (будут на последних страницах)
    answers_doc = r"\newpage\begin{center}\LARGE\textbf{Ответы к вариантам}\end{center}\vspace{1cm}" + "\n"

    # 3. Генерируем варианты и задачи
    for var_idx in range(1, payload.variants + 1):
        latex_doc += f"\\subsection*{{Вариант {var_idx}}}\n\\begin{{enumerate}}\n"
        answers_doc += f"\\subsection*{{Вариант {var_idx}}}\n\\begin{{enumerate}}\n"
        
        for q_idx in range(payload.questions_per_variant):
            # Выбираем случайный шаблон из отмеченных учителем
            template = random.choice(templates)
            
            # Генерируем задачу через SymPy
            if UniversalMathEngine:
                task = UniversalMathEngine.generate_task(template)
                latex_doc += f"\\item ${task['condition_latex']}$\n"
                answers_doc += f"\\item ${task['answer']}$\n"
            else:
                latex_doc += "\\item $Движок SymPy не подключен$\n"
                answers_doc += "\\item $Нет ответа$\n"

        latex_doc += "\\end{enumerate}\n\\vspace{1cm}\n"
        answers_doc += "\\end{enumerate}\n\\vspace{0.5cm}\n"

    # Закрываем документ
    latex_doc += answers_doc + "\n\\end{document}"

    # 4. Создаем временную папку и компилируем через MiKTeX (pdflatex)
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            tex_file_path = os.path.join(temp_dir, "worksheet.tex")
            pdf_file_path = os.path.join(temp_dir, "worksheet.pdf")
            
            # Записываем наш LaTeX код в файл
            with open(tex_file_path, "w", encoding="utf-8") as f:
                f.write(latex_doc)
            
            # Вызываем pdflatex (убедись, что MiKTeX добавлен в системный PATH!)
            process = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "worksheet.tex"],
                cwd=temp_dir,
                capture_output=True,
                text=True
            )
            
            if not os.path.exists(pdf_file_path):
                print(process.stdout) # Выводим логи ошибки LaTeX в терминал
                raise Exception("Ошибка компиляции LaTeX. Проверьте логи.")
                
            # Копируем PDF в безопасное место для отправки, так как temp_dir сейчас удалится
            final_pdf_path = f"temp_worksheet_{random.randint(1000,9999)}.pdf"
            import shutil
            shutil.copy(pdf_file_path, final_pdf_path)
            
            # Добавляем задачу удаления файла после того, как фронтенд его скачает
            background_tasks.add_task(cleanup_temp_file, final_pdf_path)
            
            print("PDF успешно сгенерирован и готов к отправке!")
            
            return FileResponse(
                path=final_pdf_path, 
                media_type="application/pdf", 
                filename=f"{payload.title}.pdf"
            )
            
    except Exception as e:
        print(f"Ошибка при создании PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))