"""
Fast read-only audit for Calculus and Linear Algebra task templates.

It checks every active template in those categories, with a hard timeout around
generation so one bad SymPy expression cannot block the whole audit.

Run:
    venv\\Scripts\\python.exe backend\\audit_math_categories.py
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

from app.core.engine.generator import TaskGenerator  # noqa: E402
from app.db.models import TaskTemplate  # noqa: E402


REPORT_PATH = ROOT / "math_category_audit_report.json"
TARGET_CATEGORIES = {"Calculus", "Linear Algebra"}
GENERATION_TIMEOUT_SECONDS = 8
GLOBAL_GENERATION_TIMEOUT_SECONDS = 240

GENERIC_EXPR_PATTERNS = {
    "{A}*x**2 + {B}*x + {C}",
    "A*x**2 + B*x + C",
    "{A}*x + {B}",
    "A*x + B",
    "{A}",
    "A",
    "None",
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


def _audit_one(payload: dict[str, Any]) -> dict[str, Any]:
    template_json = payload["template_json"]
    issues: list[str] = []

    for key in ("topic", "sympy_expr", "ranges", "texts"):
        if key not in template_json:
            issues.append(f"missing template_json.{key}")

    expr = str(template_json.get("sympy_expr"))
    topic = str(template_json.get("topic") or "")
    title = str(payload.get("title_en") or "")

    if expr in GENERIC_EXPR_PATTERNS:
        issues.append(f"generic_or_placeholder_expr: {expr}")
    if "{" in expr or "}" in expr:
        issues.append("sympy_expr contains braces; generator strips them but dataset should store plain SymPy")
    if "=" in expr:
        issues.append("sympy_expr contains '='; use expression plus equation_rhs instead")
    if re.search(r"\bOO\d|\bh\s*=", expr):
        issues.append("symbolic/textbook notation appears in sympy_expr")

    if "quadratic" not in topic.lower() and "quadratic" not in title.lower():
        if expr in {"{A}*x**2 + {B}*x + {C}", "A*x**2 + B*x + C"}:
            issues.append("quadratic expression under non-quadratic topic/title")

    try:
        generated = TaskGenerator.generate(template_json, locale="en")
        return {
            "id": payload["id"],
            "category": payload["category"],
            "difficulty": payload["difficulty"],
            "title_en": title,
            "topic": topic,
            "sympy_expr": expr,
            "status": "ok" if not issues else "suspicious",
            "issues": issues,
            "sample": {
                "question_text": generated.get("question_text"),
                "condition_latex": generated.get("condition_latex"),
                "answer_latex": generated.get("answer_latex"),
                "coefficients": generated.get("coefficients"),
            },
        }
    except Exception as exc:
        issues.append(f"generation_failed: {type(exc).__name__}: {exc}")
        return {
            "id": payload["id"],
            "category": payload["category"],
            "difficulty": payload["difficulty"],
            "title_en": title,
            "topic": topic,
            "sympy_expr": expr,
            "status": "failed",
            "issues": issues,
            "sample": None,
        }


async def _load_templates() -> list[dict[str, Any]]:
    engine = create_async_engine(_db_url(), echo=False)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select t.id::text as id,
                           c.name_translations->>'en' as category,
                           t.difficulty as difficulty,
                           t.title_translations->>'en' as title_en,
                           t.template_json as template_json
                    from task_templates t
                    join categories c on c.id = t.category_id
                    where t.is_active = true
                      and c.name_translations->>'en' in ('Calculus', 'Linear Algebra')
                    """
                )
            )
        ).all()
    await engine.dispose()

    payloads: list[dict[str, Any]] = []
    for row in rows:
        data = dict(row._mapping)
        category_name = data["category"]
        payloads.append(
            {
                "id": data["id"],
                "category": category_name,
                "difficulty": data["difficulty"],
                "title_en": data["title_en"] or "",
                "template_json": data["template_json"] or {},
            }
        )
    return payloads


def _run_generation_audit(payloads: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    results: list[dict[str, Any]] = []
    timed_out_ids: list[str] = []

    pool = concurrent.futures.ProcessPoolExecutor(max_workers=4)
    try:
        future_to_payload = {pool.submit(_audit_one, payload): payload for payload in payloads}
        done, not_done = concurrent.futures.wait(
            future_to_payload,
            timeout=GLOBAL_GENERATION_TIMEOUT_SECONDS,
            return_when=concurrent.futures.ALL_COMPLETED,
        )

        for future in done:
            payload = future_to_payload[future]
            try:
                results.append(future.result(timeout=GENERATION_TIMEOUT_SECONDS))
            except Exception as exc:
                results.append(
                    {
                        "id": payload["id"],
                        "category": payload["category"],
                        "difficulty": payload["difficulty"],
                        "title_en": payload["title_en"],
                        "topic": payload["template_json"].get("topic"),
                        "sympy_expr": payload["template_json"].get("sympy_expr"),
                        "status": "failed",
                        "issues": [f"worker_failed: {type(exc).__name__}: {exc}"],
                        "sample": None,
                    }
                )

        for future in not_done:
            payload = future_to_payload[future]
            future.cancel()
            timed_out_ids.append(payload["id"])
            results.append(
                {
                    "id": payload["id"],
                    "category": payload["category"],
                    "difficulty": payload["difficulty"],
                    "title_en": payload["title_en"],
                    "topic": payload["template_json"].get("topic"),
                    "sympy_expr": payload["template_json"].get("sympy_expr"),
                    "status": "timeout",
                    "issues": ["generation timed out"],
                    "sample": None,
                }
            )

        pool.shutdown(wait=False, cancel_futures=True)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return results, timed_out_ids


async def main() -> None:
    payloads = await _load_templates()
    print(
        f"Loaded active templates for {', '.join(sorted(TARGET_CATEGORIES))}: {len(payloads)}",
        flush=True,
    )

    results, timed_out_ids = _run_generation_audit(payloads)

    expr_topics: dict[str, set[str]] = defaultdict(set)
    for item in results:
        expr = str(item.get("sympy_expr") or "")
        topic = str(item.get("topic") or "")
        if expr and topic:
            expr_topics[expr].add(topic)

    duplicate_exprs = {
        expr: sorted(topics)
        for expr, topics in expr_topics.items()
        if len(topics) > 1
    }

    for item in results:
        expr = str(item.get("sympy_expr") or "")
        if expr in duplicate_exprs:
            item["issues"].append(
                "same sympy_expr used by multiple topics: " + ", ".join(duplicate_exprs[expr][:20])
            )
            if item["status"] == "ok":
                item["status"] = "suspicious"

    counts = Counter(item["status"] for item in results)
    by_category = Counter((item["category"], item["status"]) for item in results)

    report = {
        "summary": {
            "loaded": len(payloads),
            "checked": len(results),
            "ok": counts["ok"],
            "suspicious": counts["suspicious"],
            "failed": counts["failed"],
            "timeout": counts["timeout"],
            "duplicate_sympy_expr_groups": len(duplicate_exprs),
            "timed_out_ids": timed_out_ids[:100],
        },
        "by_category_status": {
            f"{category}:{status}": count
            for (category, status), count in sorted(by_category.items())
        },
        "duplicate_sympy_exprs": duplicate_exprs,
        "templates": sorted(results, key=lambda item: (item["category"], item["status"], item["title_en"])),
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Report written to {REPORT_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
