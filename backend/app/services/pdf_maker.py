from jinja2 import Environment, FileSystemLoader
import os

def create_pdf_from_tasks(tasks, topic_name):
    # Настройка шаблонизатора
    env = Environment(loader=FileSystemLoader('app/templates/tex'))
    template = env.get_template('base_template.tex')
    
    # Рендерим текст (вставляем наши задачи в LaTeX код)
    rendered_tex = template.render(tasks=tasks, topic_name=topic_name)
    
    # Сохраняем временный .tex файл
    tex_filename = "output.tex"
    with open(tex_filename, "w", encoding="utf-8") as f:
        f.write(rendered_tex)
    
    # Команда для компиляции (требует установленного pdflatex)
    # os.system(f"pdflatex {tex_filename}")
    
    return "Файл сгенерирован (пока в формате .tex для теста)"