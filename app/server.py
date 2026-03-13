"""FastAPI application – REST + WebSocket with SQLite persistence."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app import database as db
from app.config import HEALTH_CATEGORIES, app_state
from app.models import ConnectOrgRequest, SetApiKeyRequest
from app.services import salesforce

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parent / "static"


# ── Lifespan ──────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    await db.init_db()
    api_key = await db.get_setting("gemini_api_key")
    model = await db.get_setting("gemini_model")
    if api_key:
        app_state.gemini_api_key = api_key
    if model:
        app_state.gemini_model = model
    orgs = await db.get_orgs()
    if orgs:
        app_state.sf_target_org = orgs[0]["alias"]
        app_state.sf_username = orgs[0].get("username", "")
        app_state.sf_instance_url = orgs[0].get("instance_url", "")
        app_state.is_org_connected = True
    yield


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.url.path.startswith("/static/") or request.url.path == "/":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app = FastAPI(title="Salesforce Org Health Monitor", version="1.0.0", lifespan=lifespan)
app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


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


@app.post("/api/orgs/connect")
async def connect_org(req: ConnectOrgRequest):
    try:
        instance = "https://test.salesforce.com" if req.sandbox else req.instance_url
        await salesforce.login_web(req.alias, instance)

        org_info = await salesforce.display_org(req.alias)
        username = org_info.get("username", "")
        inst_url = org_info.get("instanceUrl", "")

        await db.add_org(req.alias, username, inst_url)
        app_state.sf_target_org = req.alias
        app_state.sf_username = username
        app_state.sf_instance_url = inst_url
        app_state.is_org_connected = True

        return {"ok": True, "username": username, "instance_url": inst_url, "alias": req.alias}
    except Exception as exc:
        logger.exception("Org connection failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/orgs/{org_id}")
async def remove_org(org_id: int):
    await db.remove_org(org_id)
    remaining = await db.get_orgs()
    if not remaining:
        app_state.is_org_connected = False
        app_state.sf_target_org = ""
    else:
        app_state.sf_target_org = remaining[0]["alias"]
    return {"ok": True}


# ── Health Categories ─────────────────────────────────────────────────

@app.get("/api/categories")
async def list_categories():
    return {"categories": HEALTH_CATEGORIES}


# ── Scans ─────────────────────────────────────────────────────────────

@app.get("/api/scans")
async def list_scans():
    return {"scans": await db.get_scans()}


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

@app.post("/api/findings/{finding_id}/resolve")
async def resolve_finding(finding_id: int):
    await db.resolve_finding(finding_id)
    return {"ok": True}


@app.post("/api/findings/{finding_id}/unresolve")
async def unresolve_finding(finding_id: int):
    await db.unresolve_finding(finding_id)
    return {"ok": True}


# ── Dashboard ─────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def dashboard():
    stats = await db.get_dashboard_stats()
    extended = await db.get_dashboard_extended()
    recent = await db.get_scans()
    return {"stats": stats, "extended": extended, "recent_scans": recent[:5]}


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
    if not app_state.is_org_connected:
        await ws.send_json({"type": "error", "message": "No Salesforce org connected. Go to Settings."})
        return
    if app_state.scan_running:
        await ws.send_json({"type": "error", "message": "A scan is already running."})
        return

    scan_id = await db.create_scan(app_state.sf_target_org, app_state.sf_username)
    app_state.scan_running = True

    async def progress_cb(message: str, step: int = 0, total: int = 4, percent: int = 0):
        await ws.send_json({
            "type": "progress", "step": step, "total_steps": total,
            "message": message, "percent": percent,
        })

    try:
        await ws.send_json({"type": "started", "scan_id": scan_id})

        report = await run_health_scan(
            gemini_api_key=app_state.gemini_api_key,
            gemini_model=app_state.gemini_model,
            target_org=app_state.sf_target_org,
            progress_callback=progress_cb,
        )

        findings_list = report.get("findings", [])
        stats = report.get("statistics", {})
        category_scores = report.get("category_scores", {})

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

        await ws.send_json({"type": "complete", "scan_id": scan_id})

    except Exception as exc:
        logger.exception("Health scan pipeline failed")
        await db.update_scan(scan_id, status="failed", completed_at=datetime.now(timezone.utc).isoformat())
        await ws.send_json({"type": "error", "message": f"Scan failed: {exc}"})
    finally:
        app_state.scan_running = False
