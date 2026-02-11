from fastapi import APIRouter

router = APIRouter()

@router.get("/demo")
async def demo_generation():
    return {"message": "Генерация работает (заглушка)"}