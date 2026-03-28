from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, tasks, ocr, billing, stats, teacher, ort
from app.db.database import Base, engine
from app.api import router_admin

app = FastAPI(
    title="MathForge API",
    version="1.0.0",
    description="Neuro-Symbolic Educational Math Platform for Linear Algebra and Calculus",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Production — bare domain and www must be listed separately
        "https://mathforgeapp.com",
        "https://www.mathforgeapp.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    """Create all tables on first run (idempotent — skips existing tables)."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database tables verified/created.")
    except Exception as exc:
        print(f"⚠️  DB connection failed on startup: {exc}")
        print("   API will start — fix SUPABASE_DB_URL in backend/.env then restart.")


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(ocr.router, prefix="/api/study", tags=["study"])
app.include_router(stats.router, prefix="/api/study", tags=["study"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(router_admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(teacher.router, prefix="/api/teachers", tags=["teachers"])
app.include_router(ort.router, prefix="/api/ort", tags=["ort"])


@app.get("/")
async def root():
    return {"status": "MathForge API running", "version": "1.0.0"}


if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
