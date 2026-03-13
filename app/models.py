from __future__ import annotations

from pydantic import BaseModel, Field


class SetApiKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1)
    model: str = Field(default="gemini-3.1-pro-preview")


class ConnectOrgRequest(BaseModel):
    alias: str = Field(default="org-health-agent-org")
    instance_url: str = Field(default="https://login.salesforce.com")
    sandbox: bool = False


class RunScanRequest(BaseModel):
    scan_type: str = Field(default="full")


class ScanProgress(BaseModel):
    step: int
    total_steps: int
    step_name: str
    message: str
    percent: int = 0


class FindingItem(BaseModel):
    severity: str
    category: str
    title: str
    description: str = ""
    affected_components: list[str] = []
    recommendation: str = ""
    effort: str = ""


class HealthReport(BaseModel):
    health_score: int = 0
    org_alias: str = ""
    org_username: str = ""
    generated_at: str = ""
    summary: str = ""
    total_metadata_components: int = 0
    findings: list[FindingItem] = []
    statistics: dict = {}
    category_scores: dict = {}
