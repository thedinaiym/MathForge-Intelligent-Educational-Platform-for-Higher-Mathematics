import os
import json
import traceback # Добавили для отслеживания ошибок
import PyPDF2    # Добавили для чтения PDF
from fastapi import APIRouter, HTTPException, File, UploadFile
from pydantic import BaseModel
from groq import Groq
from supabase import create_client, Client
from dotenv import load_dotenv

# Импортируем наши движки (SymPy и Lean 4)
try:
    from app.core.engine import UniversalMathEngine
    from app.core.lean_validator import LeanValidator
except ImportError:
    UniversalMathEngine = None
    LeanValidator = None

load_dotenv()
router = APIRouter()

# Инициализация клиентов
supabase: Client = create_client(os.getenv("SUPABASE_REST_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Убрали ParseBookRequest, так как теперь мы принимаем файл напрямую

class TestTemplateRequest(BaseModel):
    template: dict

@router.post("/parse-book")
async def parse_book_to_json(file: UploadFile = File(...)):
    """Принимает PDF файл, извлекает текст и скармливает ИИ для извлечения алгоритма и Lean-кода"""
    
    # 1. Читаем текст из загруженного PDF
    try:
        pdf_reader = PyPDF2.PdfReader(file.file)
        extracted_text = ""
        
        # Читаем первые 3 страницы (чтобы не превысить лимит токенов ИИ)
        for i in range(min(3, len(pdf_reader.pages))):
            page_text = pdf_reader.pages[i].extract_text()
            if page_text:
                extracted_text += page_text + "\n"
                
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Не удалось найти читаемый текст в PDF.")
            
    except Exception as e:
        print(f"Ошибка чтения PDF: {e}")
        raise HTTPException(status_code=400, detail="Ошибка при обработке PDF файла.")

    # 2. Формируем запрос к ИИ
    # 2. Формируем запрос к ИИ
    system_prompt = """
    Ты - строгий математический парсер для Neuro-Symbolic платформы.
    Твоя задача: прочитать текст из учебника, найти в нем логику и превратить в ОДИН универсальный JSON-шаблон.
    
    КРИТИЧЕСКИ ВАЖНО: 
    - НЕ создавай отдельный шаблон для каждого примера из текста! 
    - Найди общий математический паттерн и верни ровно ОДИН JSON-объект (начинается с { и заканчивается на }).
    - НЕ возвращай массив (список) объектов [].
    
    ПРАВИЛА ГЕНЕРАЦИИ JSON:
    1. title - Название темы
    2. topic_id - Уникальный ID на английском (например: 'linear_eq_01')
    3. task_type - Тип задачи (equation, matrix, integral)
    4. variables - Массив переменных (например: ["A", "B", "C"])
    5. ranges - Диапазоны для генерации (например: {"A": [1, 10], "B": [-5, 5]})
    6. expression - Формула для SymPy (например: "Eq(A*x + B, C)")
    7. solve_for - Переменная для поиска (например: "x")
    8. lean_proof - Строка с теоремой на языке Lean 4.
    
    ОТВЕТ ВЫДАВАЙ СТРОГО В ФОРМАТЕ JSON. Никакого текста до или после.
    """

    try:
        # Отправляем извлеченный текст в Groq
        # Отправляем извлеченный текст в Groq
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Сделай шаблон из этого текста:\n\n{extracted_text[:4000]}"}
            ],
            # 🔥 ИЗМЕНЕНИЕ ЗДЕСЬ: используем новую поддерживаемую модель
            model="llama-3.3-70b-versatile", 
            temperature=0.1
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        # Очистка от маркдауна, если ИИ все же его добавил
        if ai_response.startswith("```json"):
            ai_response = ai_response[7:-3].strip()
        elif ai_response.startswith("```"):
            ai_response = ai_response[3:-3].strip()
            
        json_template = json.loads(ai_response)
        
        # ДОБАВЬ ВОТ ЭТИ 3 СТРОЧКИ: Защита на случай, если ИИ все-таки вернул массив
        if isinstance(json_template, list):
            json_template = json_template[0] # Берем только первый шаблон
            
        json_template["status"] = "draft"
        # Сохраняем в Карантин
        supabase.table("task_templates").insert(json_template).execute()
        
        return {
            "status": "success", 
            "message": "Алгоритм создан и помещен в Карантин!",
            "template": json_template # Отправляем обратно, чтобы показать на фронтенде
        }
        
    except json.JSONDecodeError:
        print(f"Ошибка парсинга JSON. Ответ ИИ: {ai_response}")
        raise HTTPException(status_code=500, detail="ИИ вернул некорректный JSON.")
    except Exception as e:
        print("🔥 ОШИБКА ИИ ИЛИ БД:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}")


@router.post("/test-template")
async def test_template(payload: TestTemplateRequest):
    """Тестирует JSON-шаблон одновременно через SymPy и Lean 4"""
    template = payload.template
    
    sympy_result = {"status": "error", "message": "SymPy недоступен"}
    lean_result = {"status": "skipped", "message": "Lean 4 не подключен"}

    # 1. ТЕСТ SYMPY (Генерация конкретных чисел)
    if UniversalMathEngine:
        try:
            task = UniversalMathEngine.generate_task(template)
            sympy_result = {
                "status": "success",
                "latex": task["condition_latex"],
                "answer": task["answer"]
            }
        except Exception as e:
            sympy_result = {"status": "error", "error_message": str(e)}

    # 2. ТЕСТ LEAN 4 (Формальная верификация структуры)
    lean_code = template.get("lean_proof", "")
    if LeanValidator and lean_code:
        lean_result = LeanValidator.verify(lean_code)

    return {
        "sympy": sympy_result,
        "lean": lean_result
    }

@router.post("/approve/{topic_id}")
async def approve_template(topic_id: str):
    """Перевод шаблона из карантина в продакшен"""
    try:
        supabase.table("task_templates").update({"status": "approved"}).eq("topic_id", topic_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))