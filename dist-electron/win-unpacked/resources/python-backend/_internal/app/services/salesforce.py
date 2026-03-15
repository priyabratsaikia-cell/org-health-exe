"""Salesforce CLI wrapper – metadata retrieval and runtime data queries."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from typing import Any

from app.config import METADATA_TYPES_TO_RETRIEVE

logger = logging.getLogger(__name__)


def _find_sf_cli() -> str:
    path = shutil.which("sf")
    if path:
        return path
    path = shutil.which("sfdx")
    if path:
        return path
    raise EnvironmentError(
        "Salesforce CLI ('sf' or 'sfdx') not found on PATH. "
        "Install it from https://developer.salesforce.com/tools/salesforcecli"
    )


async def _run_cli(args: list[str], timeout: int = 120) -> dict[str, Any]:
    sf = _find_sf_cli()
    cmd = [sf] + args + ["--json"]
    logger.info("Running: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise TimeoutError(f"SF CLI command timed out after {timeout}s: {' '.join(cmd)}")

    raw = stdout.decode("utf-8", errors="replace").strip()
    if not raw:
        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"SF CLI error (exit {proc.returncode}): {err}")
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Non-JSON output from SF CLI: %s", raw[:500])
        return {"raw": raw}

    if data.get("status") != 0 and "result" not in data:
        msg = data.get("message", data.get("name", "Unknown SF CLI error"))
        raise RuntimeError(f"SF CLI error: {msg}")

    return data


# ── Org management ────────────────────────────────────────────────────

async def login_web(alias: str, instance_url: str = "https://login.salesforce.com") -> dict:
    result = await _run_cli(
        ["org", "login", "web", "--alias", alias, "--instance-url", instance_url],
        timeout=300,
    )
    return result.get("result", result)


async def display_org(target_org: str) -> dict:
    result = await _run_cli(["org", "display", "--target-org", target_org])
    return result.get("result", result)


async def list_orgs() -> dict:
    result = await _run_cli(["org", "list"])
    return result.get("result", result)


# ── Metadata retrieval (the "what exists" layer) ─────────────────────

async def list_metadata(target_org: str, metadata_type: str) -> list[dict]:
    try:
        result = await _run_cli(
            ["org", "list", "metadata", "--metadata-type", metadata_type, "--target-org", target_org],
            timeout=60,
        )
        items = result.get("result", [])
        return items if isinstance(items, list) else []
    except Exception as exc:
        logger.warning("Failed to list %s: %s", metadata_type, exc)
        return []


async def retrieve_org_metadata(
    target_org: str,
    types: list[str] | None = None,
    progress_callback=None,
) -> dict[str, list[dict]]:
    types = types or METADATA_TYPES_TO_RETRIEVE
    metadata: dict[str, list[dict]] = {}
    total = len(types)

    for idx, mtype in enumerate(types, 1):
        if progress_callback:
            await progress_callback(
                f"Retrieving {mtype} ({idx}/{total})…",
                percent=int(idx / total * 100),
            )
        items = await list_metadata(target_org, mtype)
        if items:
            metadata[mtype] = items
            logger.info("Retrieved %d %s components", len(items), mtype)

    return metadata


def summarise_metadata(metadata: dict[str, list[dict]]) -> str:
    lines: list[str] = []
    total = 0
    for mtype, items in sorted(metadata.items()):
        names = [item.get("fullName", item.get("fileName", "?")) for item in items]
        total += len(names)
        sample = names[:30]
        suffix = f" … and {len(names) - 30} more" if len(names) > 30 else ""
        lines.append(f"## {mtype} ({len(names)} components)")
        lines.append(", ".join(sample) + suffix)
        lines.append("")
    header = f"# Org Metadata Summary — {total} total components\n\n"
    return header + "\n".join(lines)


# ── Limits Monitor Package Detection ──────────────────────────────────

async def detect_limits_package(target_org: str) -> dict[str, Any]:
    """3-step fingerprint check for the Salesforce Limit Monitor package.

    Returns a dict with keys: installed, objects_exist, classes_active,
    jobs_running, status.
    """
    result: dict[str, Any] = {
        "installed": False,
        "objects_exist": False,
        "classes_active": False,
        "jobs_running": False,
        "status": "not_installed",
    }

    # Step 1 – custom objects Limit__c and LimitSnapshot__c
    try:
        # Try --sobject first (CLI v2.x), fall back to --sobject-type (newer CLIs)
        try:
            sobjects = await _run_cli(
                ["sobject", "list", "--sobject", "custom", "--target-org", target_org],
                timeout=60,
            )
        except Exception:
            sobjects = await _run_cli(
                ["sobject", "list", "--sobject-type", "custom", "--target-org", target_org],
                timeout=60,
            )
        custom_objects = sobjects.get("result", [])
        if not isinstance(custom_objects, list):
            custom_objects = []
        has_both = "Limit__c" in custom_objects and "LimitSnapshot__c" in custom_objects
        result["objects_exist"] = has_both
        if not has_both:
            return result
    except Exception as exc:
        logger.warning("Limits package detection step 1 failed: %s", exc)
        return result

    # Step 2 – Apex classes LimitsUtil and LimitsSnapshotSchedule are Active
    try:
        classes = await run_soql(
            target_org,
            "SELECT Name, Status FROM ApexClass "
            "WHERE Name IN ('LimitsUtil','LimitsSnapshotSchedule')",
        )
        active = [c for c in classes if c.get("Status") == "Active"]
        result["classes_active"] = len(active) >= 2
        if not result["classes_active"]:
            result["status"] = "partial"
            return result
    except Exception as exc:
        logger.warning("Limits package detection step 2 failed: %s", exc)
        result["status"] = "partial"
        return result

    # Step 3 – scheduled jobs running
    try:
        jobs = await run_soql(
            target_org,
            "SELECT CronJobDetail.Name, State FROM CronTrigger "
            "WHERE CronJobDetail.Name LIKE '%Limits Monitor%'",
        )
        waiting = [j for j in jobs if j.get("State") == "WAITING"]
        result["jobs_running"] = len(waiting) > 0
    except Exception as exc:
        logger.warning("Limits package detection step 3 failed: %s", exc)

    if result["jobs_running"]:
        result["installed"] = True
        result["status"] = "installed_running"
    else:
        result["status"] = "installed_not_running"

    return result


async def query_limits_package_data(target_org: str) -> list[dict]:
    """Query all Limit__c records (current snapshot of ~70 governor limits)."""
    return await run_soql(
        target_org,
        "SELECT Name, LimitKey__c, LastSnapshotValue__c, LastPercentOfLimit__c, "
        "AlertThreshold__c, LastRetrieveTime__c, Errors__c "
        "FROM Limit__c WHERE Errors__c = null "
        "ORDER BY LastPercentOfLimit__c DESC",
    )


# ── Runtime data queries (the "how it's behaving" layer) ──────────────

async def get_org_limits(target_org: str) -> dict[str, Any]:
    result = await _run_cli(
        ["org", "list", "limits", "--target-org", target_org],
        timeout=60,
    )
    raw = result.get("result", [])
    limits: dict[str, Any] = {}
    if isinstance(raw, list):
        for item in raw:
            name = item.get("name", "")
            if name:
                limits[name] = {
                    "max": item.get("max", 0),
                    "remaining": item.get("remaining", 0),
                }
    return limits


async def run_soql(target_org: str, query: str) -> list[dict]:
    try:
        result = await _run_cli(
            ["data", "query", "--query", query, "--target-org", target_org],
            timeout=120,
        )
        records = result.get("result", {})
        if isinstance(records, dict):
            return records.get("records", [])
        return []
    except Exception as exc:
        logger.warning("SOQL query failed: %s — %s", query[:80], exc)
        return []


async def run_tooling_soql(target_org: str, query: str) -> list[dict]:
    """Execute SOQL via the Tooling API (--use-tooling-api flag)."""
    try:
        result = await _run_cli(
            ["data", "query", "--query", query, "--target-org", target_org,
             "--use-tooling-api"],
            timeout=120,
        )
        records = result.get("result", {})
        if isinstance(records, dict):
            return records.get("records", [])
        return []
    except Exception as exc:
        logger.warning("Tooling SOQL query failed: %s — %s", query[:80], exc)
        return []


async def collect_runtime_data(
    target_org: str,
    queries: dict[str, str],
    tooling_queries: dict[str, str] | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    """Execute all runtime SOQL + Tooling API queries and gather org limits."""
    runtime: dict[str, Any] = {}

    if progress_callback:
        await progress_callback("Retrieving org governor limits…", percent=2)
    try:
        runtime["limits"] = await get_org_limits(target_org)
    except Exception as exc:
        logger.warning("Failed to get org limits: %s", exc)
        runtime["limits"] = {}

    all_queries = list(queries.items())
    tooling_items = list((tooling_queries or {}).items())
    grand_total = len(all_queries) + len(tooling_items)

    for idx, (key, query) in enumerate(all_queries, 1):
        if progress_callback:
            await progress_callback(
                f"Running runtime query: {key} ({idx}/{grand_total})…",
                percent=5 + int(idx / grand_total * 85),
            )
        runtime[key] = await run_soql(target_org, query)

    if tooling_items:
        runtime["tooling"] = {}
        for idx2, (key, query) in enumerate(tooling_items, 1):
            overall_idx = len(all_queries) + idx2
            if progress_callback:
                await progress_callback(
                    f"Running Tooling API query: {key} ({overall_idx}/{grand_total})…",
                    percent=5 + int(overall_idx / grand_total * 85),
                )
            runtime["tooling"][key] = await run_tooling_soql(target_org, query)

    return runtime


async def collect_limit_snapshots(
    target_org: str, queries: dict[str, str],
) -> dict[str, list[dict]]:
    """Collect LimitSnapshot__c trend data from the Limit Monitor package."""
    snapshots: dict[str, list[dict]] = {}
    for key, query in queries.items():
        try:
            snapshots[key] = await run_soql(target_org, query)
        except Exception as exc:
            logger.warning("Limit snapshot query %s failed: %s", key, exc)
            snapshots[key] = []
    return snapshots


def summarise_runtime_data(runtime: dict[str, Any]) -> str:
    """Build a textual summary of runtime data for the LLM."""
    lines: list[str] = ["# Org Runtime Data\n"]

    # Limits
    limits = runtime.get("limits", {})
    if limits:
        lines.append("## Governor Limits (Live)")
        for name, info in sorted(limits.items()):
            max_val = info.get("max", 0)
            remaining = info.get("remaining", 0)
            used = max_val - remaining if max_val else 0
            pct = int(used / max_val * 100) if max_val else 0
            if pct >= 50 or name in (
                "DailyApiRequests", "DataStorageMB", "FileStorageMB",
                "DailyAsyncApexExecutions", "DailyBulkApiRequests",
                "StreamingApiConcurrentClients", "HourlyODataCallout",
                "SingleEmail", "MassEmail", "DailyWorkflowEmails",
                "HourlyTimeBasedWorkflow", "DailyDurableStreamingApiEvents",
            ):
                lines.append(f"- {name}: {used:,}/{max_val:,} used ({pct}%)")
        lines.append("")

    # Standard SOQL results
    for key, data in sorted(runtime.items()):
        if key in ("limits", "tooling", "limits_package", "limits_snapshots"):
            continue
        lines.append(f"## {key}")
        if isinstance(data, list):
            if not data:
                lines.append("- No results")
            else:
                for record in data[:30]:
                    cleaned = {k: v for k, v in record.items()
                               if k != "attributes" and v is not None}
                    lines.append(f"- {json.dumps(cleaned)}")
                if len(data) > 30:
                    lines.append(f"  … and {len(data) - 30} more records")
        else:
            lines.append(f"- {data}")
        lines.append("")

    # Tooling API results
    tooling = runtime.get("tooling", {})
    if tooling:
        lines.append("# Tooling API Data\n")
        for key, data in sorted(tooling.items()):
            lines.append(f"## {key}")
            if isinstance(data, list):
                if not data:
                    lines.append("- No results")
                else:
                    for record in data[:40]:
                        cleaned = {k: v for k, v in record.items()
                                   if k != "attributes" and v is not None}
                        lines.append(f"- {json.dumps(cleaned)}")
                    if len(data) > 40:
                        lines.append(f"  … and {len(data) - 40} more records")
            else:
                lines.append(f"- {data}")
            lines.append("")

    # Limit snapshot trends
    snapshots = runtime.get("limits_snapshots", {})
    if snapshots:
        lines.append("# Governor Limit Trends (7-day)\n")
        for key, data in sorted(snapshots.items()):
            lines.append(f"## {key}")
            if isinstance(data, list) and data:
                for record in data[:20]:
                    cleaned = {k: v for k, v in record.items()
                               if k != "attributes" and v is not None}
                    lines.append(f"- {json.dumps(cleaned)}")
            else:
                lines.append("- No trend data")
            lines.append("")

    return "\n".join(lines)
