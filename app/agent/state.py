"""Agent state definition for the Org Health monitoring pipeline."""

from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    # Configuration inputs
    gemini_api_key: str
    gemini_model: str
    target_org: str

    # Metadata layer — "what exists"
    org_metadata: dict[str, list[dict]]
    org_metadata_summary: str

    # Runtime layer — "how it's behaving"
    runtime_data: dict[str, Any]
    runtime_data_summary: str

    # Analysis outputs
    health_report: dict[str, Any]

    # Control
    error: str | None
    current_step: str
    messages: list[dict[str, str]]
