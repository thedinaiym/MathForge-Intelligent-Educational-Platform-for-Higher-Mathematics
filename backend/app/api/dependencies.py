"""
FastAPI dependencies shared across routes.
- get_locale: extracts and validates locale from Accept-Language header.
- get_current_user: validates Supabase JWT and returns user payload.
- require_role: role-based access guard factory.
"""
import logging
import uuid

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import create_client

from app.core.config import settings
from app.db.database import get_db
from app.db.models import User as UserModel
from app.models.schemas import TokenPayload

logger = logging.getLogger(__name__)

_security = HTTPBearer(auto_error=False)

# Create once at module level — avoids per-request client construction overhead
_supabase = create_client(settings.supabase_rest_url, settings.supabase_service_role_key)

VALID_LOCALES = {"en", "ru", "kg"}


def get_locale(accept_language: str = Header(default="ru")) -> str:
    """
    Parse Accept-Language header and return a valid locale ('en', 'ru', 'kg').
    Falls back to 'ru' if the header value is unrecognised.
    """
    primary = accept_language.split(",")[0].split(";")[0].split("-")[0].strip().lower()
    return primary if primary in VALID_LOCALES else "ru"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    db: AsyncSession = Depends(get_db),
) -> TokenPayload:
    """
    Validate the Bearer token issued by Supabase and return a TokenPayload.
    Role is resolved from our PostgreSQL users table (not Supabase user_metadata).
    Raises 401 if the token is missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Step 1: validate token with Supabase
    try:
        user_resp = _supabase.auth.get_user(credentials.credentials)
        supabase_user = user_resp.user

        if supabase_user is None:
            raise ValueError("No user returned from Supabase")

    except Exception as exc:
        logger.error("get_current_user failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Step 2: resolve role from our DB (the source of truth for roles)
    user_id = uuid.UUID(str(supabase_user.id))
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    db_user = result.scalar_one_or_none()
    role = db_user.role if db_user else (supabase_user.user_metadata or {}).get("role", "student")

    return TokenPayload(sub=str(supabase_user.id), role=role)


def require_role(*allowed_roles: str):
    """
    Dependency factory that enforces role-based access.

    Usage:
        @router.post("/admin-only")
        async def endpoint(user: TokenPayload = Depends(require_role("admin"))):
            ...
    """
    async def _guard(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {list(allowed_roles)}",
            )
        return user

    return _guard
