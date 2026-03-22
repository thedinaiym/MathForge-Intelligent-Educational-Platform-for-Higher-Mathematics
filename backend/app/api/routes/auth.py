"""
Auth routes — lightweight wrapper around Supabase OAuth.
Supabase handles OAuth (GitHub / Google) on the frontend.
These endpoints handle post-auth user registration in our PostgreSQL schema.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
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
    Also creates a BillingAccount with 0 token balance.
    Idempotent — returns existing user if already registered.
    """
    user_id = uuid.UUID(current_user.sub)

    # Upsert: create on first login, update fields on subsequent calls
    result = await db.execute(select(User).where(User.id == user_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.name = payload.name
        existing.role = payload.role
        existing.locale = payload.locale
        await db.commit()
        await db.refresh(existing)
        return existing

    user = User(
        id=user_id,
        name=payload.name,
        role=payload.role,
        locale=payload.locale,
    )
    # Every new user gets 20 free tokens to start
    billing = BillingAccount(user_id=user_id, token_balance=20.0)

    db.add(user)
    db.add(billing)
    await db.commit()
    await db.refresh(user)
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
