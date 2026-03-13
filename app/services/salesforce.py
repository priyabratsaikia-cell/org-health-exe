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


async def collect_runtime_data(target_org: str, queries: dict[str, str], progress_callback=None) -> dict[str, Any]:
    """Execute all runtime SOQL queries and gather org limits."""
    runtime: dict[str, Any] = {}

    if progress_callback:
        await progress_callback("Retrieving org governor limits…", percent=5)
    try:
        runtime["limits"] = await get_org_limits(target_org)
    except Exception as exc:
        logger.warning("Failed to get org limits: %s", exc)
        runtime["limits"] = {}

    total = len(queries)
    for idx, (key, query) in enumerate(queries.items(), 1):
        if progress_callback:
            await progress_callback(
                f"Running runtime query: {key} ({idx}/{total})…",
                percent=10 + int(idx / total * 90),
            )
        runtime[key] = await run_soql(target_org, query)

    return runtime


def summarise_runtime_data(runtime: dict[str, Any]) -> str:
    """Build a textual summary of runtime data for the LLM."""
    lines: list[str] = ["# Org Runtime Data\n"]

    # Limits
    limits = runtime.get("limits", {})
    if limits:
        lines.append("## Governor Limits")
        critical_limits = [
            "DailyApiRequests", "DataStorageMB", "FileStorageMB",
            "DailyAsyncApexExecutions", "DailyBulkApiRequests",
            "StreamingApiConcurrentClients", "HourlyODataCallout",
            "SingleEmail", "MassEmail", "DailyWorkflowEmails",
            "HourlyTimeBasedWorkflow", "DailyDurableStreamingApiEvents",
        ]
        for name in critical_limits:
            if name in limits:
                info = limits[name]
                max_val = info.get("max", 0)
                remaining = info.get("remaining", 0)
                used = max_val - remaining if max_val else 0
                pct = int(used / max_val * 100) if max_val else 0
                lines.append(f"- {name}: {used:,}/{max_val:,} used ({pct}%)")
        lines.append("")

    # SOQL results
    for key, data in sorted(runtime.items()):
        if key == "limits":
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

    return "\n".join(lines)
