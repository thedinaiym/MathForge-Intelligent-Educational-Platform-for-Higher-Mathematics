"""
Auth routes — lightweight wrapper around Supabase OAuth.
Supabase handles OAuth (GitHub / Google) on the frontend.
These endpoints handle post-auth user registration in our PostgreSQL schema.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_locale
from app.db.database import get_db
from app.db.models import BillingAccount, User
from app.models.schemas import TokenPayload, UserCreate, UserResponse

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register_user(
    payload: UserCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a User row in our DB after Supabase OAuth completes.
    Also creates a BillingAccount with 20 free tokens.

    Fully idempotent: safe against duplicate calls fired by React StrictMode
    or double OAuth redirects. Uses a fast SELECT-first path for the common
    case (subsequent logins), then catches any INSERT race with an
    IntegrityError fallback so the endpoint never returns 500.
    """
    user_id = uuid.UUID(current_user.sub)

    # ── Fast path: user already exists (most logins after the first) ──────────
    result = await db.execute(select(User).where(User.id == user_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.name = payload.name
        existing.role = payload.role
        existing.locale = payload.locale
        await db.commit()
        await db.refresh(existing)
        return existing

    # ── Slow path: first registration ─────────────────────────────────────────
    new_user = User(
        id=user_id,
        name=payload.name,
        role=payload.role,
        locale=payload.locale,
    )
    db.add(new_user)

    # ON CONFLICT DO NOTHING keeps billing idempotent even if user insert wins
    # the race but billing was already created by a concurrent request.
    billing_stmt = (
        pg_insert(BillingAccount)
        .values(user_id=user_id, token_balance=20.0)
        .on_conflict_do_nothing(index_elements=["user_id"])
    )

    try:
        await db.flush()           # send INSERT for User; raises IntegrityError on dupe
        await db.execute(billing_stmt)
        await db.commit()
        await db.refresh(new_user)
        return new_user

    except IntegrityError:
        # A concurrent request beat us to the INSERT — roll back and return
        # the row that was already committed by the winning request.
        await db.rollback()
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            # Should never happen, but guard anyway.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration conflict could not be resolved.",
            )
        return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated user's name, role, and locale. Creates user if missing."""
    user_id = uuid.UUID(current_user.sub)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    # Если пользователя нет в БД (призрак из Supabase) — создаем его!
    if user is None:
        user = User(
            id=user_id,
            name=payload.name,
            role=payload.role,
            locale=payload.locale,
        )
        billing = BillingAccount(user_id=user_id, token_balance=20.0)
        db.add(user)
        db.add(billing)
    else:
        # Если есть — просто обновляем
        user.name = payload.name
        user.role = payload.role
        user.locale = payload.locale

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated user's profile from our DB."""
    user_id = uuid.UUID(current_user.sub)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
