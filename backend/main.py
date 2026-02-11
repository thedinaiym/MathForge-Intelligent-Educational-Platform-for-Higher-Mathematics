from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # 1. Импортируем прослойку
from app.api import tasks

app = FastAPI()

# 2. Настраиваем список разрешенных адресов
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# 3. Добавляем middleware в приложение
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Разрешаем запросы с нашего фронтенда
    allow_credentials=True,
    allow_methods=["*"], # Разрешаем любые методы (GET, POST и т.д.)
    allow_headers=["*"], # Разрешаем любые заголовки
)

app.include_router(tasks.router, prefix="/api/tasks")

@app.get("/")
def read_root():
    return {"status": "MathForge API is running"}