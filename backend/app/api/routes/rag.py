"""
RAG routes — semantic search over task templates.

GET  /api/rag/search?query=...&k=5&difficulty=easy
     Perform similarity search. Returns ranked template matches.

POST /api/rag/index
     Re-index all active TaskTemplate rows into Qdrant.
     Restricted to admin and teacher roles.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role
from app.db.database import get_db
from app.db.models import TaskTemplate
from app.models.schemas import TokenPayload
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────────

class SimilarTaskResult(BaseModel):
    template_id: str
    difficulty: str | None
    category_id: str | None
    score: float
    snippet: str


class SearchResponse(BaseModel):
    query: str
    results: list[SimilarTaskResult]


class IndexResponse(BaseModel):
    indexed: int
    message: str


# ── GET /search ───────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse)
async def search_similar_tasks(
    query: str = Query(..., min_length=2, max_length=500, description="Поисковый запрос"),
    k: int = Query(default=5, ge=1, le=20, description="Количество результатов"),
    difficulty: str | None = Query(default=None, description="Фильтр по сложности: easy | medium | hard"),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Semantic similarity search over indexed task templates.

    Finds the `k` templates whose descriptions are most semantically close
    to the free-text `query`.  Useful for teachers composing worksheets:
    type a topic description and instantly get relevant templates.

    Returns ranked results with a cosine similarity `score` (0–1, higher = closer).
    """
    if difficulty and difficulty not in {"easy", "medium", "hard"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="difficulty должен быть одним из: easy, medium, hard",
        )

    try:
        results = await rag_service.search_similar_tasks(query=query, k=k, difficulty=difficulty)
    except Exception as exc:
        logger.error("RAG search failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис поиска временно недоступен. Попробуйте позже.",
        ) from exc

    return SearchResponse(
        query=query,
        results=[SimilarTaskResult(**r) for r in results],
    )


# ── POST /index ───────────────────────────────────────────────────────────────

@router.post("/index", response_model=IndexResponse)
async def index_templates(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("admin", "teacher")),
):
    """
    Re-index all active TaskTemplate records into Qdrant.

    Should be called:
      - after a batch of new templates is approved by an admin
      - after the database is seeded for the first time

    Restricted to admin and teacher roles.
    """
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.is_active.is_(True))
    )
    templates = result.scalars().all()

    if not templates:
        return IndexResponse(
            indexed=0,
            message="Нет активных шаблонов для индексации.",
        )

    try:
        indexed = await rag_service.index_templates(list(templates))
    except Exception as exc:
        logger.error("RAG indexing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ошибка индексации: {exc}",
        ) from exc

    return IndexResponse(
        indexed=indexed,
        message=f"Успешно проиндексировано {indexed} шаблонов задач.",
    )
