from collections.abc import AsyncGenerator
from urllib.parse import urlparse, unquote

from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ── Parse the DB URL so asyncpg receives the full username (incl. dot) ────────
# asyncpg strips everything after '.' in the username when given a URL string.
# Using URL.create() bypasses that by passing credentials as explicit kwargs.

_raw = settings.supabase_db_url
_parsed = urlparse(_raw)

_username = unquote(_parsed.username or "postgres")
_password = unquote(_parsed.password or "")
_host     = _parsed.hostname or "localhost"
_port     = _parsed.port or 5432
_database = _parsed.path.lstrip("/") or "postgres"
_is_pooler = "pooler.supabase.com" in _raw

_url = URL.create(
    drivername="postgresql+asyncpg",
    username=_username,
    password=_password,
    host=_host,
    port=_port,
    database=_database,
)

engine = create_async_engine(
    _url,
    echo=False,
    pool_pre_ping=True,
    # Pooler (pgbouncer) requires prepared statements to be disabled
    connect_args={"statement_cache_size": 0} if _is_pooler else {},
    **({} if _is_pooler else {"pool_size": 5, "max_overflow": 10}),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
