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
        # Check if we need to migrate the orgs table (old schema had alias UNIQUE)
        cur = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='orgs'")
        orgs_exists = await cur.fetchone()
        if orgs_exists:
            cur = await db.execute("PRAGMA table_info(orgs)")
            cols = {row[1]: row for row in await cur.fetchall()}
            needs_migration = "username" not in cols or "org_name" not in cols
            if not needs_migration:
                # Check if username has UNIQUE constraint (it should)
                cur = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='orgs'")
                create_sql = (await cur.fetchone())[0]
                needs_migration = "username" in cols and "UNIQUE" not in (create_sql or "").upper().split("USERNAME")[1][:20] if "USERNAME" in (create_sql or "").upper() else True
            if needs_migration:
                logger.info("Migrating orgs table to new schema (username UNIQUE)...")
                await db.execute("ALTER TABLE orgs RENAME TO _orgs_old")
                await db.executescript(_SCHEMA)
                await db.execute(
                    """INSERT OR IGNORE INTO orgs (alias, username, instance_url, is_active, connected_at)
                       SELECT alias, COALESCE(username, alias), instance_url, is_active, connected_at
                       FROM _orgs_old WHERE username IS NOT NULL AND username != ''"""
                )
                await db.execute("DROP TABLE _orgs_old")
                await db.commit()
                logger.info("Orgs table migration complete")
            else:
                await db.executescript(_SCHEMA)
                await db.commit()
        else:
            await db.executescript(_SCHEMA)
            await db.commit()
    # Migrate: add new columns to scans if missing
    async with _connect() as db:
        cur = await db.execute("PRAGMA table_info(scans)")
        scan_cols = {row[1] for row in await cur.fetchall()}
        if "governor_limits_json" not in scan_cols:
            logger.info("Adding governor_limits_json column to scans table…")
            await db.execute("ALTER TABLE scans ADD COLUMN governor_limits_json TEXT")
        if "code_analysis_json" not in scan_cols:
            logger.info("Adding code_analysis_json column to scans table…")
            await db.execute("ALTER TABLE scans ADD COLUMN code_analysis_json TEXT")
        if "parameter_coverage_json" not in scan_cols:
            logger.info("Adding parameter_coverage_json column to scans table…")
            await db.execute("ALTER TABLE scans ADD COLUMN parameter_coverage_json TEXT")
        if "governor_limits_trends_json" not in scan_cols:
            logger.info("Adding governor_limits_trends_json column to scans table…")
            await db.execute("ALTER TABLE scans ADD COLUMN governor_limits_trends_json TEXT")
        if "parameter_results_json" not in scan_cols:
            logger.info("Adding parameter_results_json column to scans table…")
            await db.execute("ALTER TABLE scans ADD COLUMN parameter_results_json TEXT")
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
    alias        TEXT NOT NULL DEFAULT '',
    username     TEXT NOT NULL UNIQUE,
    instance_url TEXT,
    org_name     TEXT DEFAULT '',
    is_sandbox   INTEGER DEFAULT 0,
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
    governor_limits_json TEXT,
    code_analysis_json TEXT,
    parameter_coverage_json TEXT,
    governor_limits_trends_json TEXT,
    parameter_results_json TEXT,
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

_MIGRATIONS = [
    # Migration 1: Rebuild orgs table with username as UNIQUE key
    """
    CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO _schema_version VALUES (0);
    """,
]


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

async def add_org(
    alias: str,
    username: str = "",
    instance_url: str = "",
    org_name: str = "",
    is_sandbox: bool = False,
) -> int:
    if not username:
        return 0
    async with _connect() as db:
        await db.execute(
            """INSERT INTO orgs (alias, username, instance_url, org_name, is_sandbox, is_active, connected_at)
               VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
               ON CONFLICT(username) DO UPDATE SET
                 alias=excluded.alias,
                 instance_url=excluded.instance_url,
                 org_name=excluded.org_name,
                 is_sandbox=excluded.is_sandbox,
                 is_active=1,
                 connected_at=datetime('now')""",
            (alias, username, instance_url, org_name, int(is_sandbox)),
        )
        await db.commit()
        cur = await db.execute("SELECT id FROM orgs WHERE username = ?", (username,))
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


async def get_scans(org_alias: str | None = None) -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        if org_alias:
            cur = await db.execute(
                "SELECT * FROM scans WHERE org_alias = ? ORDER BY started_at DESC",
                (org_alias,),
            )
        else:
            cur = await db.execute("SELECT * FROM scans ORDER BY started_at DESC")
        return [dict(r) for r in await cur.fetchall()]


async def get_running_scans() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM scans WHERE status = 'running' ORDER BY started_at DESC"
        )
        return [dict(r) for r in await cur.fetchall()]


async def get_org_by_alias(alias: str) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM orgs WHERE alias = ? AND is_active = 1 LIMIT 1", (alias,)
        )
        row = await cur.fetchone()
        if row:
            return dict(row)
        # Fallback: try matching by username in case alias was changed
        cur = await db.execute(
            "SELECT * FROM orgs WHERE username = ? AND is_active = 1 LIMIT 1", (alias,)
        )
        row = await cur.fetchone()
        return dict(row) if row else None


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


async def get_all_findings(org_alias: str | None = None) -> list[dict]:
    """Return findings from all completed (non-running) scans."""
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        if org_alias:
            cur = await db.execute(
                """SELECT f.* FROM findings f
                   JOIN scans s ON f.scan_id = s.id
                   WHERE s.status = 'completed' AND s.org_alias = ?
                   ORDER BY CASE f.severity
                     WHEN 'Critical' THEN 0 WHEN 'High' THEN 1
                     WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END""",
                (org_alias,),
            )
        else:
            cur = await db.execute(
                """SELECT f.* FROM findings f
                   JOIN scans s ON f.scan_id = s.id
                   WHERE s.status = 'completed'
                   ORDER BY CASE f.severity
                     WHEN 'Critical' THEN 0 WHEN 'High' THEN 1
                     WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END"""
            )
        rows = [dict(r) for r in await cur.fetchall()]
        for r in rows:
            try:
                r["affected_components"] = json.loads(r["affected_components"] or "[]")
            except (json.JSONDecodeError, TypeError):
                r["affected_components"] = []
        return rows


async def get_finding_by_id(finding_id: int) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM findings WHERE id = ?", (finding_id,))
        row = await cur.fetchone()
        if not row:
            return None
        r = dict(row)
        try:
            r["affected_components"] = json.loads(r["affected_components"] or "[]")
        except (json.JSONDecodeError, TypeError):
            r["affected_components"] = []
        return r


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

async def get_dashboard_stats(org_alias: str | None = None) -> dict:
    async with _connect() as db:
        scan_filter = "WHERE org_alias = ?" if org_alias else ""
        scan_params: tuple = (org_alias,) if org_alias else ()
        finding_join = (
            "JOIN scans s ON f.scan_id = s.id WHERE s.org_alias = ?"
            if org_alias else ""
        )
        finding_params: tuple = (org_alias,) if org_alias else ()

        async def _count(sql: str, params: tuple = ()) -> int:
            cur = await db.execute(sql, params)
            return (await cur.fetchone())[0]

        async def _val(sql: str, params: tuple = ()):
            cur = await db.execute(sql, params)
            row = await cur.fetchone()
            return row[0] if row else None

        completed_filter = f"WHERE status='completed' AND org_alias = ?" if org_alias else "WHERE status='completed'"
        completed_params: tuple = (org_alias,) if org_alias else ()

        return {
            "total_scans": await _count(
                f"SELECT COUNT(*) FROM scans {scan_filter}", scan_params
            ),
            "completed_scans": await _count(
                f"SELECT COUNT(*) FROM scans {completed_filter}", completed_params
            ),
            "total_findings": await _count(
                f"SELECT COUNT(*) FROM findings f {finding_join}", finding_params
            ),
            "resolved_findings": await _count(
                f"SELECT COUNT(*) FROM findings f {finding_join}{' AND' if org_alias else ' WHERE'} f.is_resolved=1",
                finding_params,
            ),
            "critical_unresolved": await _count(
                f"SELECT COUNT(*) FROM findings f {finding_join}{' AND' if org_alias else ' WHERE'} f.severity='Critical' AND f.is_resolved=0",
                finding_params,
            ),
            "connected_orgs": await _count("SELECT COUNT(*) FROM orgs WHERE is_active=1"),
            "latest_health_score": await _val(
                f"SELECT health_score FROM scans {completed_filter} ORDER BY completed_at DESC LIMIT 1",
                completed_params,
            ),
        }


async def has_governor_limits_data(org_alias: str | None = None) -> bool:
    """Check if any completed scan for the given org has governor limit data."""
    async with _connect() as db:
        if org_alias:
            cur = await db.execute(
                "SELECT COUNT(*) FROM scans WHERE status='completed' AND org_alias = ? "
                "AND governor_limits_json IS NOT NULL AND governor_limits_json != '[]'",
                (org_alias,),
            )
        else:
            cur = await db.execute(
                "SELECT COUNT(*) FROM scans WHERE status='completed' "
                "AND governor_limits_json IS NOT NULL AND governor_limits_json != '[]'"
            )
        return (await cur.fetchone())[0] > 0


async def get_dashboard_extended(org_alias: str | None = None) -> dict:
    """Return rich data for the enhanced dashboard."""
    async with _connect() as db:
        db.row_factory = aiosqlite.Row

        scan_where = "WHERE status='completed' AND org_alias = ?" if org_alias else "WHERE status='completed'"
        scan_params: tuple = (org_alias,) if org_alias else ()

        cur = await db.execute(
            f"""SELECT id, org_alias, health_score, category_scores,
                      total_findings, critical_count, high_count, medium_count,
                      low_count, info_count, started_at, completed_at,
                      (SELECT COUNT(*) FROM findings WHERE scan_id = scans.id AND is_resolved = 1) AS resolved_count
               FROM scans {scan_where}
               ORDER BY completed_at DESC LIMIT 10""",
            scan_params,
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

        finding_join = (
            "JOIN scans s ON f.scan_id = s.id WHERE s.org_alias = ?"
            if org_alias else ""
        )
        finding_params: tuple = (org_alias,) if org_alias else ()

        severity_totals = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
        cur = await db.execute(
            f"SELECT f.severity, COUNT(*) as cnt FROM findings f {finding_join} GROUP BY f.severity",
            finding_params,
        )
        for row in await cur.fetchall():
            sev = dict(row)
            if sev["severity"] in severity_totals:
                severity_totals[sev["severity"]] = sev["cnt"]

        cur = await db.execute(
            f"SELECT COUNT(*) as cnt FROM findings f {finding_join}{' AND' if org_alias else ' WHERE'} f.is_resolved=1",
            finding_params,
        )
        resolved_total = dict(await cur.fetchone())["cnt"]
        cur = await db.execute(
            f"SELECT COUNT(*) as cnt FROM findings f {finding_join}",
            finding_params,
        )
        findings_total = dict(await cur.fetchone())["cnt"]

        cur = await db.execute(
            f"""SELECT f.category, COUNT(*) as cnt FROM findings f
                {finding_join}{' AND' if org_alias else ' WHERE'} f.is_resolved=0
                GROUP BY f.category ORDER BY cnt DESC LIMIT 8""",
            finding_params,
        )
        top_risk_categories = [dict(r) for r in await cur.fetchall()]

        cur = await db.execute(
            f"""SELECT f.effort, COUNT(*) as cnt FROM findings f
                {finding_join}{' AND' if org_alias else ' WHERE'} f.is_resolved=0 AND f.effort != ''
                GROUP BY f.effort""",
            finding_params,
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
