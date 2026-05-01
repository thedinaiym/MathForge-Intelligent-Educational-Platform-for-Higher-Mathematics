"""
validate_templates.py

Scans every active task_template in the DB, tries to generate from it,
and marks broken ones as is_active=False.

Run once after seeding from LLM-extracted books:
    python validate_templates.py

Requires the same .env as the main backend.
"""
from __future__ import annotations

import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# ── Minimal SymPy generation test (mirrors generator.py logic) ─────────────

import random
import sympy as sp

_SAFE_LOCALS = {name: sp.Symbol(name) for name in ['N', 'I', 'E', 'O', 'S', 'C', 'Q']}

def _try_generate(template_json: dict) -> str | None:
    """Returns None if template is valid, or an error string if broken."""
    try:
        sympy_expr_str = template_json.get("sympy_expr", "0")
        ranges         = template_json.get("ranges", {})
        constraints    = template_json.get("constraints", [])

        # 1. Parse expression
        raw_expr = sp.sympify(sympy_expr_str, locals=_SAFE_LOCALS)

        # 2. Sample coefficients
        _safe = {"__builtins__": {}, "abs": abs}
        compiled = [compile(c, "<constraint>", "eval") for c in constraints]

        subs = None
        for _ in range(50):
            candidate = {var: random.randint(r[0], r[1]) for var, r in ranges.items()}
            if all(eval(code, _safe, candidate) for code in compiled):
                subs = candidate
                break

        if subs is None:
            return "constraints unsatisfiable"

        # 3. Substitute and compute LaTeX
        final_expr = raw_expr.subs(subs)
        sp.latex(sp.simplify(final_expr))

        return None  # OK

    except Exception as exc:
        return str(exc)


# ── DB connection ──────────────────────────────────────────────────────────

async def main() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select, update

    db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        print("[error] Set SUPABASE_DB_URL in .env")
        sys.exit(1)

    # sqlalchemy needs postgresql+asyncpg:// scheme
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and "+asyncpg" not in db_url:
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Import ORM model (needs app on path)
    sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
    from app.db.models import TaskTemplate

    async with Session() as db:
        result = await db.execute(
            select(TaskTemplate).where(TaskTemplate.is_active.is_(True))
        )
        templates = result.scalars().all()

    print(f"Found {len(templates)} active templates — validating ...")

    ok_count      = 0
    broken_ids:   list = []
    broken_errors: dict = {}

    for tmpl in templates:
        err = _try_generate(tmpl.template_json)
        if err is None:
            ok_count += 1
        else:
            broken_ids.append(tmpl.id)
            broken_errors[str(tmpl.id)] = err

    print(f"\n✅ Valid:   {ok_count}")
    print(f"❌ Broken:  {len(broken_ids)}")

    if not broken_ids:
        print("Nothing to disable.")
        await engine.dispose()
        return

    print("\nBroken templates (first 10):")
    for tid in broken_ids[:10]:
        print(f"  {tid}: {broken_errors[str(tid)][:80]}")
    if len(broken_ids) > 10:
        print(f"  ... and {len(broken_ids) - 10} more")

    answer = input(f"\nDisable all {len(broken_ids)} broken templates? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        await engine.dispose()
        return

    async with Session() as db:
        await db.execute(
            update(TaskTemplate)
            .where(TaskTemplate.id.in_(broken_ids))
            .values(is_active=False)
        )
        await db.commit()

    print(f"✅ Marked {len(broken_ids)} templates as is_active=False.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
