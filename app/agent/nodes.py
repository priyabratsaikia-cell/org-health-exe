"""LangGraph agent node functions for org health analysis.

Each node performs one step of the health-check pipeline and updates
the shared AgentState.  Pipeline: metadata -> runtime -> code_analysis
-> ai_analysis -> generate_report (5 nodes).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.agent.state import AgentState
from app.config import (
    HEALTH_CATEGORIES,
    LIMITS_SNAPSHOT_QUERIES,
    NOT_ASSESSABLE_PARAMS,
    RUNTIME_SOQL_QUERIES,
    TOOLING_SOQL_QUERIES,
    TOTAL_CHECKLIST_PARAMS,
)
from app.services import salesforce
from app.services.code_analyzer import (
    analyze_apex_source,
    summarise_code_analysis,
)
from app.services.llm import invoke_llm
from app.services.scoring_engine import (
    score_parameters_deterministic,
    compute_category_scores,
    compute_health_score,
)

logger = logging.getLogger(__name__)

_progress_callback = None


def set_progress_callback(cb):
    global _progress_callback
    _progress_callback = cb


async def _emit(msg: str, step: int = 0, total: int = 5, percent: int = 0):
    if _progress_callback:
        await _progress_callback(msg, step, total, percent)


# ── Node 1: Collect Metadata ─────────────────────────────────────────

async def collect_metadata_node(state: AgentState) -> dict:
    await _emit("Retrieving org metadata inventory…", step=1, total=5, percent=5)

    target_org = state.get("target_org", "")
    if not target_org:
        return {"error": "No target org specified", "current_step": "error"}

    try:
        async def metadata_progress(msg, percent=0):
            await _emit(msg, step=1, total=5, percent=5 + int(percent * 0.15))

        metadata = await salesforce.retrieve_org_metadata(
            target_org, progress_callback=metadata_progress
        )
        summary = salesforce.summarise_metadata(metadata)
        total_components = sum(len(v) for v in metadata.values())

        await _emit(
            f"Retrieved {total_components} metadata components across {len(metadata)} types",
            step=1, total=5, percent=20,
        )

        return {
            "org_metadata": metadata,
            "org_metadata_summary": summary,
            "current_step": "metadata_done",
            "messages": state.get("messages", []) + [
                {"role": "system", "content": f"Retrieved {total_components} components from org"}
            ],
        }
    except Exception as exc:
        logger.exception("Failed to retrieve metadata")
        return {"error": f"Failed to retrieve org metadata: {exc}", "current_step": "error"}


# ── Node 2: Collect Runtime Data ─────────────────────────────────────

async def collect_runtime_node(state: AgentState) -> dict:
    await _emit("Collecting runtime health data…", step=2, total=5, percent=22)

    target_org = state.get("target_org", "")
    if not target_org:
        return {"error": "No target org specified", "current_step": "error"}

    try:
        async def runtime_progress(msg, percent=0):
            await _emit(msg, step=2, total=5, percent=22 + int(percent * 0.18))

        runtime_data = await salesforce.collect_runtime_data(
            target_org,
            RUNTIME_SOQL_QUERIES,
            tooling_queries=TOOLING_SOQL_QUERIES,
            progress_callback=runtime_progress,
        )

        if state.get("has_limits_package"):
            await _emit("Querying Salesforce Limit Monitor package data…", step=2, total=5, percent=38)
            try:
                limits_pkg_data = await salesforce.query_limits_package_data(target_org)
                if limits_pkg_data:
                    runtime_data["limits_package"] = limits_pkg_data
                    logger.info("Retrieved %d limit records from package", len(limits_pkg_data))
            except Exception as exc:
                logger.warning("Failed to query limits package data: %s", exc)

            await _emit("Querying limit trend snapshots…", step=2, total=5, percent=39)
            try:
                snapshots = await salesforce.collect_limit_snapshots(
                    target_org, LIMITS_SNAPSHOT_QUERIES
                )
                if any(v for v in snapshots.values()):
                    runtime_data["limits_snapshots"] = snapshots
            except Exception as exc:
                logger.warning("Failed to query limit snapshots: %s", exc)

        runtime_summary = salesforce.summarise_runtime_data(runtime_data)

        await _emit(
            "Runtime data collection complete",
            step=2, total=5, percent=42,
        )

        return {
            "runtime_data": runtime_data,
            "runtime_data_summary": runtime_summary,
            "current_step": "runtime_done",
            "messages": state.get("messages", []) + [
                {"role": "system", "content": "Runtime data collected successfully"}
            ],
        }
    except Exception as exc:
        logger.exception("Failed to collect runtime data")
        return {"error": f"Failed to collect runtime data: {exc}", "current_step": "error"}


# ── Node 3: Static Code Analysis ─────────────────────────────────────

async def analyze_code_node(state: AgentState) -> dict:
    await _emit("Analyzing Apex source code…", step=3, total=5, percent=44)

    target_org = state.get("target_org", "")
    if not target_org:
        return {"error": "No target org specified", "current_step": "error"}

    try:
        async def code_progress(msg):
            await _emit(msg, step=3, total=5, percent=48)

        analysis = await analyze_apex_source(
            target_org, progress_callback=code_progress, timeout=300
        )

        code_summary = summarise_code_analysis(analysis)
        files_scanned = analysis.get("files_scanned", 0)
        issues = analysis.get("summary", {}).get("issues_found", 0)

        await _emit(
            f"Code analysis complete — {files_scanned} files scanned, {issues} issues found",
            step=3, total=5, percent=52,
        )

        return {
            "code_analysis": analysis,
            "code_analysis_summary": code_summary,
            "current_step": "code_analysis_done",
            "messages": state.get("messages", []) + [
                {"role": "system",
                 "content": f"Code analysis: {files_scanned} files, {issues} issues"}
            ],
        }
    except Exception as exc:
        logger.exception("Code analysis failed")
        return {
            "code_analysis": {"summary": {"status": "error", "message": str(exc)}},
            "code_analysis_summary": f"Code analysis failed: {exc}",
            "current_step": "code_analysis_done",
        }


# ── Node 4: AI Health Analysis ───────────────────────────────────────

HEALTH_ANALYSIS_SYSTEM_PROMPT = """\
You are a senior Salesforce platform architect performing a comprehensive org \
health assessment across 11 categories and 294 parameters (per the PwC Salesforce \
Org Health Check Parameter Checklist v1.0).

You will receive:
1. Metadata inventory — what components exist in the org.
2. Runtime data — governor limits, SOQL results, Tooling API data.
3. Static code analysis — regex-based Apex anti-pattern findings.

Produce a health assessment in **valid JSON** with this exact schema:

{
  "health_score": <integer 0-100>,
  "summary": "<2-3 paragraph executive summary>",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low|Info",
      "category": "<one of the 11 categories below>",
      "title": "<concise title>",
      "description": "<detailed explanation>",
      "affected_components": ["Component1", "Component2"],
      "recommendation": "1. Step\\n2. Step\\n3. Step",
      "effort": "Quick Fix|Medium|Large",
      "confidence": "High|Medium|Low"
    }
  ],
  "statistics": {"critical": N, "high": N, "medium": N, "low": N, "info": N},
  "category_scores": {
    "Security & Access Controls": <0-100>,
    "Apex Code Quality": <0-100>,
    "Test Coverage & Quality": <0-100>,
    "Governor Limits & Platform Limits": <0-100>,
    "Automation Health": <0-100>,
    "Data Model & Data Quality": <0-100>,
    "Integration Health": <0-100>,
    "UI/UX & User Adoption": <0-100>,
    "Technical Debt & Org Hygiene": <0-100>,
    "Compliance & Audit Readiness": <0-100>,
    "Release Readiness & Change Mgmt": <0-100>
  },
  "parameter_assessment": {
    "total_params": 294,
    "assessed": <count>,
    "passed": <count>,
    "warned": <count>,
    "failed": <count>,
    "skipped": <count>,
    "not_assessable": <count>
  }
}

CATEGORY RULES (11 categories, weights sum to 100):

**1. Security & Access Controls (15%, 32 params)**
- SecurityHealthCheck score < 85 → High; risks with HIGH_RISK → Critical
- Password policies: min length, complexity, expiration, lockout, history
- Session timeout, IP binding, HTTPS required, clickjack protection
- Profiles with ModifyAllData/ViewAllData → High
- > 5 System Administrators → High; failed login rate > 10% → Medium
- Guest user permissions, API-enabled profiles, sharing model (OWD)
- Role hierarchy depth > 5 → Medium
- Named Credentials vs hardcoded URLs in Apex

**2. Apex Code Quality (12%, 25 params)**
- SOQL/DML/SOSL in loops → High (from code analysis)
- Hardcoded Record IDs → Medium
- Empty catch blocks → Medium; SOQL injection → Critical
- Missing sharing declaration → Medium
- One trigger per object violation → Medium
- API version < 58.0 → Medium/High (from tooling data)
- Cyclomatic complexity, method length, naming conventions
- Selector/Service layer pattern → AI inference (Low confidence)

**3. Test Coverage & Quality (10%, 17 params)**
- Org-wide coverage < 75% → Critical; < 85% → Medium
- Per-class coverage: flag 0% classes as High
- SeeAllData=true → Medium; missing asserts → Medium
- @testSetup absence → Low; test data factory → Low
- Test pass rate: recent failures → Medium
- Test-to-code line ratio assessment

**4. Governor Limits & Platform Limits (12%, 76 params)**
- API usage > 70% → Medium; > 90% → Critical
- Storage > 75% → Medium; > 90% → Critical
- All limit categories: Email, Streaming, Platform Events, Analytics, etc.
- 7-day trends: flag increasing consumption
- Anomaly detection: > 20% change in 24h → Medium

**5. Automation Health (10%, 21 params)**
- Active Workflow Rules → Medium (migrate to Flows)
- Process Builders still active → High (deprecated)
- Flow complexity: > 50 elements → Medium; DML in Flow loops → High
- Duplicate automation per object (trigger + flow + WFR) → High
- Failed batch jobs → Medium; stuck scheduled jobs → Medium
- Platform Event subscription health

**6. Data Model & Data Quality (10%, 22 params)**
- Custom fields per object > 400 → High; > 500 → Critical
- Unused custom fields, missing field descriptions → Low
- Record type proliferation, picklist sprawl → Low/Medium
- Record counts: objects > 2M records need indexing → Medium
- Formula field complexity, roll-up summary count per object
- Orphaned records, data skew → Medium

**7. Integration Health (8%, 23 params)**
- Connected Apps review, OAuth token validity
- Named Credentials inventory, External Credentials
- Integration user licenses (dedicated vs personal)
- Platform Event subscription health, CDC config
- Remote Site Settings review
- Certificate expiry (if detectable)

**8. UI/UX & User Adoption (7%, 20 params)**
- License utilization (used vs purchased) — Low utilization → Medium
- Inactive users (90+ days not logged in) → Medium
- Active login rate (7-day) assessment
- VF pages (migration candidates) → Low; Aura → LWC backlog → Medium
- Lightning page performance (FlexiPage component count)
- Mobile adoption rate; Chatter adoption

**9. Technical Debt & Org Hygiene (6%, 19 params)**
- Old API versions (3+ releases behind) → Medium/High
- Unused Apex classes/triggers → Low
- Stale validation rules (2+ years unchanged) → Low
- Installed packages: unmanaged sprawl → Medium
- Sandbox refresh dates > 6 months → Medium
- VF-to-LWC migration backlog

**10. Compliance & Audit Readiness (5%, 20 params)**
- Field history tracking on sensitive fields
- Data classification labels (SecurityClassification, ComplianceGroup)
- Setup audit trail review for unauthorized changes
- Consent management (Individual object)
- Encryption at rest/transit assessment
- Segregation of duties → AI inference

**11. Release Readiness & Change Mgmt (5%, 19 params)**
- Deployment success rate (from DeployRequest)
- Sandbox strategy (types provisioned, refresh cadence)
- Metadata dependency mapping coverage
- Feature flags (Custom Permissions as toggles)
- CI/CD and source control → AI inference (mark as Low confidence)

SCORING FORMULA:
- Each parameter: PASS=1.0, WARN=0.5, FAIL=0.0, SKIP=excluded from denominator
- category_score = (total_points / assessable_params_in_category) * 100
- health_score = weighted average: sum(category_score * weight/100) for all 11 categories

SEVERITY MAPPING:
- 90-100: HEALTHY (Green)
- 70-89:  NEEDS ATTENTION (Yellow)
- 50-69:  AT RISK (Orange)
- 0-49:   CRITICAL (Red)

SUBJECTIVE PARAMETERS (use AI inference, mark confidence):
- Negative test cases → review test method names/assertions (Medium confidence)
- Selector/Service layer pattern → class naming analysis (Low confidence)
- Duplicate automation per object → cross-reference metadata (High confidence)
- Data retention policy → look for archival flows (Low confidence)
- Segregation of duties → analyze conflicting permissions (Medium confidence)
- CI/CD maturity → infer from deployment frequency (Low confidence)

RULES:
- Be specific about affected components.
- Provide numbered remediation steps (at least 2-3).
- Score each of the 11 categories independently.
- The health_score MUST be a weighted average of category_scores using the weights above.
- Include a "confidence" field for subjective findings.
- Only output the JSON object, no markdown fences or extra text.
"""


def _fuzzy_match_category(llm_key: str, valid_labels: list[str]) -> str | None:
    """Try to match an LLM-returned category label to a valid one."""
    normalized = llm_key.strip().lower()
    for label in valid_labels:
        if label.lower() == normalized:
            return label
    for label in valid_labels:
        if normalized in label.lower() or label.lower() in normalized:
            return label
    return None


async def analyse_health_node(state: AgentState) -> dict:
    await _emit("Running deterministic parameter scoring…", step=4, total=5, percent=55)

    runtime_data = state.get("runtime_data", {})
    code_analysis = state.get("code_analysis", {})
    metadata = state.get("org_metadata", {})
    has_limits_pkg = state.get("has_limits_package", False)

    tooling_data = runtime_data.get("tooling", {})
    limits_data = runtime_data.get("limits_package")
    limits_snapshots = runtime_data.get("limits_snapshots")

    param_results = score_parameters_deterministic(
        runtime_data=runtime_data,
        tooling_data=tooling_data,
        code_analysis=code_analysis,
        metadata=metadata,
        limits_data=limits_data,
        limits_snapshots=limits_snapshots,
        has_limits_package=has_limits_pkg,
    )

    det_count = sum(1 for r in param_results if r["status"] not in ("PENDING", "SKIP"))
    pending_count = sum(1 for r in param_results if r["status"] == "PENDING")
    skip_count = sum(1 for r in param_results if r["status"] == "SKIP")

    await _emit(
        f"Deterministic scoring: {det_count} scored, {pending_count} pending AI, {skip_count} skipped",
        step=4, total=5, percent=60,
    )

    det_cat_scores = compute_category_scores(param_results)
    det_health_score = compute_health_score(det_cat_scores)

    api_key = state.get("gemini_api_key", "")
    model = state.get("gemini_model", "gemini-3.1-pro-preview")

    if not api_key:
        logger.warning("No Gemini API key — using deterministic scores only")
        return {
            "health_report": {
                "health_score": det_health_score,
                "summary": "Assessment based on deterministic scoring only (no AI key configured).",
                "findings": [],
                "statistics": {},
                "category_scores": det_cat_scores,
            },
            "parameter_results": param_results,
            "current_step": "analysis_done",
        }

    metadata_summary = state.get("org_metadata_summary", "")
    runtime_summary = state.get("runtime_data_summary", "")
    code_summary = state.get("code_analysis_summary", "")

    pending_summary = "\n".join(
        f"- {r['id']} {r['name']} ({r['category']})" for r in param_results if r["status"] == "PENDING"
    )

    scored_summary = "\n".join(
        f"- {r['id']} {r['name']}: {r['status']} — {r['reason']}"
        for r in param_results if r["status"] not in ("PENDING", "SKIP")
    )

    user_prompt = (
        f"## Org Metadata Inventory\n\n{metadata_summary}\n\n"
        f"## Runtime Operational Data\n\n{runtime_summary}\n\n"
        f"## Static Code Analysis\n\n{code_summary}\n\n"
        f"## Pre-Scored Parameters ({det_count} scored deterministically)\n\n{scored_summary}\n\n"
        f"## Parameters Requiring Your Assessment ({pending_count} pending)\n\n{pending_summary}"
    )

    max_chars = 900_000
    if len(user_prompt) > max_chars:
        user_prompt = user_prompt[:max_chars] + "\n\n[Content truncated for length]"

    try:
        await _emit("Waiting for Gemini analysis (this may take 1-2 minutes)…", step=4, total=5, percent=65)

        raw_response = await invoke_llm(
            api_key=api_key,
            model=model,
            system_prompt=HEALTH_ANALYSIS_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.15,
        )

        json_str = raw_response.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[-1]
        if json_str.endswith("```"):
            json_str = json_str.rsplit("```", 1)[0]
        json_str = json_str.strip()

        analysis = json.loads(json_str)

        # --- Fuzzy-match category labels from LLM ---
        valid_labels = [c["label"] for c in HEALTH_CATEGORIES]
        llm_cat_scores = analysis.get("category_scores", {})
        normalized_scores: dict[str, float] = {}
        for k, v in llm_cat_scores.items():
            matched = _fuzzy_match_category(k, valid_labels)
            if matched:
                normalized_scores[matched] = v
            else:
                logger.warning("LLM returned unrecognized category: '%s'", k)

        # --- Merge: use deterministic scores as baseline, LLM as supplement ---
        final_cat_scores: dict[str, float] = {}
        for cat in HEALTH_CATEGORIES:
            label = cat["label"]
            det_s = det_cat_scores.get(label, 0)
            llm_s = normalized_scores.get(label)
            if llm_s is not None and llm_s > 0:
                final_cat_scores[label] = round((det_s + llm_s) / 2, 1) if det_s > 0 else llm_s
            elif det_s > 0:
                final_cat_scores[label] = det_s
            else:
                final_cat_scores[label] = llm_s if llm_s is not None else 0

        # --- Sanity check: if all scores are 0, something went wrong ---
        if all(v == 0 for v in final_cat_scores.values()) and det_health_score > 0:
            logger.warning("All LLM category scores are 0 — falling back to deterministic scores")
            final_cat_scores = det_cat_scores

        final_health_score = compute_health_score(final_cat_scores)

        # Merge AI-inferred parameter assessments from LLM
        llm_param_assessments = analysis.get("pending_parameter_results", [])
        if llm_param_assessments:
            pending_by_id = {r["id"]: r for r in param_results if r["status"] == "PENDING"}
            for llm_r in llm_param_assessments:
                pid = llm_r.get("id", "")
                if pid in pending_by_id:
                    idx = next(i for i, r in enumerate(param_results) if r["id"] == pid)
                    param_results[idx].update({
                        "status": llm_r.get("status", "PENDING"),
                        "score": {"PASS": 1.0, "WARN": 0.5, "FAIL": 0.0}.get(
                            llm_r.get("status", ""), 0.0),
                        "reason": llm_r.get("reason", param_results[idx]["reason"]),
                        "data_value": llm_r.get("data_value", ""),
                        "source": "ai_inference",
                        "confidence": llm_r.get("confidence", "Medium"),
                    })

        analysis["category_scores"] = final_cat_scores
        analysis["health_score"] = final_health_score

        finding_count = len(analysis.get("findings", []))
        await _emit(
            f"Analysis complete — health score: {final_health_score}/100, {finding_count} findings",
            step=4, total=5, percent=85,
        )

        return {
            "health_report": analysis,
            "parameter_results": param_results,
            "current_step": "analysis_done",
            "messages": state.get("messages", []) + [
                {"role": "system", "content": f"Health analysis: score {final_health_score}, {finding_count} findings"}
            ],
        }
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse LLM response as JSON: %s — using deterministic scores", exc)
        return {
            "health_report": {
                "health_score": det_health_score,
                "summary": f"AI analysis returned invalid JSON. Using deterministic scoring.\n\nRaw excerpt: {raw_response[:2000]}",
                "findings": [],
                "statistics": {},
                "category_scores": det_cat_scores,
                "parse_error": True,
            },
            "parameter_results": param_results,
            "current_step": "analysis_done",
        }
    except Exception as exc:
        logger.exception("LLM analysis failed — using deterministic scores")
        return {
            "health_report": {
                "health_score": det_health_score,
                "summary": f"AI analysis failed: {exc}. Scores are from deterministic assessment only.",
                "findings": [],
                "statistics": {},
                "category_scores": det_cat_scores,
            },
            "parameter_results": param_results,
            "current_step": "analysis_done",
        }


# ── Node 5: Generate Report ──────────────────────────────────────────

async def generate_report_node(state: AgentState) -> dict:
    await _emit("Generating final health report…", step=5, total=5, percent=90)

    analysis = state.get("health_report", {})
    metadata = state.get("org_metadata", {})
    code_analysis = state.get("code_analysis", {})
    param_results = state.get("parameter_results", [])

    total_components = sum(len(v) for v in metadata.values())

    not_assessable_count = len(NOT_ASSESSABLE_PARAMS)

    # Compute coverage from actual per-parameter results
    det_count = sum(1 for r in param_results if r.get("source") not in ("ai_inference", "manual_review") and r["status"] not in ("PENDING", "SKIP"))
    ai_count = sum(1 for r in param_results if r.get("source") == "ai_inference" and r["status"] not in ("PENDING", "SKIP"))
    skip_count = sum(1 for r in param_results if r["status"] == "SKIP")
    pending_count = sum(1 for r in param_results if r["status"] == "PENDING")
    assessed_count = det_count + ai_count

    category_details: list[dict] = []
    cat_scores = analysis.get("category_scores", {})
    for cat in HEALTH_CATEGORIES:
        label = cat["label"]
        score = cat_scores.get(label, 0)
        cat_key = cat["key"]
        cat_params = [r for r in param_results if r["category"] == cat_key]
        cat_assessed = [r for r in cat_params if r["status"] not in ("SKIP", "PENDING")]
        cat_passed = sum(1 for r in cat_assessed if r["status"] == "PASS")
        cat_warned = sum(1 for r in cat_assessed if r["status"] == "WARN")
        cat_failed = sum(1 for r in cat_assessed if r["status"] == "FAIL")
        category_details.append({
            "key": cat_key,
            "label": label,
            "weight": cat["weight"],
            "params": cat["params"],
            "score": score,
            "assessed": len(cat_assessed),
            "passed": cat_passed,
            "warned": cat_warned,
            "failed": cat_failed,
            "skipped": sum(1 for r in cat_params if r["status"] == "SKIP"),
            "pending": sum(1 for r in cat_params if r["status"] == "PENDING"),
        })

    # Build parameter results payload
    param_results_payload = {
        "parameters": param_results,
        "scoring_method": "deterministic+ai" if ai_count > 0 else "deterministic",
        "deterministic_count": det_count,
        "ai_inferred_count": ai_count,
        "pending_count": pending_count,
        "not_assessable_count": skip_count,
    }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "org_alias": state.get("target_org", ""),
        "total_metadata_components": total_components,
        "metadata_types_scanned": list(metadata.keys()),
        "health_score": analysis.get("health_score", 0),
        "summary": analysis.get("summary", "Analysis completed."),
        "findings": analysis.get("findings", []),
        "statistics": analysis.get("statistics", {}),
        "category_scores": cat_scores,
        "category_details": category_details,
        "parameter_coverage": {
            "total": TOTAL_CHECKLIST_PARAMS,
            "assessed": assessed_count,
            "deterministic_count": det_count,
            "ai_inferred_count": ai_count,
            "not_assessable": skip_count,
            "pending": pending_count,
            "not_assessable_params": NOT_ASSESSABLE_PARAMS,
        },
        "parameter_results": param_results_payload,
        "code_analysis_results": {
            "status": code_analysis.get("summary", {}).get("status", "not_run"),
            "files_scanned": code_analysis.get("files_scanned", 0),
            "issues_found": code_analysis.get("summary", {}).get("issues_found", 0),
            "severity_counts": code_analysis.get("summary", {}).get("severity_counts", {}),
            "findings_by_pattern": code_analysis.get("findings_by_pattern", {}),
        },
    }

    runtime_data = state.get("runtime_data", {})
    limits_package_data = runtime_data.get("limits_package", [])
    if limits_package_data:
        report["governor_limits"] = limits_package_data

    limits_snapshots = runtime_data.get("limits_snapshots", {})
    if limits_snapshots and any(v for v in limits_snapshots.values()):
        report["governor_limits_trends"] = limits_snapshots

    if not report["statistics"] and report["findings"]:
        stats: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for finding in report["findings"]:
            sev = finding.get("severity", "info").lower()
            stats[sev] = stats.get(sev, 0) + 1
        report["statistics"] = stats

    await _emit("Report generation complete!", step=5, total=5, percent=100)

    return {
        "health_report": report,
        "current_step": "done",
        "messages": state.get("messages", []) + [
            {"role": "system", "content": "Org health report generated successfully"}
        ],
    }


# ── Error handler node ───────────────────────────────────────────────

async def error_node(state: AgentState) -> dict:
    error = state.get("error", "Unknown error occurred")
    await _emit(f"Error: {error}", step=0, total=5, percent=0)
    return {"current_step": "error"}
