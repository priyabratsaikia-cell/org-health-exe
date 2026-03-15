from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.parameter_registry import (
    PARAMETER_REGISTRY,
    PARAM_BY_ID,
    PARAMS_BY_CATEGORY,
    NOT_ASSESSABLE_IDS,
)

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
    "QuickAction",
    "CompactLayout",
]

# ── Health-check categories (11 — aligned with Parameters Checklist) ──

HEALTH_CATEGORIES: list[dict] = [
    {"key": "security",          "label": "Security & Access Controls",          "weight": 15, "params": 32},
    {"key": "code_quality",      "label": "Apex Code Quality",                   "weight": 12, "params": 25},
    {"key": "test_coverage",     "label": "Test Coverage & Quality",             "weight": 10, "params": 17},
    {"key": "governor_limits",   "label": "Governor Limits & Platform Limits",   "weight": 12, "params": 76},
    {"key": "automation",        "label": "Automation Health",                   "weight": 10, "params": 21},
    {"key": "data_model",        "label": "Data Model & Data Quality",           "weight": 10, "params": 22},
    {"key": "integration",       "label": "Integration Health",                  "weight":  8, "params": 23},
    {"key": "ui_adoption",       "label": "UI/UX & User Adoption",              "weight":  7, "params": 20},
    {"key": "technical_debt",    "label": "Technical Debt & Org Hygiene",        "weight":  6, "params": 19},
    {"key": "compliance",        "label": "Compliance & Audit Readiness",        "weight":  5, "params": 20},
    {"key": "release_readiness", "label": "Release Readiness & Change Mgmt",     "weight":  5, "params": 19},
]

TOTAL_CHECKLIST_PARAMS = len(PARAMETER_REGISTRY)  # 294

# ── SOQL queries used by the runtime-data collection node ─────────────

RUNTIME_SOQL_QUERIES: dict[str, str] = {
    # --- Original queries (Security, Code Quality) ---
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
    "modify_all_profiles": (
        "SELECT Id, Name FROM Profile WHERE PermissionsModifyAllData = true"
    ),
    "view_all_profiles": (
        "SELECT Id, Name FROM Profile WHERE PermissionsViewAllData = true"
    ),

    # --- Security & Access Controls additions ---
    "user_roles": (
        "SELECT Id, Name, ParentRoleId FROM UserRole"
    ),
    "permission_set_groups": (
        "SELECT Id, DeveloperName FROM PermissionSetGroup"
    ),
    "org_defaults": (
        "SELECT DefaultAccountAccess, DefaultContactAccess, "
        "DefaultOpportunityAccess, DefaultLeadAccess, DefaultCaseAccess "
        "FROM Organization"
    ),
    "guest_users": (
        "SELECT COUNT(Id) cnt FROM User WHERE UserType = 'Guest'"
    ),
    "api_enabled_profiles": (
        "SELECT COUNT(Id) cnt FROM Profile WHERE PermissionsApiEnabled = true"
    ),
    "login_anomalies_7d": (
        "SELECT UserId, SourceIp, Status, Application "
        "FROM LoginHistory WHERE LoginTime = LAST_N_DAYS:7 "
        "AND Status != 'Success' ORDER BY LoginTime DESC LIMIT 100"
    ),

    # --- UI/UX & User Adoption ---
    "license_utilization": (
        "SELECT Name, TotalLicenses, UsedLicenses "
        "FROM UserLicense WHERE TotalLicenses > 0"
    ),
    "inactive_users_90d": (
        "SELECT COUNT(Id) cnt FROM User "
        "WHERE IsActive = true AND LastLoginDate < LAST_N_DAYS:90"
    ),
    "active_users_7d": (
        "SELECT COUNT(Id) cnt FROM User "
        "WHERE IsActive = true AND LastLoginDate > LAST_N_DAYS:7"
    ),
    "mobile_logins_30d": (
        "SELECT COUNT(Id) cnt FROM LoginHistory "
        "WHERE Application LIKE '%mobile%' AND LoginTime = LAST_N_DAYS:30"
    ),

    # --- Data Model & Data Quality ---
    "record_type_per_object": (
        "SELECT SObjectType, COUNT(Id) rtCount "
        "FROM RecordType WHERE IsActive = true "
        "GROUP BY SObjectType ORDER BY COUNT(Id) DESC"
    ),
    "record_counts_account": "SELECT COUNT(Id) cnt FROM Account",
    "record_counts_contact": "SELECT COUNT(Id) cnt FROM Contact",
    "record_counts_opportunity": "SELECT COUNT(Id) cnt FROM Opportunity",
    "record_counts_case": "SELECT COUNT(Id) cnt FROM Case",
    "record_counts_lead": "SELECT COUNT(Id) cnt FROM Lead",

    # --- Integration Health ---
    "connected_app_details": (
        "SELECT Name, ContactEmail FROM ConnectedApplication"
    ),
    "event_bus_subscribers": (
        "SELECT Name, Type, Topic, Position FROM EventBusSubscriber"
    ),
    "push_topics": (
        "SELECT Name, Query, ApiVersion, IsActive FROM PushTopic"
    ),
    "remote_site_settings": (
        "SELECT SiteName, EndpointUrl, IsActive FROM RemoteProxy"
    ),

    # --- Automation Health ---
    "cron_triggers": (
        "SELECT CronJobDetail.Name, State, NextFireTime, PreviousFireTime "
        "FROM CronTrigger WHERE State = 'WAITING' ORDER BY NextFireTime"
    ),
    "batch_job_failures_30d": (
        "SELECT ApexClass.Name, Status, NumberOfErrors, CreatedDate "
        "FROM AsyncApexJob WHERE JobType = 'BatchApex' AND Status = 'Failed' "
        "AND CreatedDate = LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT 50"
    ),

    # --- Compliance & Audit Readiness ---
    "consent_tracking": (
        "SELECT COUNT(Id) cnt FROM Individual"
    ),
}

# ── Tooling API SOQL queries (require --use-tooling-api flag) ─────────

TOOLING_SOQL_QUERIES: dict[str, str] = {
    # --- Security & Access Controls ---
    "security_health_score": (
        "SELECT Score FROM SecurityHealthCheck"
    ),
    "security_health_risks": (
        "SELECT SettingName, SettingGroup, OrgValue, StandardValue, RiskType "
        "FROM SecurityHealthCheckRisks "
        "WHERE RiskType IN ('HIGH_RISK','MEDIUM_RISK')"
    ),

    # --- Apex Code Quality ---
    "apex_class_details": (
        "SELECT Id, Name, ApiVersion, LengthWithoutComments, Status "
        "FROM ApexClass WHERE Status = 'Active' ORDER BY ApiVersion ASC"
    ),
    "apex_trigger_details": (
        "SELECT Id, Name, ApiVersion, TableEnumOrId, Status "
        "FROM ApexTrigger WHERE Status = 'Active'"
    ),
    "triggers_per_object": (
        "SELECT TableEnumOrId, COUNT(Id) triggerCount "
        "FROM ApexTrigger WHERE Status = 'Active' "
        "GROUP BY TableEnumOrId HAVING COUNT(Id) > 1"
    ),

    # --- Test Coverage & Quality ---
    "org_wide_coverage": (
        "SELECT PercentCovered FROM ApexOrgWideCoverage"
    ),
    "per_class_coverage": (
        "SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered "
        "FROM ApexCodeCoverageAggregate ORDER BY NumLinesUncovered DESC"
    ),
    "test_failures_30d": (
        "SELECT ApexClass.Name, MethodName, Message "
        "FROM ApexTestResult WHERE Outcome = 'Fail' "
        "AND TestTimestamp = LAST_N_DAYS:30"
    ),

    # --- Automation Health ---
    "flow_details": (
        "SELECT ProcessType, COUNT(Id) total "
        "FROM Flow WHERE Status = 'Active' "
        "GROUP BY ProcessType"
    ),

    # --- Data Model & Data Quality ---
    "custom_field_counts": (
        "SELECT TableEnumOrId, COUNT(Id) fieldCount "
        "FROM CustomField GROUP BY TableEnumOrId "
        "ORDER BY COUNT(Id) DESC"
    ),
    "validation_rules_stale": (
        "SELECT EntityDefinition.QualifiedApiName, ValidationName, Active, LastModifiedDate "
        "FROM ValidationRule WHERE Active = true "
        "AND LastModifiedDate < LAST_N_DAYS:730 "
        "ORDER BY LastModifiedDate ASC"
    ),

    # --- UI/UX & User Adoption ---
    "flexipage_components": (
        "SELECT DeveloperName, Type FROM FlexiPage"
    ),
    "vf_pages_detail": (
        "SELECT Name, ApiVersion, LastModifiedDate "
        "FROM ApexPage ORDER BY ApiVersion ASC"
    ),

    # --- Technical Debt & Org Hygiene ---
    "installed_packages": (
        "SELECT SubscriberPackage.Name, SubscriberPackageVersion.Name, "
        "SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion "
        "FROM InstalledSubscriberPackage"
    ),
    "sandbox_info": (
        "SELECT SandboxName, LicenseType, Description, LastModifiedDate "
        "FROM SandboxInfo"
    ),

    # --- Compliance & Audit Readiness ---
    "field_data_classification": (
        "SELECT DeveloperName, SecurityClassification, ComplianceGroup "
        "FROM CustomField WHERE SecurityClassification != null"
    ),

    # --- Release Readiness & Change Management ---
    "deploy_requests": (
        "SELECT Status, StartDate, CompletedDate "
        "FROM DeployRequest WHERE CreatedDate = LAST_N_DAYS:180 "
        "ORDER BY StartDate DESC LIMIT 100"
    ),
    "metadata_dependencies": (
        "SELECT MetadataComponentName, MetadataComponentType, "
        "RefMetadataComponentName, RefMetadataComponentType "
        "FROM MetadataComponentDependency "
        "WHERE RefMetadataComponentType = 'ApexClass' LIMIT 200"
    ),
}

# ── Limit Monitor Package snapshot queries (trend analysis) ───────────

LIMITS_SNAPSHOT_QUERIES: dict[str, str] = {
    "trend_api_7d": (
        "SELECT Value__c, MaximumValue__c, PercentOfLimit__c, CreatedDate "
        "FROM LimitSnapshot__c "
        "WHERE Limit__r.LimitKey__c = 'DailyApiRequests' "
        "AND CreatedDate = LAST_N_DAYS:7 ORDER BY CreatedDate ASC"
    ),
    "trend_storage_7d": (
        "SELECT Value__c, MaximumValue__c, PercentOfLimit__c, CreatedDate "
        "FROM LimitSnapshot__c "
        "WHERE Limit__r.LimitKey__c = 'DataStorageMB' "
        "AND CreatedDate = LAST_N_DAYS:7 ORDER BY CreatedDate ASC"
    ),
    "trend_async_7d": (
        "SELECT Value__c, MaximumValue__c, PercentOfLimit__c, CreatedDate "
        "FROM LimitSnapshot__c "
        "WHERE Limit__r.LimitKey__c = 'DailyAsyncApexExecutions' "
        "AND CreatedDate = LAST_N_DAYS:7 ORDER BY CreatedDate ASC"
    ),
    "anomaly_snapshots_24h": (
        "SELECT Limit__r.LimitKey__c, PercentChangedSinceLastSnapshot__c "
        "FROM LimitSnapshot__c "
        "WHERE PercentChangedSinceLastSnapshot__c > 20 "
        "AND CreatedDate = LAST_N_DAYS:1"
    ),
}

# ── Parameters that cannot be assessed via API (derived from registry) ──

NOT_ASSESSABLE_PARAMS: list[dict[str, str]] = [
    {"id": p["id"], "name": p["name"], "reason": p["sf_cli_cmd"]}
    for p in PARAMETER_REGISTRY if not p["assessable"]
]

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
    "apex_test_coverage_target": 85,
    "custom_fields_per_object_warn": 400,
    "custom_fields_per_object_critical": 500,
    "inactive_user_days": 90,
    "stale_validation_rule_days": 730,
    "sandbox_refresh_warn_days": 180,
    "role_hierarchy_max_depth": 5,
    "flow_element_warn_count": 50,
    "security_health_score_target": 85,
}


# ── Mutable runtime state ────────────────────────────────────────────

@dataclass
class AppState:
    """Mutable application-level runtime state (not persisted)."""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    running_scans: set = field(default_factory=set)
    last_report: dict = field(default_factory=dict)


app_state = AppState()
