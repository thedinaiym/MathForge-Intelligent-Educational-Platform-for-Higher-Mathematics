import os
import random
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# Подгружаем наши движки (Убедись, что эти файлы существуют!)
# Если их пока нет, закомментируй эти строки, и роутер будет использовать заглушки
try:
    from app.core.engine import UniversalMathEngine
    from app.services.ai_client import get_hint_from_groq
except ImportError:
    UniversalMathEngine = None
    get_hint_from_groq = None

load_dotenv()

router = APIRouter()

# Инициализация Supabase
supabase_url = os.getenv("SUPABASE_REST_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if supabase_url and supabase_key:
    supabase: Client = create_client(supabase_url, supabase_key)
else:
    supabase = None
    print("⚠️ ВНИМАНИЕ: Ключи Supabase не найдены в .env! Работаем в демо-режиме.")

# --- PYDANTIC МОДЕЛИ ДЛЯ ФРОНТЕНДА ---

class StartTestRequest(BaseModel):
    topics: List[str]
    difficulty: str
    num_questions: int

class CheckAnswerRequest(BaseModel):
    topic_id: str
    difficulty: str
    student_answer: str
    correct_answer: str
    json_steps: Dict[str, Any]
    task_condition: str
    language: str = "ru"

# --- ЭНДПОИНТЫ ---

@router.get("/menu")
async def get_menu():
    """
    Отдает список тем для фронтенда. 
    Если БД недоступна, отдает демо-темы, чтобы сайт не сломался.
    """
    if supabase:
        try:
            response = supabase.table("task_templates").select("topic_id, title").eq("status", "approved").execute()
            if response.data and len(response.data) > 0:
                topics = [{"id": task["topic_id"], "name": task["title"]} for task in response.data]
                return {"Алгоритмы из Базы": topics}
        except Exception as e:
            print(f"⚠️ Ошибка БД (Меню): {e}")

    # РЕЗЕРВНЫЙ ПЛАН (Демо-темы)
    return {
        "Алгебра (Демо)": [
            {"id": "linear_eq_01", "name": "Линейные уравнения"},
            {"id": "quad_eq_01", "name": "Квадратные уравнения"}
        ],
        "Матрицы (Демо)": [
            {"id": "matrix_01", "name": "Определитель матрицы"}
        ]
    }


@router.post("/start-test")
async def start_test(payload: StartTestRequest):
    """
    Генерирует массив задач для тренажера на основе выбранных тем.
    """
    tasks = []
    
    for _ in range(payload.num_questions):
        # Случайно выбираем одну тему из тех, что отметил студент
        selected_topic = random.choice(payload.topics)
        
        template = None
        if supabase:
            try:
                # Пытаемся достать алгоритм из базы
                response = supabase.table("task_templates").select("*").eq("topic_id", selected_topic).eq("status", "approved").execute()
                if response.data:
                    template = response.data[0]
            except Exception as e:
                print(f"⚠️ Ошибка загрузки шаблона: {e}")

        # Генерируем задачу
        if template and UniversalMathEngine:
            task_data = UniversalMathEngine.generate_task(template)
            task_data["topic_id"] = selected_topic
            tasks.append(task_data)
        else:
            # ДЕМО-ЗАДАЧА (Если движок или база еще не готовы)
            A, B, C = random.randint(2, 10), random.randint(1, 20), random.randint(30, 50)
            ans = round((C - B) / A, 2)
            tasks.append({
                "topic_id": selected_topic,
                "title": "Линейное уравнение (Демо)",
                "condition_latex": f"{A}x + {B} = {C}",
                "answer": str(ans),
                "json_steps": {"A": A, "B": B, "C": C, "ans": ans}
            })

    return {"tasks": tasks}


@router.post("/check-answer")
async def check_answer(payload: CheckAnswerRequest):
    """
    Проверяет ответ студента. Если неверно — вызывает ИИ Groq для подсказки.
    """
    student_ans = payload.student_answer.strip().lower()
    correct_ans = payload.correct_answer.strip().lower()

    # Простейшая проверка (в идеале использовать SymPy для сравнения математических выражений)
    is_correct = (student_ans == correct_ans)

    if is_correct:
        return {
            "status": "correct",
            "message": "Отлично! Ты решил задачу абсолютно верно."
        }
    else:
        ai_hint = ""
        # Обращаемся к Groq за умной подсказкой, если он подключен
        if get_hint_from_groq:
            try:
                # Формируем текст для ИИ: "Студент написал {student_ans}, а правильные шаги вот такие: {json_steps}"
                ocr_simulation = f"Ответ студента: {student_ans}" 
                ai_hint = get_hint_from_groq(ocr_simulation, payload.json_steps, payload.language)
            except Exception as e:
                ai_hint = f"ИИ временно недоступен. Твой ответ ({student_ans}) не совпадает с правильным."
        else:
            ai_hint = "Кажется, ты где-то ошибся в вычислениях. Проверь знаки и попробуй снова!"

        return {
            "status": "wrong",
            "message": ai_hint,
            # Штрафная задача (можно генерировать новую, пока просто отдаем null)
            "new_task": None 
        }