"""FastAPI application – REST + WebSocket with SQLite persistence."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app import database as db
from app.config import HEALTH_CATEGORIES, app_state
from app.parameter_registry import PARAMETER_REGISTRY, PARAMS_BY_CATEGORY
from app.models import ConnectOrgRequest, SetApiKeyRequest
from app.services import salesforce

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parent / "static"
REACT_DIR = STATIC_DIR / "dist"


# ── Lifespan ──────────────────────────────────────────────────────────

async def _sync_orgs_from_cli() -> int:
    """Discover all orgs authenticated in the Salesforce CLI and sync to DB."""
    try:
        result = await salesforce.list_orgs()
    except Exception as exc:
        logger.warning("Could not list CLI orgs: %s", exc)
        return 0

    seen_usernames: set[str] = set()
    count = 0
    for category in ("nonScratchOrgs", "scratchOrgs"):
        for org in result.get(category, []):
            username = org.get("username", "")
            if not username or username in seen_usernames:
                continue
            connected = org.get("connectedStatus", "")
            if connected != "Connected":
                continue
            seen_usernames.add(username)
            alias = org.get("alias", "") or username.split("@")[0]
            instance_url = org.get("instanceUrl", "")
            org_name = org.get("name", "")
            is_sandbox = bool(org.get("isSandbox", False))
            await db.add_org(alias, username, instance_url, org_name, is_sandbox)
            count += 1
    logger.info("Synced %d connected orgs from Salesforce CLI", count)
    return count


async def _cleanup_stale_scans():
    """Mark any scans left in 'running' state as 'failed' on startup."""
    try:
        stale = await db.get_running_scans()
        for scan in stale:
            scan_id = scan.get("id")
            if scan_id:
                await db.update_scan(scan_id, status="failed")
                logger.info("Marked stale running scan %d as failed", scan_id)
        if stale:
            logger.info("Cleaned up %d stale running scan(s)", len(stale))
    except Exception as exc:
        logger.warning("Could not clean up stale scans: %s", exc)


@asynccontextmanager
async def lifespan(application: FastAPI):
    await db.init_db()
    await _cleanup_stale_scans()
    api_key = await db.get_setting("gemini_api_key")
    model = await db.get_setting("gemini_model")
    if api_key:
        app_state.gemini_api_key = api_key
    if model:
        app_state.gemini_model = model
    await _sync_orgs_from_cli()
    yield


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.url.path.startswith("/static/") or request.url.path.startswith("/assets/") or request.url.path == "/":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app = FastAPI(title="Salesforce Org Health Monitor", version="2.0.0", lifespan=lifespan)
app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_use_react = (REACT_DIR / "index.html").is_file()
if _use_react:
    app.mount("/assets", StaticFiles(directory=str(REACT_DIR / "assets")), name="react-assets")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Settings ──────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    settings = await db.get_all_settings()
    masked_key = ""
    raw = settings.get("gemini_api_key", "")
    if raw:
        masked_key = raw[:4] + "•" * max(0, len(raw) - 8) + raw[-4:] if len(raw) > 8 else "••••"
    return {
        "api_key_set": bool(raw),
        "api_key_masked": masked_key,
        "model": settings.get("gemini_model", "gemini-3.1-pro-preview"),
    }


@app.post("/api/settings/apikey")
async def set_api_key(req: SetApiKeyRequest):
    await db.set_setting("gemini_api_key", req.api_key)
    await db.set_setting("gemini_model", req.model)
    app_state.gemini_api_key = req.api_key
    app_state.gemini_model = req.model
    return {"ok": True, "model": req.model}


@app.delete("/api/settings/apikey")
async def remove_api_key():
    await db.delete_setting("gemini_api_key")
    app_state.gemini_api_key = ""
    return {"ok": True}


@app.put("/api/settings/model")
async def update_model(data: dict):
    model = data.get("model", "gemini-3.1-pro-preview")
    await db.set_setting("gemini_model", model)
    app_state.gemini_model = model
    return {"ok": True, "model": model}


# ── Orgs ──────────────────────────────────────────────────────────────

@app.get("/api/orgs")
async def list_orgs():
    return {"orgs": await db.get_orgs()}


@app.post("/api/orgs/sync")
async def sync_orgs():
    count = await _sync_orgs_from_cli()
    orgs = await db.get_orgs()
    return {"ok": True, "synced": count, "orgs": orgs}


@app.post("/api/orgs/connect")
async def connect_org(req: ConnectOrgRequest):
    try:
        instance = "https://test.salesforce.com" if req.sandbox else req.instance_url
        await salesforce.login_web(req.alias, instance)

        org_info = await salesforce.display_org(req.alias)
        username = org_info.get("username", "")
        inst_url = org_info.get("instanceUrl", "")

        await db.add_org(req.alias, username, inst_url)

        # Re-sync all orgs from CLI after a new connection
        await _sync_orgs_from_cli()

        return {"ok": True, "username": username, "instance_url": inst_url, "alias": req.alias}
    except Exception as exc:
        logger.exception("Org connection failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/orgs/{org_id}")
async def remove_org(org_id: int):
    await db.remove_org(org_id)
    return {"ok": True}


@app.get("/api/orgs/{org_alias}/check-limits-package")
async def check_limits_package(org_alias: str):
    """Live detection of the Salesforce Limit Monitor package in an org."""
    try:
        result = await salesforce.detect_limits_package(org_alias)
        return result
    except Exception as exc:
        logger.warning("Limits package check failed for %s: %s", org_alias, exc)
        return {
            "installed": False,
            "objects_exist": False,
            "classes_active": False,
            "jobs_running": False,
            "status": "check_failed",
            "error": str(exc),
        }


# ── Health Categories ─────────────────────────────────────────────────

@app.get("/api/categories")
async def list_categories():
    return {"categories": HEALTH_CATEGORIES}


# ── Parameter Checklist ──────────────────────────────────────────────

@app.get("/api/parameter-checklist")
async def parameter_checklist():
    """Full 294-parameter registry with metadata for the Settings page."""
    grouped: dict[str, Any] = {}
    for cat in HEALTH_CATEGORIES:
        key = cat["key"]
        params = PARAMS_BY_CATEGORY.get(key, [])
        grouped[key] = {
            "label": cat["label"],
            "weight": cat["weight"],
            "total_params": cat["params"],
            "parameters": params,
        }
    return {
        "total": len(PARAMETER_REGISTRY),
        "categories": grouped,
        "registry": PARAMETER_REGISTRY,
    }


# ── Scans ─────────────────────────────────────────────────────────────

@app.get("/api/scans/running")
async def running_scans():
    return {"scans": await db.get_running_scans()}


@app.get("/api/scans")
async def list_scans(org_alias: str | None = Query(default=None)):
    return {"scans": await db.get_scans(org_alias)}


@app.get("/api/scans/{scan_id}")
async def get_scan(scan_id: int):
    scan = await db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    findings = await db.get_findings(scan_id)
    scan["findings"] = findings
    return scan


@app.delete("/api/scans/{scan_id}")
async def delete_scan(scan_id: int):
    await db.delete_scan(scan_id)
    return {"ok": True}


# ── Findings ──────────────────────────────────────────────────────────

@app.get("/api/findings")
async def list_all_findings(org_alias: str | None = Query(default=None)):
    """Return all findings from completed scans (excludes running scans)."""
    findings = await db.get_all_findings(org_alias)
    return {"findings": findings}


@app.post("/api/findings/{finding_id}/resolve")
async def resolve_finding(finding_id: int):
    await db.resolve_finding(finding_id)
    return {"ok": True}


@app.post("/api/findings/{finding_id}/unresolve")
async def unresolve_finding(finding_id: int):
    await db.unresolve_finding(finding_id)
    return {"ok": True}


@app.post("/api/findings/{finding_id}/verify-resolution")
async def verify_finding_resolution(finding_id: int):
    """Re-scan affected components via SF CLI, then ask Gemini whether the fix is truly applied."""
    from app.services.llm import invoke_llm

    if not app_state.gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API key not configured. Go to Settings.")

    finding = await db.get_finding_by_id(finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    scan = await db.get_scan(finding["scan_id"])
    if not scan:
        raise HTTPException(status_code=404, detail="Associated scan not found")

    org_alias = scan["org_alias"]
    affected = finding.get("affected_components", [])

    component_states: list[dict] = []
    for comp_name in affected:
        state = await _retrieve_component_state(org_alias, comp_name)
        component_states.append({"name": comp_name, **state})

    system_prompt = (
        "You are a Salesforce org health verification expert. You must determine whether "
        "a reported finding has actually been resolved in the org by examining the current "
        "state of the affected components.\n\n"
        "You will be given:\n"
        "1. The original finding (title, severity, description, recommendation)\n"
        "2. The current state of affected components retrieved from the live Salesforce org\n\n"
        "Respond with ONLY valid JSON in this exact format:\n"
        '{"verified": true/false, "confidence": "high"/"medium"/"low", '
        '"summary": "2-3 sentence explanation of your verification result", '
        '"details": ["bullet point 1", "bullet point 2", ...]}\n\n'
        "RULES:\n"
        "- Set verified=true ONLY if the evidence strongly suggests the fix was applied\n"
        "- If components could not be retrieved, lean toward verified=false with low confidence\n"
        "- Be specific about what you checked and what the evidence shows\n"
        "- Keep the summary concise but informative"
    )

    user_prompt = (
        f"## Original Finding\n"
        f"**Title:** {finding['title']}\n"
        f"**Severity:** {finding['severity']}\n"
        f"**Category:** {finding.get('category', 'N/A')}\n"
        f"**Description:** {finding.get('description', 'N/A')}\n"
        f"**Recommendation:** {finding.get('recommendation', 'N/A')}\n\n"
        f"## Current Component States (Live from Org: {org_alias})\n"
    )
    for cs in component_states:
        user_prompt += f"\n### {cs['name']}\n"
        user_prompt += f"- Type: {cs.get('type', 'Unknown')}\n"
        user_prompt += f"- Found: {cs.get('found', False)}\n"
        if cs.get("metadata"):
            for k, v in cs["metadata"].items():
                user_prompt += f"- {k}: {v}\n"
        if cs.get("error"):
            user_prompt += f"- Error: {cs['error']}\n"

    try:
        raw = await invoke_llm(
            api_key=app_state.gemini_api_key,
            model=app_state.gemini_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
        )

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()

        result = json.loads(cleaned)
        verified = result.get("verified", False)

        if verified:
            await db.resolve_finding(finding_id)

        return {
            "verified": verified,
            "confidence": result.get("confidence", "medium"),
            "summary": result.get("summary", ""),
            "details": result.get("details", []),
            "components_checked": len(component_states),
            "resolved": verified,
        }
    except json.JSONDecodeError:
        logger.warning("Failed to parse verification LLM response: %s", raw[:500])
        return {
            "verified": False,
            "confidence": "low",
            "summary": "AI verification completed but produced an unparseable response. Manual review recommended.",
            "details": [raw[:500] if raw else "No response from AI"],
            "components_checked": len(component_states),
            "resolved": False,
        }
    except Exception as exc:
        logger.exception("Verification LLM call failed")
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}")


async def _retrieve_component_state(org_alias: str, component_name: str) -> dict:
    """Query the live Salesforce org for the current state of a single component."""
    lower = component_name.lower()
    try:
        if lower.endswith(".cls") or "class" in lower or "controller" in lower or "handler" in lower or "service" in lower or "helper" in lower:
            name = component_name.replace(".cls", "")
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT Name, Status, LengthWithoutComments, ApiVersion, LastModifiedDate "
                f"FROM ApexClass WHERE Name = '{name}' LIMIT 1",
            )
            if records:
                return {"type": "ApexClass", "found": True, "metadata": records[0]}
            return {"type": "ApexClass", "found": False}

        if lower.endswith(".trigger") or "trigger" in lower:
            name = component_name.replace(".trigger", "")
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT Name, Status, LengthWithoutComments, ApiVersion, LastModifiedDate "
                f"FROM ApexTrigger WHERE Name = '{name}' LIMIT 1",
            )
            if records:
                return {"type": "ApexTrigger", "found": True, "metadata": records[0]}
            return {"type": "ApexTrigger", "found": False}

        if "flow" in lower:
            name = component_name.split(".")[0] if "." in component_name else component_name
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT DeveloperName, ActiveVersionId, LatestVersionId, LastModifiedDate "
                f"FROM FlowDefinition WHERE DeveloperName = '{name}' LIMIT 1",
            )
            if records:
                return {"type": "Flow", "found": True, "metadata": records[0]}
            return {"type": "Flow", "found": False}

        if lower.endswith("__c"):
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT DeveloperName, Description, LastModifiedDate "
                f"FROM CustomObject WHERE DeveloperName = '{component_name.replace('__c', '')}' LIMIT 1",
            )
            if records:
                return {"type": "CustomObject", "found": True, "metadata": records[0]}
            return {"type": "CustomObject", "found": False}

        if "profile" in lower:
            records = await salesforce.run_soql(
                org_alias,
                f"SELECT Name, UserType, LastModifiedDate FROM Profile WHERE Name = '{component_name}' LIMIT 1",
            )
            if records:
                return {"type": "Profile", "found": True, "metadata": records[0]}
            return {"type": "Profile", "found": False}

        if "permission" in lower:
            records = await salesforce.run_soql(
                org_alias,
                f"SELECT Name, Label, IsCustom, LastModifiedDate FROM PermissionSet WHERE Name = '{component_name}' LIMIT 1",
            )
            if records:
                return {"type": "PermissionSet", "found": True, "metadata": records[0]}
            return {"type": "PermissionSet", "found": False}

        if lower.endswith(".page") or "visualforce" in lower:
            name = component_name.replace(".page", "")
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT Name, ApiVersion, LastModifiedDate FROM ApexPage WHERE Name = '{name}' LIMIT 1",
            )
            if records:
                return {"type": "ApexPage", "found": True, "metadata": records[0]}
            return {"type": "ApexPage", "found": False}

        if "validation" in lower:
            records = await salesforce.run_tooling_soql(
                org_alias,
                f"SELECT ValidationName, Active, LastModifiedDate FROM ValidationRule WHERE ValidationName = '{component_name}' LIMIT 1",
            )
            if records:
                return {"type": "ValidationRule", "found": True, "metadata": records[0]}
            return {"type": "ValidationRule", "found": False}

        records = await salesforce.run_tooling_soql(
            org_alias,
            f"SELECT Name, Status, LengthWithoutComments, ApiVersion, LastModifiedDate "
            f"FROM ApexClass WHERE Name = '{component_name}' LIMIT 1",
        )
        if records:
            return {"type": "ApexClass", "found": True, "metadata": records[0]}

        return {"type": "Unknown", "found": False, "metadata": {"note": "Component type could not be determined"}}

    except Exception as exc:
        logger.warning("Failed to retrieve component state for %s: %s", component_name, exc)
        return {"type": "Unknown", "found": False, "error": str(exc)}


# ── Scan Comparison ───────────────────────────────────────────────────

@app.post("/api/scans/compare-analysis")
async def compare_scans_analysis(data: dict):
    """Return an LLM-generated analysis comparing two scans."""
    from app.services.llm import invoke_llm

    scan_id = data.get("scan_id")
    prev_scan_id = data.get("prev_scan_id")
    if not scan_id or not prev_scan_id:
        raise HTTPException(status_code=400, detail="scan_id and prev_scan_id are required")
    if not app_state.gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API key not configured. Go to Settings.")

    scan = await db.get_scan(scan_id)
    prev_scan = await db.get_scan(prev_scan_id)
    if not scan or not prev_scan:
        raise HTTPException(status_code=404, detail="One or both scans not found")

    cur_cats = json.loads(scan.get("category_scores") or "{}")
    prev_cats = json.loads(prev_scan.get("category_scores") or "{}")
    cur_score = scan.get("health_score", 0)
    prev_score = prev_scan.get("health_score", 0)

    diff_lines = []
    all_keys = sorted(set(list(cur_cats.keys()) + list(prev_cats.keys())))
    for k in all_keys:
        c = cur_cats.get(k, 0)
        p = prev_cats.get(k, 0)
        delta = c - p
        if delta != 0:
            diff_lines.append(f"- {k}: {p} → {c} ({'+' if delta > 0 else ''}{delta})")
        else:
            diff_lines.append(f"- {k}: {c} (unchanged)")

    system_prompt = (
        "You are a Salesforce org health expert. Analyze the changes between two health scans "
        "and provide a concise, actionable analysis.\n\n"
        "FORMAT YOUR RESPONSE EXACTLY LIKE THIS:\n"
        "## Key Changes\n"
        "- Bullet point about a specific change\n"
        "- Another bullet point\n\n"
        "## What Improved\n"
        "- Specific improvement with category name and numbers\n\n"
        "## What Needs Attention\n"
        "- Specific area of concern\n\n"
        "## Recommended Actions\n"
        "- Actionable recommendation\n\n"
        "RULES:\n"
        "- Use ## for section headers\n"
        "- Use - for every bullet point\n"
        "- Use **bold** for emphasis on key terms\n"
        "- Every piece of content must be a bullet point under a header\n"
        "- Be specific about category names and score changes\n"
        "- Keep each bullet to 1-2 sentences max\n"
        "- 3-5 bullets per section"
    )
    user_prompt = (
        f"## Health Score Change\n"
        f"Previous scan: {prev_score}/100\n"
        f"Current scan: {cur_score}/100\n"
        f"Delta: {'+' if cur_score - prev_score > 0 else ''}{cur_score - prev_score}\n\n"
        f"## Category Score Changes\n"
        + "\n".join(diff_lines)
        + f"\n\n## Previous Scan Summary\n{prev_scan.get('summary', 'N/A')}"
        + f"\n\n## Current Scan Summary\n{scan.get('summary', 'N/A')}"
    )

    try:
        analysis = await invoke_llm(
            api_key=app_state.gemini_api_key,
            model=app_state.gemini_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
        )
        return {"analysis": analysis}
    except Exception as exc:
        logger.exception("Compare analysis LLM call failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


# ── Dashboard ─────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def dashboard(org_alias: str | None = Query(default=None)):
    stats = await db.get_dashboard_stats(org_alias)
    extended = await db.get_dashboard_extended(org_alias)
    recent = await db.get_scans(org_alias)
    has_gov_limits = await db.has_governor_limits_data(org_alias)
    return {
        "stats": stats,
        "extended": extended,
        "recent_scans": recent[:5],
        "has_governor_limits": has_gov_limits,
    }


# ── WebSocket Health Scan ─────────────────────────────────────────────

@app.websocket("/ws/scan")
async def scan_websocket(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            if data.get("action") == "run_scan":
                await _handle_scan(ws, data)
            elif data.get("action") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WebSocket error")
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


async def _handle_scan(ws: WebSocket, data: dict):
    from app.agent.graph import run_health_scan

    if not app_state.gemini_api_key:
        await ws.send_json({"type": "error", "message": "Gemini API key not configured. Go to Settings."})
        return

    org_alias = data.get("org_alias", "")
    if not org_alias:
        await ws.send_json({"type": "error", "message": "No org specified for scan."})
        return

    org = await db.get_org_by_alias(org_alias)
    if not org:
        await ws.send_json({"type": "error", "message": f"Org '{org_alias}' not found or inactive."})
        return

    if org_alias in app_state.running_scans:
        await ws.send_json({"type": "error", "message": f"A scan is already running for '{org_alias}'."})
        return

    org_username = org.get("username", "")
    has_limits_package = bool(data.get("has_limits_package", False))
    scan_id = await db.create_scan(org_alias, org_username)
    app_state.running_scans.add(org_alias)

    ws_alive = True

    async def _safe_ws_send(payload: dict):
        nonlocal ws_alive
        if not ws_alive:
            return
        try:
            await ws.send_json(payload)
        except (WebSocketDisconnect, RuntimeError):
            ws_alive = False
            logger.debug("WebSocket closed — suppressing further sends")

    async def progress_cb(message: str, step: int = 0, total: int = 4, percent: int = 0):
        await _safe_ws_send({
            "type": "progress", "step": step, "total_steps": total,
            "message": message, "percent": percent,
        })

    try:
        await _safe_ws_send({"type": "started", "scan_id": scan_id, "org_alias": org_alias})

        report = await run_health_scan(
            gemini_api_key=app_state.gemini_api_key,
            gemini_model=app_state.gemini_model,
            target_org=org_alias,
            progress_callback=progress_cb,
            has_limits_package=has_limits_package,
        )

        findings_list = report.get("findings", [])
        stats = report.get("statistics", {})
        category_scores = report.get("category_scores", {})
        governor_limits = report.get("governor_limits", [])
        code_analysis = report.get("code_analysis_results", {})
        parameter_coverage = report.get("parameter_coverage", {})
        governor_limits_trends = report.get("governor_limits_trends", {})
        parameter_results = report.get("parameter_results", {})

        await db.update_scan(
            scan_id,
            status="completed",
            health_score=report.get("health_score", 0),
            category_scores=json.dumps(category_scores),
            total_components=report.get("total_metadata_components", 0),
            total_findings=len(findings_list),
            critical_count=stats.get("critical", 0),
            high_count=stats.get("high", 0),
            medium_count=stats.get("medium", 0),
            low_count=stats.get("low", 0),
            info_count=stats.get("info", 0),
            summary=report.get("summary", ""),
            report_json=json.dumps(report),
            governor_limits_json=json.dumps(governor_limits) if governor_limits else None,
            code_analysis_json=json.dumps(code_analysis) if code_analysis else None,
            parameter_coverage_json=json.dumps(parameter_coverage) if parameter_coverage else None,
            governor_limits_trends_json=json.dumps(governor_limits_trends) if governor_limits_trends else None,
            parameter_results_json=json.dumps(parameter_results) if parameter_results else None,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

        for f in findings_list:
            await db.add_finding(
                scan_id=scan_id,
                severity=f.get("severity", "Info"),
                category=f.get("category", ""),
                title=f.get("title", ""),
                description=f.get("description", ""),
                affected_components=f.get("affected_components", []),
                recommendation=f.get("recommendation", ""),
                effort=f.get("effort", ""),
            )

        await _safe_ws_send({"type": "complete", "scan_id": scan_id})

    except Exception as exc:
        logger.exception("Health scan pipeline failed")
        await db.update_scan(scan_id, status="failed", completed_at=datetime.now(timezone.utc).isoformat())
        await _safe_ws_send({"type": "error", "message": f"Scan failed: {exc}"})
    finally:
        app_state.running_scans.discard(org_alias)


# ── SPA Catch-All (must be last) ─────────────────────────────────────

@app.get("/{full_path:path}")
async def spa_catch_all(full_path: str):
    """Serve React SPA for all non-API routes, falling back to legacy UI."""
    if _use_react:
        return FileResponse(str(REACT_DIR / "index.html"))
    return FileResponse(str(STATIC_DIR / "index.html"))
