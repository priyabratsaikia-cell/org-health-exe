from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Metadata types to retrieve for the "what exists" layer ────────────

METADATA_TYPES_TO_RETRIEVE: list[str] = [
    "ApexClass",
    "ApexTrigger",
    "ApexPage",
    "ApexComponent",
    "CustomObject",
    "Flow",
    "FlowDefinition",
    "LightningComponentBundle",
    "AuraDefinitionBundle",
    "Profile",
    "PermissionSet",
    "CustomApplication",
    "CustomTab",
    "Layout",
    "ValidationRule",
    "WorkflowRule",
    "ConnectedApp",
    "CustomField",
    "CustomMetadata",
    "PlatformEventChannel",
    "ExternalDataSource",
    "NamedCredential",
    "ApexTestSuite",
    "CustomPermission",
    "SharingRules",
]

# ── Health-check categories ───────────────────────────────────────────

HEALTH_CATEGORIES: list[dict] = [
    {"key": "limits_usage", "label": "Limits & Usage", "weight": 15},
    {"key": "security", "label": "Security", "weight": 20},
    {"key": "code_quality", "label": "Code Quality", "weight": 15},
    {"key": "automation", "label": "Automation Health", "weight": 10},
    {"key": "data_model", "label": "Data Model", "weight": 10},
    {"key": "technical_debt", "label": "Technical Debt", "weight": 10},
    {"key": "integration", "label": "Integration Health", "weight": 10},
    {"key": "change_mgmt", "label": "Change Management", "weight": 10},
]

# ── SOQL queries used by the runtime-data collection node ─────────────

RUNTIME_SOQL_QUERIES: dict[str, str] = {
    "old_api_apex": (
        "SELECT COUNT(Id) cnt FROM ApexClass WHERE ApiVersion < 58.0"
    ),
    "total_apex": (
        "SELECT COUNT(Id) cnt FROM ApexClass"
    ),
    "user_profile_distribution": (
        "SELECT Profile.Name pname, COUNT(Id) cnt "
        "FROM User WHERE IsActive = true "
        "GROUP BY Profile.Name ORDER BY COUNT(Id) DESC"
    ),
    "admin_users": (
        "SELECT COUNT(Id) cnt FROM User "
        "WHERE IsActive = true AND Profile.Name = 'System Administrator'"
    ),
    "failed_logins_24h": (
        "SELECT COUNT(Id) cnt FROM LoginHistory "
        "WHERE Status != 'Success' AND LoginTime = LAST_N_DAYS:1"
    ),
    "total_logins_24h": (
        "SELECT COUNT(Id) cnt FROM LoginHistory "
        "WHERE LoginTime = LAST_N_DAYS:1"
    ),
    "failed_async_jobs_7d": (
        "SELECT Id, ApexClass.Name, MethodName, Status, ExtendedStatus, CreatedDate "
        "FROM AsyncApexJob WHERE Status = 'Failed' "
        "AND CreatedDate = LAST_N_DAYS:7 ORDER BY CreatedDate DESC LIMIT 50"
    ),
    "setup_audit_trail": (
        "SELECT CreatedDate, CreatedBy.Name, Action, Section, Display "
        "FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 200"
    ),
    "active_user_count": (
        "SELECT COUNT(Id) cnt FROM User WHERE IsActive = true"
    ),
    "custom_object_record_counts": (
        "SELECT COUNT(Id) cnt FROM Organization"
    ),
    "modify_all_profiles": (
        "SELECT Id, Name FROM Profile WHERE PermissionsModifyAllData = true"
    ),
    "view_all_profiles": (
        "SELECT Id, Name FROM Profile WHERE PermissionsViewAllData = true"
    ),
}

# ── Thresholds for automated scoring ─────────────────────────────────

THRESHOLDS = {
    "api_usage_warn_pct": 70,
    "api_usage_critical_pct": 90,
    "storage_warn_pct": 75,
    "storage_critical_pct": 90,
    "old_api_version_cutoff": 58.0,
    "max_admin_users": 5,
    "failed_login_warn_pct": 10,
    "apex_test_coverage_min": 75,
    "custom_fields_per_object_warn": 400,
    "custom_fields_per_object_critical": 500,
}


# ── Mutable runtime state ────────────────────────────────────────────

@dataclass
class AppState:
    """Mutable application-level runtime state (not persisted)."""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    sf_target_org: str = ""
    sf_instance_url: str = ""
    sf_username: str = ""
    is_org_connected: bool = False
    scan_running: bool = False
    last_report: dict = field(default_factory=dict)


app_state = AppState()
