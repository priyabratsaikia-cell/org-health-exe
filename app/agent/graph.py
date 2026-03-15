"""LangGraph workflow definition for the org health monitoring agent."""

from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, StateGraph

from app.agent.state import AgentState
from app.agent.nodes import (
    collect_metadata_node,
    collect_runtime_node,
    analyze_code_node,
    analyse_health_node,
    generate_report_node,
    error_node,
)

logger = logging.getLogger(__name__)


def _route_after_metadata(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    return "collect_runtime"


def _route_after_runtime(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    return "analyze_code"


def _route_after_code(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    return "analyse_health"


def _route_after_analysis(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    return "generate_report"


def build_health_graph() -> StateGraph:
    """Construct and compile the LangGraph workflow (5 nodes)."""

    graph = StateGraph(AgentState)

    graph.add_node("collect_metadata", collect_metadata_node)
    graph.add_node("collect_runtime", collect_runtime_node)
    graph.add_node("analyze_code", analyze_code_node)
    graph.add_node("analyse_health", analyse_health_node)
    graph.add_node("generate_report", generate_report_node)
    graph.add_node("error", error_node)

    graph.set_entry_point("collect_metadata")

    graph.add_conditional_edges("collect_metadata", _route_after_metadata, {
        "collect_runtime": "collect_runtime",
        "error": "error",
    })
    graph.add_conditional_edges("collect_runtime", _route_after_runtime, {
        "analyze_code": "analyze_code",
        "error": "error",
    })
    graph.add_conditional_edges("analyze_code", _route_after_code, {
        "analyse_health": "analyse_health",
        "error": "error",
    })
    graph.add_conditional_edges("analyse_health", _route_after_analysis, {
        "generate_report": "generate_report",
        "error": "error",
    })
    graph.add_edge("generate_report", END)
    graph.add_edge("error", END)

    return graph.compile()


async def run_health_scan(
    gemini_api_key: str,
    gemini_model: str,
    target_org: str,
    progress_callback=None,
    has_limits_package: bool = False,
) -> dict[str, Any]:
    """Run the full health-check pipeline and return the final report."""

    from app.agent.nodes import set_progress_callback
    set_progress_callback(progress_callback)

    workflow = build_health_graph()

    initial_state: AgentState = {
        "gemini_api_key": gemini_api_key,
        "gemini_model": gemini_model,
        "target_org": target_org,
        "has_limits_package": has_limits_package,
        "org_metadata": {},
        "org_metadata_summary": "",
        "runtime_data": {},
        "runtime_data_summary": "",
        "code_analysis": {},
        "code_analysis_summary": "",
        "health_report": {},
        "error": None,
        "current_step": "starting",
        "messages": [],
    }

    final_state = await workflow.ainvoke(initial_state)

    set_progress_callback(None)

    if final_state.get("error"):
        raise RuntimeError(final_state["error"])

    return final_state.get("health_report", {})
