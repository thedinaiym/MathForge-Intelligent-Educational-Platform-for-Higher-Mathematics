from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")


def _db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set SUPABASE_DB_URL or DATABASE_URL.")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def main() -> None:
    engine = create_async_engine(_db_url(), echo=False)
    async with engine.connect() as conn:
        print("\n== task_templates by active/difficulty ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select is_active, difficulty, count(*) as n
                    from task_templates
                    group by is_active, difficulty
                    order by is_active desc, difficulty
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== active templates by category/difficulty ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select c.name_translations->>'en' as category,
                           t.difficulty,
                           count(*) as n
                    from task_templates t
                    left join categories c on c.id = t.category_id
                    where t.is_active = true
                    group by 1, 2
                    order by 1, 2
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== duplicate active sympy_expr groups ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select template_json->>'sympy_expr' as expr,
                           count(*) as n,
                           array_agg(distinct template_json->>'topic') as topics
                    from task_templates
                    where is_active = true
                    group by expr
                    having count(*) > 1
                    order by count(*) desc
                    limit 30
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== active templates with mojibake markers ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select id,
                           title_translations->>'en' as title_en,
                           template_json->>'topic' as topic
                    from task_templates
                    where is_active = true
                      and (
                        title_translations::text ~ '[ÐÑÒÓâÂ]'
                        or ((template_json->'texts')::text) ~ '[ÐÑÒÓâÂ]'
                      )
                    limit 30
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== generic quadratic formula by category/difficulty ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select c.name_translations->>'en' as category,
                           t.difficulty,
                           count(*) as n
                    from task_templates t
                    left join categories c on c.id = t.category_id
                    where t.is_active = true
                      and t.template_json->>'sympy_expr' in (
                        '{A}*x**2 + {B}*x + {C}',
                        'A*x**2 + B*x + C'
                      )
                    group by 1, 2
                    order by 1, 2
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== generic quadratic formula with non-quadratic topics ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select t.id,
                           c.name_translations->>'en' as category,
                           difficulty,
                           title_translations->>'en' as title_en,
                           template_json->>'topic' as topic,
                           template_json->>'sympy_expr' as expr
                    from task_templates t
                    left join categories c on c.id = t.category_id
                    where t.is_active = true
                      and t.template_json->>'sympy_expr' in (
                        '{A}*x**2 + {B}*x + {C}',
                        'A*x**2 + B*x + C'
                      )
                      and coalesce(t.template_json->>'topic', '') !~* '(quadratic|polynomial|parabola)'
                    order by category, difficulty, title_en
                    limit 40
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

        print("\n== newest active templates ==")
        rows = (
            await conn.execute(
                text(
                    """
                    select id,
                           difficulty,
                           title_translations->>'en' as title_en,
                           template_json->>'topic' as topic,
                           template_json->>'sympy_expr' as expr
                    from task_templates
                    where is_active = true
                    order by id desc
                    limit 20
                    """
                )
            )
        ).all()
        for row in rows:
            print(dict(row._mapping))

    await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"[error] {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
