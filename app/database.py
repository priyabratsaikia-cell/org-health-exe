"""SQLite persistence layer – settings, orgs, scans, findings."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "org_health_agent.db"


# ── Bootstrap ─────────────────────────────────────────────────────────

async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with _connect() as db:
        await db.executescript(_SCHEMA)
        await db.commit()
    logger.info("Database initialised at %s", DB_PATH)


def _connect():
    return aiosqlite.connect(str(DB_PATH))


_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orgs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alias        TEXT NOT NULL UNIQUE,
    username     TEXT,
    instance_url TEXT,
    is_active    INTEGER DEFAULT 1,
    connected_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias        TEXT NOT NULL,
    org_username     TEXT,
    scan_type        TEXT DEFAULT 'full',
    status           TEXT DEFAULT 'running',
    health_score     INTEGER DEFAULT 0,
    category_scores  TEXT,
    total_components INTEGER DEFAULT 0,
    total_findings   INTEGER DEFAULT 0,
    critical_count   INTEGER DEFAULT 0,
    high_count       INTEGER DEFAULT 0,
    medium_count     INTEGER DEFAULT 0,
    low_count        INTEGER DEFAULT 0,
    info_count       INTEGER DEFAULT 0,
    summary          TEXT,
    report_json      TEXT,
    started_at       TEXT DEFAULT (datetime('now')),
    completed_at     TEXT
);

CREATE TABLE IF NOT EXISTS findings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id             INTEGER NOT NULL,
    severity            TEXT NOT NULL,
    category            TEXT,
    title               TEXT,
    description         TEXT,
    affected_components TEXT,
    recommendation      TEXT,
    effort              TEXT,
    is_resolved         INTEGER DEFAULT 0,
    resolved_at         TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
);
"""


# ── Settings ──────────────────────────────────────────────────────────

async def get_setting(key: str) -> str | None:
    async with _connect() as db:
        cur = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = await cur.fetchone()
        return row[0] if row else None


async def set_setting(key: str, value: str):
    async with _connect() as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
            (key, value),
        )
        await db.commit()


async def delete_setting(key: str):
    async with _connect() as db:
        await db.execute("DELETE FROM settings WHERE key = ?", (key,))
        await db.commit()


async def get_all_settings() -> dict[str, str]:
    async with _connect() as db:
        cur = await db.execute("SELECT key, value FROM settings")
        return {r[0]: r[1] for r in await cur.fetchall()}


# ── Orgs ──────────────────────────────────────────────────────────────

async def add_org(alias: str, username: str = "", instance_url: str = "") -> int:
    async with _connect() as db:
        await db.execute(
            """INSERT INTO orgs (alias, username, instance_url, is_active, connected_at)
               VALUES (?, ?, ?, 1, datetime('now'))
               ON CONFLICT(alias) DO UPDATE SET
                 username=excluded.username,
                 instance_url=excluded.instance_url,
                 is_active=1,
                 connected_at=datetime('now')""",
            (alias, username, instance_url),
        )
        await db.commit()
        cur = await db.execute("SELECT id FROM orgs WHERE alias = ?", (alias,))
        row = await cur.fetchone()
        return row[0] if row else 0


async def get_orgs() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM orgs WHERE is_active = 1 ORDER BY connected_at DESC"
        )
        return [dict(r) for r in await cur.fetchall()]


async def remove_org(org_id: int):
    async with _connect() as db:
        await db.execute("UPDATE orgs SET is_active = 0 WHERE id = ?", (org_id,))
        await db.commit()


# ── Scans ─────────────────────────────────────────────────────────────

async def create_scan(org_alias: str, org_username: str = "", scan_type: str = "full") -> int:
    async with _connect() as db:
        cur = await db.execute(
            """INSERT INTO scans (org_alias, org_username, scan_type, status, started_at)
               VALUES (?, ?, ?, 'running', datetime('now'))""",
            (org_alias, org_username, scan_type),
        )
        await db.commit()
        return cur.lastrowid


async def update_scan(scan_id: int, **kwargs: Any):
    if not kwargs:
        return
    async with _connect() as db:
        cols = ", ".join(f"{k} = ?" for k in kwargs)
        vals = list(kwargs.values()) + [scan_id]
        await db.execute(f"UPDATE scans SET {cols} WHERE id = ?", vals)
        await db.commit()


async def get_scan(scan_id: int) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM scans WHERE id = ?", (scan_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_scans() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM scans ORDER BY started_at DESC")
        return [dict(r) for r in await cur.fetchall()]


async def delete_scan(scan_id: int):
    async with _connect() as db:
        await db.execute("DELETE FROM findings WHERE scan_id = ?", (scan_id,))
        await db.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
        await db.commit()


# ── Findings ──────────────────────────────────────────────────────────

async def add_finding(
    scan_id: int,
    severity: str,
    category: str,
    title: str,
    description: str,
    affected_components: list[str],
    recommendation: str,
    effort: str = "",
) -> int:
    async with _connect() as db:
        cur = await db.execute(
            """INSERT INTO findings
               (scan_id, severity, category, title, description,
                affected_components, recommendation, effort)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (scan_id, severity, category, title, description,
             json.dumps(affected_components), recommendation, effort),
        )
        await db.commit()
        return cur.lastrowid


async def get_findings(scan_id: int) -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """SELECT * FROM findings WHERE scan_id = ?
               ORDER BY CASE severity
                 WHEN 'Critical' THEN 0 WHEN 'High' THEN 1
                 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END""",
            (scan_id,),
        )
        rows = [dict(r) for r in await cur.fetchall()]
        for r in rows:
            try:
                r["affected_components"] = json.loads(r["affected_components"] or "[]")
            except (json.JSONDecodeError, TypeError):
                r["affected_components"] = []
        return rows


async def resolve_finding(finding_id: int):
    async with _connect() as db:
        await db.execute(
            "UPDATE findings SET is_resolved = 1, resolved_at = datetime('now') WHERE id = ?",
            (finding_id,),
        )
        await db.commit()


async def unresolve_finding(finding_id: int):
    async with _connect() as db:
        await db.execute(
            "UPDATE findings SET is_resolved = 0, resolved_at = NULL WHERE id = ?",
            (finding_id,),
        )
        await db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────

async def get_dashboard_stats() -> dict:
    async with _connect() as db:
        async def _count(sql: str) -> int:
            cur = await db.execute(sql)
            return (await cur.fetchone())[0]

        async def _val(sql: str):
            cur = await db.execute(sql)
            row = await cur.fetchone()
            return row[0] if row else None

        return {
            "total_scans": await _count("SELECT COUNT(*) FROM scans"),
            "completed_scans": await _count("SELECT COUNT(*) FROM scans WHERE status='completed'"),
            "total_findings": await _count("SELECT COUNT(*) FROM findings"),
            "resolved_findings": await _count("SELECT COUNT(*) FROM findings WHERE is_resolved=1"),
            "critical_unresolved": await _count(
                "SELECT COUNT(*) FROM findings WHERE severity='Critical' AND is_resolved=0"
            ),
            "connected_orgs": await _count("SELECT COUNT(*) FROM orgs WHERE is_active=1"),
            "latest_health_score": await _val(
                "SELECT health_score FROM scans WHERE status='completed' ORDER BY completed_at DESC LIMIT 1"
            ),
        }


async def get_dashboard_extended() -> dict:
    """Return rich data for the enhanced dashboard."""
    async with _connect() as db:
        db.row_factory = aiosqlite.Row

        cur = await db.execute(
            """SELECT id, org_alias, health_score, category_scores,
                      total_findings, critical_count, high_count, medium_count,
                      low_count, info_count, started_at, completed_at
               FROM scans WHERE status='completed'
               ORDER BY completed_at DESC LIMIT 10"""
        )
        scan_history = [dict(r) for r in await cur.fetchall()]

        last_5_scores = [s["health_score"] for s in scan_history[:5] if s["health_score"] is not None]
        avg_score = round(sum(last_5_scores) / len(last_5_scores), 1) if last_5_scores else None

        latest_category_scores = {}
        if scan_history:
            try:
                latest_category_scores = json.loads(scan_history[0].get("category_scores") or "{}")
            except (json.JSONDecodeError, TypeError):
                pass

        severity_totals = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
        cur = await db.execute(
            "SELECT severity, COUNT(*) as cnt FROM findings GROUP BY severity"
        )
        for row in await cur.fetchall():
            sev = dict(row)
            if sev["severity"] in severity_totals:
                severity_totals[sev["severity"]] = sev["cnt"]

        cur = await db.execute(
            "SELECT COUNT(*) as cnt FROM findings WHERE is_resolved=1"
        )
        resolved_total = dict(await cur.fetchone())["cnt"]
        cur = await db.execute("SELECT COUNT(*) as cnt FROM findings")
        findings_total = dict(await cur.fetchone())["cnt"]

        cur = await db.execute(
            """SELECT category, COUNT(*) as cnt FROM findings
               WHERE is_resolved=0 GROUP BY category ORDER BY cnt DESC LIMIT 8"""
        )
        top_risk_categories = [dict(r) for r in await cur.fetchall()]

        cur = await db.execute(
            """SELECT effort, COUNT(*) as cnt FROM findings
               WHERE is_resolved=0 AND effort != '' GROUP BY effort"""
        )
        effort_distribution = [dict(r) for r in await cur.fetchall()]

        return {
            "scan_history": scan_history,
            "avg_score_last_5": avg_score,
            "latest_category_scores": latest_category_scores,
            "severity_totals": severity_totals,
            "resolved_total": resolved_total,
            "findings_total": findings_total,
            "top_risk_categories": top_risk_categories,
            "effort_distribution": effort_distribution,
        }
