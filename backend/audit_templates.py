"""
Audit MathForge task templates.

Default mode is deterministic and offline:
    venv\\Scripts\\python.exe backend\\audit_templates.py

Optional Groq semantic audit:
    set GROQ_API_KEY=...
    set GROQ_AUDIT_MODEL=llama-3.3-70b-versatile
    venv\\Scripts\\python.exe backend\\audit_templates.py --groq --limit 50

The script writes JSON report only. It does not modify the database.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

from app.core.engine.generator import TaskGenerator  # noqa: E402
from app.db.models import Category, TaskTemplate  # noqa: E402


DEFAULT_REPORT_PATH = ROOT / "template_audit_report.json"
MOJIBAKE_MARKERS = ("Ð", "Ñ", "Ò", "Ó", "â", "Â")


def _db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set SUPABASE_DB_URL or DATABASE_URL.")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _has_mojibake(value: object) -> bool:
    if isinstance(value, str):
        return any(marker in value for marker in MOJIBAKE_MARKERS)
    if isinstance(value, dict):
        return any(_has_mojibake(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_mojibake(v) for v in value)
    return False


def _structural_audit(tmpl: TaskTemplate, category: Category | None) -> dict[str, Any]:
    template_json = tmpl.template_json or {}
    issues: list[str] = []

    for key in ("topic", "sympy_expr", "ranges", "texts"):
        if key not in template_json:
            issues.append(f"missing template_json.{key}")

    ranges = template_json.get("ranges", {})
    if not isinstance(ranges, dict) or not ranges:
        issues.append("ranges must be a non-empty object")
    else:
        for name, bounds in ranges.items():
            if (
                not isinstance(bounds, list)
                or len(bounds) != 2
                or not all(isinstance(v, int) for v in bounds)
                or bounds[0] >= bounds[1]
            ):
                issues.append(f"invalid range for {name}: {bounds!r}")

    texts = template_json.get("texts", {})
    if not isinstance(texts, dict):
        issues.append("texts must be an object")
    else:
        for locale in ("en", "ru", "kg"):
            if not str(texts.get(locale, "")).strip():
                issues.append(f"missing text for {locale}")

    if _has_mojibake(tmpl.title_translations) or _has_mojibake(texts):
        issues.append("possible mojibake in title/text translations")

    sample: dict[str, Any] | None = None
    try:
        generated = TaskGenerator.generate(template_json, locale="en")
        sample = {
            "question_text": generated.get("question_text"),
            "condition_latex": generated.get("condition_latex"),
            "answer_latex": generated.get("answer_latex"),
            "topic": generated.get("topic"),
            "coefficients": generated.get("coefficients"),
        }
    except Exception as exc:
        issues.append(f"generation failed: {type(exc).__name__}: {exc}")

    return {
        "id": str(tmpl.id),
        "category_id": str(tmpl.category_id),
        "category": category.get_name("en") if category else None,
        "difficulty": tmpl.difficulty,
        "title": tmpl.title_translations,
        "topic": template_json.get("topic"),
        "sympy_expr": template_json.get("sympy_expr"),
        "is_active": tmpl.is_active,
        "issues": issues,
        "sample": sample,
    }


async def _groq_audit(items: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    try:
        from groq import AsyncGroq
    except ImportError as exc:
        raise RuntimeError("Install groq SDK: pip install groq") from exc

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set GROQ_API_KEY before running --groq.")

    client = AsyncGroq(api_key=api_key)
    audited: list[dict[str, Any]] = []
    system = (
        "You audit MathForge math task templates. Return JSON only. "
        "Check whether title/text/topic match sympy_expr and generated sample. "
        "Do not solve from scratch unless needed to detect inconsistency. "
        "Schema: {\"verdict\":\"ok|fix|reject\", \"issues\":[string], "
        "\"suggested_topic\":string|null, \"suggested_sympy_expr\":string|null, "
        "\"notes\":string}."
    )

    for item in items:
        payload = {
            "id": item["id"],
            "title": item["title"],
            "topic": item["topic"],
            "sympy_expr": item["sympy_expr"],
            "difficulty": item["difficulty"],
            "sample": item["sample"],
            "deterministic_issues": item["issues"],
        }
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            item["groq_audit"] = json.loads(content)
        except Exception as exc:
            item["groq_audit"] = {
                "verdict": "reject",
                "issues": [f"groq audit failed: {type(exc).__name__}: {exc}"],
                "suggested_topic": None,
                "suggested_sympy_expr": None,
                "notes": "",
            }
        audited.append(item)

    return audited


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--groq", action="store_true", help="Run optional Groq semantic audit.")
    parser.add_argument("--limit", type=int, default=0, help="Limit templates audited by Groq.")
    parser.add_argument("--all", action="store_true", help="Include inactive templates.")
    parser.add_argument("--out", default=str(DEFAULT_REPORT_PATH), help="Report JSON path.")
    parser.add_argument(
        "--model",
        default=os.environ.get("GROQ_AUDIT_MODEL", "llama-3.3-70b-versatile"),
        help="Groq model for semantic audit.",
    )
    args = parser.parse_args()

    engine = create_async_engine(_db_url(), echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        stmt = select(TaskTemplate, Category).join(Category, TaskTemplate.category_id == Category.id)
        if not args.all:
            stmt = stmt.where(TaskTemplate.is_active.is_(True))
        rows = (await db.execute(stmt)).all()

    records = [_structural_audit(tmpl, category) for tmpl, category in rows]

    expr_to_topics: dict[str, set[str]] = defaultdict(set)
    for item in records:
        expr = str(item.get("sympy_expr") or "")
        topic = str(item.get("topic") or "")
        if expr and topic:
            expr_to_topics[expr].add(topic)

    duplicate_exprs = {
        expr: sorted(topics)
        for expr, topics in expr_to_topics.items()
        if len(topics) > 1
    }
    for item in records:
        expr = str(item.get("sympy_expr") or "")
        if expr in duplicate_exprs:
            item["issues"].append(
                "same sympy_expr is used by multiple topics: "
                + ", ".join(duplicate_exprs[expr])
            )

    groq_records = records
    if args.groq:
        target = records[: args.limit] if args.limit > 0 else records
        audited_target = await _groq_audit(target, args.model)
        audited_by_id = {item["id"]: item for item in audited_target}
        groq_records = [audited_by_id.get(item["id"], item) for item in records]

    report = {
        "summary": {
            "templates": len(records),
            "with_issues": sum(1 for item in groq_records if item["issues"]),
            "duplicate_sympy_expr_groups": len(duplicate_exprs),
            "groq_enabled": args.groq,
            "groq_model": args.model if args.groq else None,
        },
        "duplicate_sympy_exprs": duplicate_exprs,
        "templates": groq_records,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Report written to {out_path}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
