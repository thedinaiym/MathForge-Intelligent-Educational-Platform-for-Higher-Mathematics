from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

REPORT_PATH = ROOT / "db_quality_report.json"
TARGET_CATEGORIES = {"Calculus", "Linear Algebra"}

GENERIC_BAD = {
    "{A}*x**2 + {B}*x + {C}",
    "A*x**2 + B*x + C",
    "{A}*x + {B}",
    "A*x + B",
    "{A}",
    "A",
    "None",
    "",
}


def _db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set SUPABASE_DB_URL or DATABASE_URL.")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _issues(row: dict[str, Any], duplicate_topics: dict[str, set[str]]) -> list[str]:
    issues: list[str] = []
    expr = str(row.get("expr") or "")
    topic = str(row.get("topic") or "")
    title = str(row.get("title_en") or "")
    texts = row.get("texts") or {}
    ranges = row.get("ranges") or {}

    if not topic:
        issues.append("missing topic")
    if not expr or expr == "None":
        issues.append("missing sympy_expr")
    if expr in GENERIC_BAD:
        issues.append(f"generic_or_placeholder_expr: {expr}")
    if "{" in expr or "}" in expr:
        issues.append("sympy_expr contains braces instead of plain SymPy variables")
    if "=" in expr:
        issues.append("sympy_expr contains equality; should use equation_rhs")
    if any(marker in expr for marker in ("OO", "phi(", "psi(", "alpha", "beta", "gamma")):
        issues.append("sympy_expr contains textbook/free-form symbols likely not generatable")

    if not isinstance(ranges, dict) or not ranges:
        issues.append("missing ranges")
    else:
        for name, bounds in ranges.items():
            if (
                not isinstance(bounds, list)
                or len(bounds) != 2
                or not all(isinstance(v, int) for v in bounds)
                or bounds[0] >= bounds[1]
            ):
                issues.append(f"invalid range for {name}: {bounds!r}")

    if not isinstance(texts, dict):
        issues.append("texts is not object")
    else:
        for lang in ("en", "ru", "kg"):
            if not str(texts.get(lang, "")).strip():
                issues.append(f"missing {lang} text")

    if expr in {"{A}*x**2 + {B}*x + {C}", "A*x**2 + B*x + C"}:
        if "quadratic" not in topic.lower() and "quadratic" not in title.lower():
            issues.append("quadratic formula under non-quadratic topic/title")

    dup_topics = duplicate_topics.get(expr, set())
    if len(dup_topics) > 1:
        issues.append(
            "same sympy_expr used by multiple topics: "
            + ", ".join(sorted(dup_topics)[:25])
        )

    return issues


async def main() -> None:
    engine = create_async_engine(_db_url(), echo=False)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select t.id::text as id,
                           c.name_translations->>'en' as category,
                           t.difficulty,
                           t.title_translations->>'en' as title_en,
                           t.template_json->>'topic' as topic,
                           t.template_json->>'sympy_expr' as expr,
                           t.template_json->'ranges' as ranges,
                           t.template_json->'texts' as texts
                    from task_templates t
                    join categories c on c.id = t.category_id
                    where t.is_active = true
                      and c.name_translations->>'en' in ('Calculus', 'Linear Algebra')
                    order by category, difficulty, title_en
                    """
                )
            )
        ).all()
    await engine.dispose()

    records = [dict(row._mapping) for row in rows]
    duplicate_topics: dict[str, set[str]] = defaultdict(set)
    for row in records:
        duplicate_topics[str(row.get("expr") or "")].add(str(row.get("topic") or ""))

    audited = []
    for row in records:
        issues = _issues(row, duplicate_topics)
        audited.append({**row, "status": "ok" if not issues else "suspicious", "issues": issues})

    counts = Counter(item["status"] for item in audited)
    by_category = Counter((item["category"], item["status"]) for item in audited)
    issue_counts = Counter(issue.split(":")[0] for item in audited for issue in item["issues"])

    report = {
        "summary": {
            "checked": len(audited),
            "ok": counts["ok"],
            "suspicious": counts["suspicious"],
            "by_category_status": {
                f"{category}:{status}": count
                for (category, status), count in sorted(by_category.items())
            },
            "top_issue_counts": dict(issue_counts.most_common(30)),
        },
        "templates": audited,
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Report written to {REPORT_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
