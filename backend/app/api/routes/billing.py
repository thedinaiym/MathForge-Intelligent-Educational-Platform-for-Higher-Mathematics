"""
Billing routes.
GET  /api/billing/balance    — return current token balance
GET  /api/billing/packages   — list available token packages
POST /api/billing/purchase   — buy a token package (demo: no payment gateway)
POST /api/billing/topup      — add tokens directly (admin only)

Token pricing:
  pkg_100 — 100 tokens for 250 сом
  pkg_200 — 200 tokens for 400 сом

Usage costs:
  OCR analyze  — 0.5 tokens
  PDF generate — 5 tokens
"""
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role
from app.db.database import get_db
from app.db.models import BillingAccount
from app.models.schemas import (
    BillingBalanceResponse,
    BillingPackage,
    PurchaseRequest,
    PurchaseResponse,
    TokenPayload,
)

router = APIRouter()

# ── Package catalogue ─────────────────────────────────────────────────────────

PACKAGES: dict[str, BillingPackage] = {
    "pkg_100": BillingPackage(
        id="pkg_100",
        tokens=100,
        price_soms=250,
        label="100 токенов — 250 сом",
    ),
    "pkg_200": BillingPackage(
        id="pkg_200",
        tokens=200,
        price_soms=400,
        label="200 токенов — 400 сом",
    ),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_account(user_id: uuid.UUID, db: AsyncSession) -> BillingAccount:
    result = await db.execute(
        select(BillingAccount).where(BillingAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Billing account not found. Please complete registration.",
        )
    return account


# ── Endpoints ─────────────────────────────────────────────────────────────────

DAILY_BONUS_TOKENS = 10
DAILY_BONUS_THRESHOLD = 20  # only top-up if balance is below this


@router.get("/balance", response_model=BillingBalanceResponse)
async def get_balance(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the authenticated user's current token balance.
    Also applies a daily bonus of +10 tokens when balance < 20 and
    the bonus has not yet been awarded today.
    """
    user_id = uuid.UUID(current_user.sub)
    account = await _get_account(user_id, db)

    today = date.today()
    if (
        account.token_balance < DAILY_BONUS_THRESHOLD
        and (account.last_daily_bonus is None or account.last_daily_bonus < today)
    ):
        account.token_balance += DAILY_BONUS_TOKENS
        account.last_daily_bonus = today
        await db.commit()
        await db.refresh(account)

    return account


@router.get("/packages", response_model=list[BillingPackage])
async def list_packages():
    """Return all available token purchase packages."""
    return list(PACKAGES.values())


@router.post("/purchase", response_model=PurchaseResponse)
async def purchase_tokens(
    payload: PurchaseRequest,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Purchase a token package.

    Demo implementation — tokens are credited immediately without a payment
    gateway.  In production, verify payment (Stripe webhook etc.) before
    crediting tokens.
    """
    pkg = PACKAGES.get(payload.package_id)
    if pkg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown package '{payload.package_id}'.",
        )

    user_id = uuid.UUID(current_user.sub)
    account = await _get_account(user_id, db)

    account.token_balance += pkg.tokens
    await db.commit()
    await db.refresh(account)

    return PurchaseResponse(
        token_balance=account.token_balance,
        tokens_added=pkg.tokens,
        message=f"+{pkg.tokens} токенов зачислено. Баланс: {account.token_balance:.1f}",
    )


class TopUpRequest(BaseModel):
    amount: float = Field(ge=1, le=10000, description="Tokens to add")


@router.post("/topup", response_model=BillingBalanceResponse)
async def top_up(
    payload: TopUpRequest,
    current_user: TokenPayload = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Add arbitrary tokens — admin only."""
    user_id = uuid.UUID(current_user.sub)
    account = await _get_account(user_id, db)
    account.token_balance += payload.amount
    await db.commit()
    await db.refresh(account)
    return account
