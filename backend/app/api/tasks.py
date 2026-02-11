
from fastapi import APIRouter, Body
from fastapi.responses import Response
from fpdf import FPDF
import os
import io
import matplotlib.pyplot as plt
from app.core.algebra.matrix import generate_determinant_2x2
router = APIRouter()

@router.get("/generate-matrix")
async def get_matrix_task():
    return generate_determinant_2x2()

# Функция для превращения LaTeX в картинку (в памяти)
def latex_to_image(latex_str):
    buf = io.BytesIO()
    plt.rc('text', usetex=False) # Используем встроенный рендерер matplotlib
    fig = plt.figure(figsize=(2, 1)) # Размер картинки
    plt.text(0.5, 0.5, f"${latex_str}$", size=20, ha='center', va='center')
    plt.axis('off')
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.05, dpi=200)
    plt.close(fig)
    buf.seek(0)
    return buf

@router.post("/export-pdf")
async def export_pdf(tasks: list = Body(...)):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    font_path = "C:/Windows/Fonts/arial.ttf"
    if os.path.exists(font_path):
        pdf.add_font("Arial", "", font_path)
        pdf.set_font("Arial", size=18)
    
    # КРАСИВЫЙ ЗАГОЛОВОК
    pdf.set_text_color(44, 62, 80)
    pdf.cell(0, 15, "MathForge: Контрольная работа", ln=True, align='C')
    pdf.set_draw_color(44, 62, 80)
    pdf.line(20, 25, 190, 25) # Линия под заголовком
    pdf.ln(10)

    for i, task in enumerate(tasks):
        # Рамка задачи
        pdf.set_fill_color(249, 250, 251)
        pdf.set_font("Arial", size=12)
        pdf.set_text_color(31, 41, 55)
        
        # Заголовок задачи
        pdf.cell(0, 10, f"Задание №{i + 1}", ln=True, font_style="B")
        pdf.set_font("Arial", size=11)
        pdf.multi_cell(0, 8, txt=task.get('task_text', ''))
        
        # ГЕНЕРАЦИЯ КАРТИНКИ МАТРИЦЫ
        try:
            latex_code = task.get('matrix_latex', '')
            img_buf = latex_to_image(latex_code)
            
            # Вставляем картинку матрицы в PDF
            # x и y считаются автоматически, либо задаем смещение
            curr_y = pdf.get_y()
            pdf.image(img_buf, x=30, y=curr_y + 2, w=40)
            pdf.set_y(curr_y + 35) # Двигаем курсор вниз под картинку
        except Exception as e:
            pdf.cell(0, 10, f"[Ошибка отрисовки матрицы]", ln=True)

        # Ответ (невидимый или серый)
        pdf.set_text_color(180, 180, 180)
        pdf.set_font("Arial", size=9)
        pdf.cell(0, 8, f"Ответ для проверки: {task.get('answer', '')}", ln=True)
        pdf.ln(5)
        pdf.set_text_color(0, 0, 0)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y()) # Разделитель задач
        pdf.ln(5)

    pdf_output = bytes(pdf.output())
    
    return Response(
        content=pdf_output,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=MathForge_Variant.pdf"}
    )