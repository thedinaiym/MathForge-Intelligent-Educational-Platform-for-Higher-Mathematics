import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.api.routes import auth, tasks, ocr, billing, stats, teacher, ort, rag, avatar, classes, lessons, tutor
from app.db.database import Base, engine, AsyncSessionLocal
from app.db.seed import seed_database
from app.api import router_admin

logger = logging.getLogger(__name__)


# ── Schema migration ──────────────────────────────────────────────────────────

async def _migrate_stale_schema() -> None:
    """
    Drop tables whose schema no longer matches the current ORM models.

    The early admin-router phase created `task_templates` with a legacy schema
    (columns: topic_id, expression, lean_proof …).  SQLAlchemy's create_all
    skips existing tables, so those stale columns block every INSERT.

    Detection: look for `topic_id` — a column that only exists in the old schema.
    If found, drop `task_templates` (and `categories` which may also be absent
    or malformed) so create_all can rebuild them correctly.

    This runs BEFORE create_all on every startup; it is a no-op once the tables
    have the correct schema.
    """
    async with engine.begin() as conn:
        # Check for the old-schema sentinel column
        result = await conn.execute(text("""
            SELECT 1
            FROM   information_schema.columns
            WHERE  table_name  = 'task_templates'
            AND    column_name = 'topic_id'
            LIMIT  1
        """))
        if result.fetchone() is None:
            return  # schema is already correct — nothing to do

        print("🔄 Stale task_templates schema detected — dropping legacy tables...")
        # CASCADE drops any foreign-key dependents automatically
        await conn.execute(text("DROP TABLE IF EXISTS task_templates CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS categories     CASCADE"))
        print("✅ Legacy tables dropped — create_all will rebuild them.")

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
    """
    0. Migrate stale schema (drops legacy task_templates if present).
    1. Create tables — idempotent CREATE TABLE IF NOT EXISTS.
    2. Upsert seed data — always runs, safe to repeat.
    3. Index templates into Qdrant for RAG search.
    """
    # ── Step 0: schema migration ──────────────────────────────────────────
    try:
        await _migrate_stale_schema()
    except Exception as exc:
        # Non-fatal: log and continue. create_all + seed must still run.
        print(f"⚠️  Schema migration warning (non-fatal): {exc}")

    # ── Step 1: tables ────────────────────────────────────────────────────
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Additive column migrations — safe to run every restart
            await conn.execute(text(
                "ALTER TABLE billing_accounts "
                "ADD COLUMN IF NOT EXISTS last_daily_bonus DATE"
            ))
            await conn.execute(text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id) ON DELETE SET NULL"
            ))
            # Phase 22: video_lessons is created by create_all above (new table).
            # No additive column migrations needed for new tables.
        print("✅ DB tables verified/created.")
    except Exception as exc:
        print(f"⚠️  DB connection failed: {exc}")
        print("   Fix SUPABASE_DB_URL in backend/.env and restart.")
        return  # can't continue without DB

    # ── Step 2: seed (always — upsert is safe) ────────────────────────────
    try:
        async with AsyncSessionLocal() as db:
            await seed_database(db)
    except Exception as exc:
        print(f"⚠️  Seeding failed (non-fatal): {exc}")

    # Auto-index templates into Qdrant after seeding (non-fatal)
    try:
        from sqlalchemy import select
        from app.db.models import TaskTemplate
        from app.services.rag_service import rag_service
        if rag_service is not None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(TaskTemplate).where(TaskTemplate.is_active.is_(True)))
                templates = result.scalars().all()
                if templates:
                    indexed = await rag_service.index_templates(list(templates))
                    print(f"✅ RAG: indexed {indexed} templates into Qdrant.")
        else:
            print("⚠️  RAG skipped — service unavailable (fastembed/Qdrant not ready).")
    except Exception as exc:
        print(f"⚠️  RAG indexing failed (non-fatal): {exc}")


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(ocr.router, prefix="/api/study", tags=["study"])
app.include_router(stats.router, prefix="/api/study", tags=["study"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(router_admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(teacher.router, prefix="/api/teachers", tags=["teachers"])
app.include_router(ort.router, prefix="/api/ort", tags=["ort"])
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(avatar.router, prefix="/api/avatar", tags=["avatar"])
app.include_router(classes.router, prefix="/api/classes", tags=["classes"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["lessons"])
app.include_router(tutor.router,   prefix="/api/tutor",   tags=["tutor"])


@app.get("/")
async def root():
    return {"status": "MathForge API running", "version": "1.0.0"}


if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
