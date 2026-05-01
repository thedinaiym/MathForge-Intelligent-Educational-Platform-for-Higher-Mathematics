"""
Site satisfaction ratings.

POST /api/ratings        — submit a 1–5 star rating (authenticated, once per user)
GET  /api/ratings/stats  — aggregate stats (admin/teacher only)
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role
from app.db.database import get_db
from app.db.models import SiteRating
from app.models.schemas import TokenPayload

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RatingCreate(BaseModel):
    score:    int   = Field(..., ge=1, le=5)
    feedback: str | None = Field(default=None, max_length=500)


class RatingStats(BaseModel):
    total:        int
    average:      float
    distribution: dict[str, int]  # "1"→count … "5"→count


# ── POST /api/ratings ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def submit_rating(
    payload: RatingCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upsert a rating for the authenticated user.
    If the user already rated, updates the existing row.
    Returns {"ok": true}.
    """
    user_id = uuid.UUID(current_user.sub)

    stmt = (
        pg_insert(SiteRating)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            score=payload.score,
            feedback=payload.feedback,
            created_at=datetime.utcnow(),
        )
        .on_conflict_do_update(
            constraint="uq_site_rating_user",
            set_={"score": payload.score, "feedback": payload.feedback, "created_at": datetime.utcnow()},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}


# ── GET /api/ratings/stats ────────────────────────────────────────────────────

@router.get("/stats", response_model=RatingStats)
async def get_rating_stats(
    current_user: TokenPayload = Depends(require_role("admin", "teacher")),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate rating statistics. Admin/teacher only."""
    result = await db.execute(select(SiteRating.score))
    scores = result.scalars().all()

    if not scores:
        return RatingStats(total=0, average=0.0, distribution={"1":0,"2":0,"3":0,"4":0,"5":0})

    total   = len(scores)
    average = round(sum(scores) / total, 2)
    dist    = {str(i): 0 for i in range(1, 6)}
    for s in scores:
        dist[str(s)] += 1

    return RatingStats(total=total, average=average, distribution=dist)
