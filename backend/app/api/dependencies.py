"""
FastAPI dependencies shared across routes.
- get_locale: extracts and validates locale from Accept-Language header.
- get_current_user: validates Supabase JWT and returns user payload.
- require_role: role-based access guard factory.
"""
import logging

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from app.core.config import settings
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
) -> TokenPayload:
    """
    Validate the Bearer token issued by Supabase and return a TokenPayload.
    Raises 401 if the token is missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_resp = _supabase.auth.get_user(credentials.credentials)
        supabase_user = user_resp.user

        if supabase_user is None:
            raise ValueError("No user returned from Supabase")

        role = (supabase_user.user_metadata or {}).get("role", "student")
        return TokenPayload(sub=str(supabase_user.id), role=role)

    except Exception as exc:
        logger.error("get_current_user failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


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
