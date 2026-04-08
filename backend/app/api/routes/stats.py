"""
Study statistics route.

GET  /api/study/stats  — heatmap + mastery data for the authenticated user
POST /api/study/ping   — record a visit (counts toward heatmap, no token cost)
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale
from app.db.database import get_db
from app.db.models import ActivityLog, Category, StudentTracking
from app.models.schemas import HeatmapEntry, MasteryEntry, StatsResponse, TokenPayload

router = APIRouter()


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    locale: str = Depends(get_locale),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatsResponse:
    """
    Return heatmap + mastery stats for the authenticated user.

    - heatmap_data  — activity_logs rows for the past 365 days
    - mastery_data  — student_tracking joined with categories, sorted
                      by mastery_percentage ascending (weakest first)
    - total_analyses — sum of all activity counts (used for the hero stat)
    """
    user_id = uuid.UUID(current_user.sub)
    today = date.today()
    year_ago = today - timedelta(days=364)

    # ── Heatmap: activity_logs last 365 days ─────────────────────────────────
    log_result = await db.execute(
        select(ActivityLog).where(
            ActivityLog.user_id == user_id,
            ActivityLog.activity_date >= year_ago,
        )
    )
    logs = log_result.scalars().all()

    heatmap_data = [
        HeatmapEntry(date=str(log.activity_date), count=log.count)
        for log in logs
    ]
    total_analyses = sum(log.count for log in logs)

    # ── Mastery: student_tracking + categories ───────────────────────────────
    tracking_result = await db.execute(
        select(StudentTracking, Category)
        .join(Category, StudentTracking.category_id == Category.id)
        .where(StudentTracking.user_id == user_id)
        .order_by(StudentTracking.mastery_level.asc())
    )
    rows = tracking_result.all()

    mastery_data = [
        MasteryEntry(
            category_id=tracking.category_id,
            category_name=category.get_name(locale),
            mastery_percentage=round(min(tracking.mastery_level, 100.0), 1),
        )
        for tracking, category in rows
    ]

    return StatsResponse(
        heatmap_data=heatmap_data,
        mastery_data=mastery_data,
        total_analyses=total_analyses,
    )


@router.post("/ping", status_code=204)
async def ping_activity(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Record a page visit in the activity heatmap.
    Called by the Dashboard on every mount — no token cost.
    Uses ON CONFLICT DO UPDATE so repeated pings the same day only increment once.
    """
    user_id = uuid.UUID(current_user.sub)
    today = date.today()
    try:
        stmt = (
            pg_insert(ActivityLog)
            .values(id=uuid.uuid4(), user_id=user_id, activity_date=today, count=1)
            .on_conflict_do_update(
                constraint="uq_activity_user_date",
                set_={"count": ActivityLog.__table__.c.count + 1},
            )
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        pass  # never break the dashboard over a ping failure
