"""LangGraph agent node functions for org health analysis.

Each node performs one step of the health-check pipeline and updates
the shared AgentState.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.agent.state import AgentState
from app.config import HEALTH_CATEGORIES, RUNTIME_SOQL_QUERIES
from app.services import salesforce
from app.services.llm import invoke_llm

logger = logging.getLogger(__name__)

_progress_callback = None


def set_progress_callback(cb):
    global _progress_callback
    _progress_callback = cb


async def _emit(msg: str, step: int = 0, total: int = 4, percent: int = 0):
    if _progress_callback:
        await _progress_callback(msg, step, total, percent)


# ── Node 1: Collect Metadata ─────────────────────────────────────────

async def collect_metadata_node(state: AgentState) -> dict:
    await _emit("Retrieving org metadata inventory…", step=1, total=4, percent=5)

    target_org = state.get("target_org", "")
    if not target_org:
        return {"error": "No target org specified", "current_step": "error"}

    try:
        async def metadata_progress(msg, percent=0):
            await _emit(msg, step=1, total=4, percent=5 + int(percent * 0.20))

        metadata = await salesforce.retrieve_org_metadata(
            target_org, progress_callback=metadata_progress
        )
        summary = salesforce.summarise_metadata(metadata)
        total_components = sum(len(v) for v in metadata.values())

        await _emit(
            f"Retrieved {total_components} metadata components across {len(metadata)} types",
            step=1, total=4, percent=25,
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
    await _emit("Collecting runtime health data…", step=2, total=4, percent=30)

    target_org = state.get("target_org", "")
    if not target_org:
        return {"error": "No target org specified", "current_step": "error"}

    try:
        async def runtime_progress(msg, percent=0):
            await _emit(msg, step=2, total=4, percent=30 + int(percent * 0.20))

        runtime_data = await salesforce.collect_runtime_data(
            target_org, RUNTIME_SOQL_QUERIES, progress_callback=runtime_progress
        )
        runtime_summary = salesforce.summarise_runtime_data(runtime_data)

        await _emit(
            "Runtime data collection complete",
            step=2, total=4, percent=50,
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


# ── Node 3: AI Health Analysis ───────────────────────────────────────

HEALTH_ANALYSIS_SYSTEM_PROMPT = """\
You are a senior Salesforce platform architect and org health consultant. Your
job is to perform a comprehensive health assessment of a Salesforce org.

You will receive:
1. An inventory of the org's metadata — what exists and how it is configured.
2. Live runtime data — governor limits usage, failed jobs, login history,
   user distribution, setup audit trail, and other operational metrics.

Produce a thorough health assessment in **valid JSON** with this exact schema:

{
  "health_score": <integer 0-100>,
  "summary": "<2-3 paragraph executive summary of the org's overall health>",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low|Info",
      "category": "<one of: Limits & Usage, Security, Code Quality, Automation Health, Data Model, Technical Debt, Integration Health, Change Management>",
      "title": "<concise finding title>",
      "description": "<detailed explanation of the issue and its implications>",
      "affected_components": ["Component1", "Component2"],
      "recommendation": "1. First actionable step\\n2. Second actionable step\\n3. Third step (always use numbered list format)",
      "effort": "Quick Fix|Medium|Large"
    }
  ],
  "statistics": {
    "critical": <count>,
    "high": <count>,
    "medium": <count>,
    "low": <count>,
    "info": <count>
  },
  "category_scores": {
    "Limits & Usage": <0-100>,
    "Security": <0-100>,
    "Code Quality": <0-100>,
    "Automation Health": <0-100>,
    "Data Model": <0-100>,
    "Technical Debt": <0-100>,
    "Integration Health": <0-100>,
    "Change Management": <0-100>
  }
}

Health-check rules by category:

**Limits & Usage**
- Flag API request usage > 70% as Medium, > 90% as Critical
- Flag data/file storage usage > 75% as Medium, > 90% as Critical
- Check async apex execution limits

**Security**
- Profiles with Modify All Data or View All Data should be flagged as High
- More than 5 System Administrator users is a High finding
- Failed login rates > 10% of total logins is Medium
- Permission set sprawl (excessive permission sets) is Medium

**Code Quality**
- Apex classes using API versions older than v58.0 — flag as Medium/High
- Low test coverage (< 75%) is Critical
- Large number of triggers without handler pattern is Medium
- High ratio of classes to test classes indicates inadequate testing

**Automation Health**
- Workflow Rules still in use (should migrate to Flows) — Medium
- Process Builders still active (deprecated) — High
- Excessive number of Flows may indicate automation sprawl — Low/Medium

**Data Model**
- Custom objects with > 400 custom fields approaching limit — High
- Large number of custom objects may indicate design issues — Low

**Technical Debt**
- Aura components that could be migrated to LWC — Medium
- Visualforce pages (legacy technology) — Low/Medium
- Deprecated API version usage across the org

**Integration Health**
- Connected Apps count and configuration status
- Named Credentials and External Data Sources
- Platform Event channels

**Change Management**
- High-frequency config changes by few users may indicate risk
- Sensitive setup changes (security, permissions) should be highlighted

Scoring guidelines:
- 90-100: Excellent — minimal issues, well-maintained org
- 75-89: Good — some areas need attention
- 60-74: Fair — multiple issues requiring remediation
- 40-59: Poor — significant problems needing urgent attention
- 0-39: Critical — major risks, immediate action required

Rules:
- Be specific about which org components are affected.
- Provide actionable remediation steps with Salesforce-specific guidance.
- IMPORTANT: The "recommendation" field MUST be formatted as a numbered list using this exact format: "1. First step\n2. Second step\n3. Third step". Always provide at least 2-3 numbered steps per recommendation.
- Rate severity accurately based on real business impact.
- Score each category independently based on the evidence.
- The overall health_score should be a weighted average of category scores.
- Only output the JSON object, no markdown fences or extra text.
"""

async def analyse_health_node(state: AgentState) -> dict:
    await _emit("Analysing org health with Gemini AI…", step=3, total=4, percent=55)

    api_key = state.get("gemini_api_key", "")
    model = state.get("gemini_model", "gemini-3.1-pro-preview")

    if not api_key:
        return {"error": "Gemini API key not set", "current_step": "error"}

    metadata_summary = state.get("org_metadata_summary", "")
    runtime_summary = state.get("runtime_data_summary", "")

    if not metadata_summary and not runtime_summary:
        return {"error": "No data to analyse", "current_step": "error"}

    user_prompt = (
        f"## Org Metadata Inventory\n\n{metadata_summary}\n\n"
        f"## Runtime Operational Data\n\n{runtime_summary}"
    )

    max_chars = 900_000
    if len(user_prompt) > max_chars:
        user_prompt = user_prompt[:max_chars] + "\n\n[Content truncated for length]"

    try:
        await _emit("Waiting for Gemini analysis (this may take 1-2 minutes)…", step=3, total=4, percent=60)

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

        finding_count = len(analysis.get("findings", []))
        health_score = analysis.get("health_score", 0)

        await _emit(
            f"Analysis complete — health score: {health_score}/100, {finding_count} findings",
            step=3, total=4, percent=85,
        )

        return {
            "health_report": analysis,
            "current_step": "analysis_done",
            "messages": state.get("messages", []) + [
                {"role": "system", "content": f"Health analysis: score {health_score}, {finding_count} findings"}
            ],
        }
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse LLM response as JSON: %s", exc)
        return {
            "health_report": {
                "health_score": 0,
                "summary": raw_response[:5000],
                "findings": [],
                "statistics": {},
                "category_scores": {},
                "parse_error": True,
            },
            "current_step": "analysis_done",
        }
    except Exception as exc:
        logger.exception("LLM analysis failed")
        return {"error": f"Gemini analysis failed: {exc}", "current_step": "error"}


# ── Node 4: Generate Report ──────────────────────────────────────────

async def generate_report_node(state: AgentState) -> dict:
    await _emit("Generating final health report…", step=4, total=4, percent=90)

    analysis = state.get("health_report", {})
    metadata = state.get("org_metadata", {})

    total_components = sum(len(v) for v in metadata.values())

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "org_alias": state.get("target_org", ""),
        "total_metadata_components": total_components,
        "metadata_types_scanned": list(metadata.keys()),
        "health_score": analysis.get("health_score", 0),
        "summary": analysis.get("summary", "Analysis completed."),
        "findings": analysis.get("findings", []),
        "statistics": analysis.get("statistics", {}),
        "category_scores": analysis.get("category_scores", {}),
    }

    if not report["statistics"] and report["findings"]:
        stats: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for finding in report["findings"]:
            sev = finding.get("severity", "info").lower()
            stats[sev] = stats.get(sev, 0) + 1
        report["statistics"] = stats

    await _emit("Report generation complete!", step=4, total=4, percent=100)

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
    await _emit(f"Error: {error}", step=0, total=4, percent=0)
    return {"current_step": "error"}
