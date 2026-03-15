"""Deterministic scoring engine — scores parameters from actual collected data
before sending anything to the LLM.

Returns per-parameter results: PASS / WARN / FAIL / SKIP / PENDING.
PENDING parameters are those that require AI inference.
"""

from __future__ import annotations

import logging
from typing import Any

from app.parameter_registry import PARAMETER_REGISTRY, PARAMS_BY_CATEGORY

logger = logging.getLogger(__name__)


def _records(runtime: dict, key: str) -> list[dict]:
    """Safely extract records from a runtime SOQL/Tooling query result."""
    val = runtime.get(key)
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return val.get("records", [])
    return []


def _first_val(runtime: dict, key: str, field: str = "cnt") -> int | float | None:
    """Extract a single numeric value from a SOQL COUNT query."""
    recs = _records(runtime, key)
    if recs:
        v = recs[0].get(field)
        if v is not None:
            try:
                return float(v)
            except (ValueError, TypeError):
                return None
    return None


def _result(status: str, reason: str, data_value: str = "",
            source: str = "deterministic", confidence: str = "High") -> dict:
    score_map = {"PASS": 1.0, "WARN": 0.5, "FAIL": 0.0, "SKIP": 0.0, "PENDING": 0.0}
    return {
        "status": status,
        "score": score_map.get(status, 0.0),
        "reason": reason,
        "data_value": data_value,
        "source": source,
        "confidence": confidence,
    }


def score_parameters_deterministic(
    runtime_data: dict[str, Any],
    tooling_data: dict[str, Any],
    code_analysis: dict[str, Any],
    metadata: dict[str, Any],
    limits_data: list[dict] | None = None,
    limits_snapshots: dict[str, Any] | None = None,
    has_limits_package: bool = False,
) -> list[dict]:
    """Score all 294 parameters deterministically where possible.

    Returns a list of dicts, one per parameter:
        {id, name, category, status, score, reason, data_value, source, confidence}
    """
    code_findings = code_analysis.get("findings_by_pattern", {})
    code_files = code_analysis.get("files_scanned", 0)

    limits_by_key: dict[str, dict] = {}
    if limits_data:
        for lim in limits_data:
            k = lim.get("LimitKey__c", "")
            if k:
                limits_by_key[k] = lim

    results: list[dict] = []

    for param in PARAMETER_REGISTRY:
        pid = param["id"]
        sk = param["scoring_key"]
        cat = param["category"]
        src = param["data_source"]

        if not param["assessable"]:
            r = _result("SKIP", f"Not auto-assessable: {param['sf_cli_cmd']}")
            r.update({"id": pid, "name": param["name"], "category": cat,
                       "source": "manual_review", "confidence": "N/A"})
            results.append(r)
            continue

        if sk == "ai_inference":
            r = _result("PENDING", "Requires AI inference from collected data")
            r.update({"id": pid, "name": param["name"], "category": cat,
                       "source": "ai_inference", "confidence": "Medium"})
            results.append(r)
            continue

        r = _score_single(pid, sk, param, runtime_data, tooling_data,
                          code_findings, code_files, metadata,
                          limits_by_key, limits_snapshots, has_limits_package)
        r.update({"id": pid, "name": param["name"], "category": cat})
        results.append(r)

    return results


def _score_single(
    pid: str, sk: str, param: dict,
    runtime: dict, tooling: dict,
    code_findings: dict, code_files: int,
    metadata: dict,
    limits_by_key: dict, snapshots: dict | None,
    has_limits_pkg: bool,
) -> dict:
    """Score a single parameter by its scoring_key."""

    # --- Code analysis patterns ---
    code_pattern_keys = {
        "soql_in_loops", "dml_in_loops", "sosl_in_loops", "hardcoded_ids",
        "empty_catch_blocks", "soql_injection", "csrf_dml_constructor",
        "missing_sharing", "see_all_data", "missing_asserts",
        "describe_in_loops",
    }
    if sk in code_pattern_keys:
        count = code_findings.get(sk, 0)
        if code_files == 0:
            return _result("SKIP", "No Apex source retrieved for analysis",
                           source="code_analysis")
        if count == 0:
            return _result("PASS", f"No {sk.replace('_', ' ')} issues found",
                           f"0 in {code_files} files", source="code_analysis")
        if count <= 3:
            return _result("WARN", f"Found {count} {sk.replace('_', ' ')} occurrence(s)",
                           f"{count} in {code_files} files", source="code_analysis")
        return _result("FAIL", f"Found {count} {sk.replace('_', ' ')} occurrences",
                       f"{count} in {code_files} files", source="code_analysis")

    # Positive code patterns
    if sk in ("governor_limit_awareness", "platform_cache_usage", "test_setup_usage"):
        count = code_findings.get(sk, 0)
        if code_files == 0:
            return _result("SKIP", "No Apex source retrieved", source="code_analysis")
        if count > 0:
            return _result("PASS", f"Found {count} {sk.replace('_', ' ')} usage(s)",
                           str(count), source="code_analysis")
        return _result("WARN", f"No {sk.replace('_', ' ')} patterns detected",
                       "0", source="code_analysis")

    # --- Security Health Check Score ---
    if sk == "security_health_score":
        recs = _records(tooling, "security_health_score")
        if not recs:
            return _result("SKIP", "SecurityHealthCheck not queryable",
                           source="tooling_api")
        score = recs[0].get("Score")
        if score is None:
            return _result("SKIP", "No score returned", source="tooling_api")
        s = float(score)
        dv = f"{s:.0f}"
        if s >= 85:
            return _result("PASS", f"Security Health Check score is {dv}", dv,
                           source="tooling_api")
        if s >= 70:
            return _result("WARN", f"Security Health Check score is {dv} (target 85+)", dv,
                           source="tooling_api")
        return _result("FAIL", f"Security Health Check score is {dv} (below 70)", dv,
                       source="tooling_api")

    if sk == "security_health_risks":
        recs = _records(tooling, "security_health_risks")
        high_risks = [r for r in recs if r.get("RiskType") == "HIGH_RISK"]
        if not recs and not _records(tooling, "security_health_score"):
            return _result("SKIP", "SecurityHealthCheckRisks not queryable",
                           source="tooling_api")
        if not high_risks:
            return _result("PASS", "No HIGH_RISK security settings found", "0 high risks",
                           source="tooling_api")
        return _result("WARN" if len(high_risks) <= 5 else "FAIL",
                       f"{len(high_risks)} HIGH_RISK security settings found",
                       f"{len(high_risks)} high risks", source="tooling_api")

    # --- Admin users ---
    if sk == "admin_users":
        cnt = _first_val(runtime, "admin_users")
        if cnt is None:
            return _result("SKIP", "Admin user count not available", source="runtime_soql")
        n = int(cnt)
        if n <= 5:
            return _result("PASS", f"{n} System Administrators (<=5)", str(n),
                           source="runtime_soql")
        if n <= 10:
            return _result("WARN", f"{n} System Administrators (>5, <=10)", str(n),
                           source="runtime_soql")
        return _result("FAIL", f"{n} System Administrators (>10)", str(n),
                       source="runtime_soql")

    # --- Failed logins ---
    if sk == "failed_logins":
        failed = _first_val(runtime, "failed_logins_24h")
        total = _first_val(runtime, "total_logins_24h")
        if failed is None or total is None:
            return _result("SKIP", "Login history not available", source="runtime_soql")
        rate = (failed / total * 100) if total > 0 else 0
        dv = f"{rate:.1f}%"
        if rate < 10:
            return _result("PASS", f"Failed login rate {dv} (<10%)", dv,
                           source="runtime_soql")
        if rate < 20:
            return _result("WARN", f"Failed login rate {dv} (10-20%)", dv,
                           source="runtime_soql")
        return _result("FAIL", f"Failed login rate {dv} (>=20%)", dv,
                       source="runtime_soql")

    # --- Guest users ---
    if sk == "guest_users":
        cnt = _first_val(runtime, "guest_users")
        if cnt is None:
            return _result("SKIP", "Guest user query failed", source="runtime_soql")
        n = int(cnt)
        if n == 0:
            return _result("PASS", "No guest users configured", "0", source="runtime_soql")
        return _result("WARN", f"{n} guest user(s) found - review permissions",
                       str(n), source="runtime_soql")

    if sk == "api_enabled_profiles":
        cnt = _first_val(runtime, "api_enabled_profiles")
        if cnt is None:
            return _result("SKIP", "API-enabled profiles query failed", source="runtime_soql")
        n = int(cnt)
        if n <= 5:
            return _result("PASS", f"{n} API-enabled profiles (<=5)", str(n), source="runtime_soql")
        if n <= 10:
            return _result("WARN", f"{n} API-enabled profiles (>5)", str(n), source="runtime_soql")
        return _result("FAIL", f"{n} API-enabled profiles (>10)", str(n), source="runtime_soql")

    # --- Permission set groups ---
    if sk == "permission_set_groups":
        recs = _records(runtime, "permission_set_groups")
        if recs:
            return _result("PASS", f"{len(recs)} Permission Set Groups in use",
                           str(len(recs)), source="runtime_soql")
        return _result("WARN", "No Permission Set Groups found", "0", source="runtime_soql")

    # --- OWD / Sharing ---
    if sk == "org_defaults":
        recs = _records(runtime, "org_defaults")
        if not recs:
            return _result("SKIP", "Organization defaults not queryable", source="runtime_soql")
        org = recs[0]
        public_rw = sum(1 for v in org.values() if isinstance(v, str) and "ReadWrite" in v)
        if public_rw == 0:
            return _result("PASS", "No objects set to Public Read/Write", "0 ReadWrite",
                           source="runtime_soql")
        return _result("WARN", f"{public_rw} object(s) with Public Read/Write OWD",
                       f"{public_rw} ReadWrite", source="runtime_soql")

    # --- Role hierarchy ---
    if sk == "user_roles":
        recs = _records(runtime, "user_roles")
        if not recs:
            return _result("SKIP", "UserRole data not available", source="runtime_soql")
        by_id = {r.get("Id"): r for r in recs}
        max_depth = 0
        for r in recs:
            depth, cur = 0, r
            while cur and cur.get("ParentRoleId") and depth < 20:
                depth += 1
                cur = by_id.get(cur["ParentRoleId"])
            max_depth = max(max_depth, depth)
        dv = str(max_depth)
        if max_depth <= 5:
            return _result("PASS", f"Role hierarchy depth is {max_depth} (<=5)", dv, source="runtime_soql")
        if max_depth <= 7:
            return _result("WARN", f"Role hierarchy depth is {max_depth} (>5)", dv, source="runtime_soql")
        return _result("FAIL", f"Role hierarchy depth is {max_depth} (>7)", dv, source="runtime_soql")

    # --- Tooling API: triggers per object ---
    if sk == "triggers_per_object":
        recs = _records(tooling, "triggers_per_object")
        if not recs:
            return _result("PASS", "No objects with multiple triggers", "0", source="tooling_api")
        n = len(recs)
        return _result("FAIL", f"{n} object(s) have multiple triggers",
                       str(n), source="tooling_api")

    # --- Apex class API version ---
    if sk == "apex_class_api_version":
        recs = _records(tooling, "apex_class_details")
        if not recs:
            return _result("SKIP", "Apex class details not available", source="tooling_api")
        old = [r for r in recs if (r.get("ApiVersion") or 99) < 58]
        pct = len(old) / len(recs) * 100 if recs else 0
        dv = f"{len(old)}/{len(recs)} ({pct:.0f}%)"
        if len(old) == 0:
            return _result("PASS", "All Apex classes on API v58+", dv, source="tooling_api")
        if pct < 50:
            return _result("WARN", f"{len(old)} classes on old API (<v58)", dv, source="tooling_api")
        return _result("FAIL", f"{len(old)} classes on old API (<v58)", dv, source="tooling_api")

    if sk == "trigger_api_version":
        recs = _records(tooling, "apex_trigger_details")
        if not recs:
            return _result("SKIP", "Trigger details not available", source="tooling_api")
        old = [r for r in recs if (r.get("ApiVersion") or 99) < 58]
        dv = f"{len(old)}/{len(recs)}"
        if len(old) == 0:
            return _result("PASS", "All triggers on API v58+", dv, source="tooling_api")
        return _result("WARN", f"{len(old)} triggers on old API (<v58)", dv, source="tooling_api")

    # --- Test coverage ---
    if sk == "org_wide_coverage":
        recs = _records(tooling, "org_wide_coverage")
        if not recs:
            return _result("SKIP", "Org-wide coverage not queryable", source="tooling_api")
        pct = recs[0].get("PercentCovered")
        if pct is None:
            return _result("SKIP", "Coverage value not returned", source="tooling_api")
        p = float(pct)
        dv = f"{p:.1f}%"
        if p >= 85:
            return _result("PASS", f"Org-wide coverage is {dv} (>=85%)", dv, source="tooling_api")
        if p >= 75:
            return _result("WARN", f"Org-wide coverage is {dv} (75-85%)", dv, source="tooling_api")
        return _result("FAIL", f"Org-wide coverage is {dv} (<75%)", dv, source="tooling_api")

    if sk == "per_class_coverage":
        recs = _records(tooling, "per_class_coverage")
        if not recs:
            return _result("SKIP", "Per-class coverage not available", source="tooling_api")
        zero_cov = [r for r in recs
                    if (r.get("NumLinesCovered") or 0) == 0 and (r.get("NumLinesUncovered") or 0) > 0]
        pct_zero = len(zero_cov) / len(recs) * 100 if recs else 0
        dv = f"{len(zero_cov)}/{len(recs)} classes at 0%"
        if pct_zero == 0:
            return _result("PASS", "All classes have some test coverage", dv, source="tooling_api")
        if pct_zero < 10:
            return _result("WARN", f"{len(zero_cov)} classes with 0% coverage", dv, source="tooling_api")
        return _result("FAIL", f"{len(zero_cov)} classes with 0% coverage ({pct_zero:.0f}%)",
                       dv, source="tooling_api")

    if sk == "test_failures_30d":
        recs = _records(tooling, "test_failures_30d")
        n = len(recs)
        dv = str(n)
        if n == 0:
            return _result("PASS", "No test failures in last 30 days", dv, source="tooling_api")
        if n < 5:
            return _result("WARN", f"{n} test failure(s) in last 30 days", dv, source="tooling_api")
        return _result("FAIL", f"{n} test failures in last 30 days", dv, source="tooling_api")

    # --- Governor limits (from Limit Monitor package) ---
    if sk.startswith("limit_"):
        limit_key = sk[len("limit_"):]
        if not has_limits_pkg or not limits_by_key:
            return _result("SKIP", "Limit Monitor package not installed",
                           source="limits_package")
        lim = limits_by_key.get(limit_key)
        if not lim:
            return _result("SKIP", f"Limit '{limit_key}' not found in package data",
                           source="limits_package")
        pct = lim.get("LastPercentOfLimit__c", 0) or 0
        dv = f"{pct:.1f}%"
        if pct < 70:
            return _result("PASS", f"{limit_key} at {dv} (<70%)", dv, source="limits_package")
        if pct < 90:
            return _result("WARN", f"{limit_key} at {dv} (70-90%)", dv, source="limits_package")
        return _result("FAIL", f"{limit_key} at {dv} (>=90%)", dv, source="limits_package")

    if sk == "limits_package_installed":
        if has_limits_pkg:
            return _result("PASS", "Limit Monitor package is installed", "Yes",
                           source="limits_package")
        return _result("SKIP", "Limit Monitor package not installed", "No",
                       source="limits_package")

    if sk in ("limits_package_classes", "limits_package_jobs", "limits_package_errors",
              "limits_above_threshold"):
        if not has_limits_pkg:
            return _result("SKIP", "Limit Monitor package not installed",
                           source="limits_package")
        return _result("PENDING", "Requires detailed package analysis",
                       source="limits_package", confidence="Medium")

    # --- Trend snapshots ---
    if sk.startswith("trend_") or sk == "anomaly_snapshots_24h":
        if not snapshots:
            return _result("SKIP", "No limit snapshot data available",
                           source="limits_package")
        snap_recs = snapshots.get(sk, [])
        if not snap_recs:
            return _result("SKIP", f"No snapshot data for {sk}", source="limits_package")
        return _result("PENDING", f"Trend analysis of {len(snap_recs)} snapshots requires AI",
                       str(len(snap_recs)), source="limits_package", confidence="Medium")

    if sk == "live_limits_fallback":
        if has_limits_pkg:
            return _result("SKIP", "Limit Monitor package installed; using package data",
                           source="limits_api")
        org_limits = runtime.get("org_limits")
        if org_limits:
            return _result("PASS", "Live limits API available as fallback",
                           f"{len(org_limits)} limits", source="limits_api")
        return _result("WARN", "No live limits data available", source="limits_api")

    # --- Metadata counts ---
    if sk.startswith("metadata_"):
        meta_type_map = {
            "metadata_profile": "Profile",
            "metadata_permissionset": "PermissionSet",
            "metadata_sharingrules": "SharingRules",
            "metadata_workflowrule": "WorkflowRule",
            "metadata_customobject": "CustomObject",
            "metadata_custommetadata": "CustomMetadata",
            "metadata_auradefinitionbundle": "AuraDefinitionBundle",
            "metadata_lightningcomponentbundle": "LightningComponentBundle",
            "metadata_customapplication": "CustomApplication",
        }
        mt = meta_type_map.get(sk)
        if mt and mt in metadata:
            count = len(metadata[mt])
            return _result("PASS", f"{count} {mt} component(s) found",
                           str(count), source="metadata")
        if mt:
            return _result("SKIP", f"No {mt} metadata retrieved", source="metadata")

    if sk == "metadata_total":
        total = sum(len(v) for v in metadata.values())
        dv = str(total)
        if total < 5000:
            return _result("PASS", f"{total} total metadata components (<5000)", dv, source="metadata")
        if total < 10000:
            return _result("WARN", f"{total} metadata components (5000-10000)", dv, source="metadata")
        return _result("FAIL", f"{total} metadata components (>=10000)", dv, source="metadata")

    # --- Runtime SOQL results ---
    if sk == "connected_app_details":
        recs = _records(runtime, "connected_app_details")
        n = len(recs)
        return _result("PASS" if n > 0 else "WARN",
                       f"{n} Connected App(s) inventoried" if n else "No connected apps found",
                       str(n), source="runtime_soql")

    if sk == "setup_audit_trail":
        recs = _records(runtime, "setup_audit_trail")
        if not recs:
            return _result("SKIP", "Setup Audit Trail not available", source="runtime_soql")
        return _result("PASS", f"{len(recs)} recent audit trail entries",
                       str(len(recs)), source="runtime_soql")

    if sk == "record_type_per_object":
        recs = _records(runtime, "record_type_per_object")
        high = [r for r in recs if (r.get("rtCount") or 0) > 10]
        if not recs:
            return _result("SKIP", "Record type data not available", source="runtime_soql")
        if not high:
            return _result("PASS", "No objects with >10 record types", "0", source="runtime_soql")
        return _result("WARN", f"{len(high)} object(s) with >10 record types",
                       str(len(high)), source="runtime_soql")

    if sk == "record_counts":
        keys = ["record_counts_account", "record_counts_contact",
                "record_counts_opportunity", "record_counts_case", "record_counts_lead"]
        large = []
        for k in keys:
            cnt = _first_val(runtime, k)
            if cnt and cnt > 2_000_000:
                large.append(k.replace("record_counts_", ""))
        if not large:
            return _result("PASS", "No objects with >2M records", "0 LDV", source="runtime_soql")
        return _result("WARN", f"Large data volume: {', '.join(large)}",
                       f"{len(large)} LDV objects", source="runtime_soql")

    if sk in ("cron_triggers", "event_bus_subscribers", "push_topics", "remote_site_settings"):
        recs = _records(runtime, sk)
        if recs:
            return _result("PASS", f"{len(recs)} {sk.replace('_', ' ')} found",
                           str(len(recs)), source="runtime_soql")
        return _result("WARN", f"No {sk.replace('_', ' ')} found", "0", source="runtime_soql")

    if sk == "batch_job_failures_30d":
        recs = _records(runtime, "batch_job_failures_30d")
        n = len(recs)
        if n == 0:
            return _result("PASS", "No failed batch jobs in last 30 days", "0", source="runtime_soql")
        if n < 5:
            return _result("WARN", f"{n} failed batch job(s) in last 30 days", str(n), source="runtime_soql")
        return _result("FAIL", f"{n} failed batch jobs in last 30 days", str(n), source="runtime_soql")

    # --- Adoption metrics ---
    if sk == "active_users_7d":
        active = _first_val(runtime, "active_users_7d")
        total = _first_val(runtime, "active_user_count")
        if active is None or total is None:
            return _result("SKIP", "User activity data not available", source="runtime_soql")
        pct = (active / total * 100) if total > 0 else 0
        dv = f"{pct:.0f}%"
        if pct >= 80:
            return _result("PASS", f"{dv} of users active in last 7 days", dv, source="runtime_soql")
        if pct >= 60:
            return _result("WARN", f"{dv} of users active in last 7 days", dv, source="runtime_soql")
        return _result("FAIL", f"Only {dv} of users active in last 7 days", dv, source="runtime_soql")

    if sk == "license_utilization":
        recs = _records(runtime, "license_utilization")
        if not recs:
            return _result("SKIP", "License data not available", source="runtime_soql")
        total_lic = sum(r.get("TotalLicenses", 0) for r in recs)
        used_lic = sum(r.get("UsedLicenses", 0) for r in recs)
        pct = (used_lic / total_lic * 100) if total_lic > 0 else 0
        dv = f"{used_lic}/{total_lic} ({pct:.0f}%)"
        if pct >= 80:
            return _result("PASS", f"License utilization at {pct:.0f}%", dv, source="runtime_soql")
        if pct >= 50:
            return _result("WARN", f"License utilization at {pct:.0f}%", dv, source="runtime_soql")
        return _result("FAIL", f"Low license utilization at {pct:.0f}%", dv, source="runtime_soql")

    if sk == "inactive_users_90d":
        inactive = _first_val(runtime, "inactive_users_90d")
        total = _first_val(runtime, "active_user_count")
        if inactive is None or total is None:
            return _result("SKIP", "Inactive user data not available", source="runtime_soql")
        pct = (inactive / total * 100) if total > 0 else 0
        dv = f"{int(inactive)} ({pct:.0f}%)"
        if pct < 5:
            return _result("PASS", f"{pct:.0f}% inactive users", dv, source="runtime_soql")
        if pct < 15:
            return _result("WARN", f"{pct:.0f}% of users inactive 90+ days", dv, source="runtime_soql")
        return _result("FAIL", f"{pct:.0f}% of users inactive 90+ days", dv, source="runtime_soql")

    if sk == "mobile_logins_30d":
        cnt = _first_val(runtime, "mobile_logins_30d")
        total = _first_val(runtime, "active_user_count")
        if cnt is None:
            return _result("SKIP", "Mobile login data not available", source="runtime_soql")
        dv = str(int(cnt or 0))
        if (cnt or 0) > 0:
            return _result("PASS", f"{dv} mobile logins in last 30 days", dv, source="runtime_soql")
        return _result("WARN", "No mobile logins in last 30 days", "0", source="runtime_soql")

    # --- Tooling: other ---
    if sk == "flow_details":
        recs = _records(tooling, "flow_details")
        if not recs:
            return _result("SKIP", "Flow details not available", source="tooling_api")
        pb_count = sum(r.get("total", 0) for r in recs
                       if r.get("ProcessType") == "Workflow")
        if pid.startswith("5.2"):
            if pb_count == 0:
                return _result("PASS", "No active Process Builders", "0", source="tooling_api")
            return _result("FAIL" if pb_count >= 5 else "WARN",
                           f"{pb_count} active Process Builder(s) (deprecated)", str(pb_count),
                           source="tooling_api")
        total = sum(r.get("total", 0) for r in recs)
        return _result("PASS", f"{total} active Flows across {len(recs)} types",
                       str(total), source="tooling_api")

    if sk == "custom_field_counts":
        recs = _records(tooling, "custom_field_counts")
        if not recs:
            return _result("SKIP", "Custom field count data not available", source="tooling_api")
        over_400 = [r for r in recs if (r.get("fieldCount") or 0) > 400]
        if not over_400:
            return _result("PASS", "No objects exceeding 400 custom fields", "0", source="tooling_api")
        return _result("WARN", f"{len(over_400)} object(s) with >400 custom fields",
                       str(len(over_400)), source="tooling_api")

    if sk == "validation_rules_stale":
        recs = _records(tooling, "validation_rules_stale")
        n = len(recs)
        if n == 0:
            return _result("PASS", "No stale validation rules (2+ years)", "0", source="tooling_api")
        return _result("WARN" if n < 10 else "FAIL",
                       f"{n} validation rule(s) unchanged for 2+ years", str(n), source="tooling_api")

    if sk == "flexipage_components":
        recs = _records(tooling, "flexipage_components")
        return _result("PASS", f"{len(recs)} FlexiPages found",
                       str(len(recs)), source="tooling_api")

    if sk == "vf_pages_detail":
        recs = _records(tooling, "vf_pages_detail")
        n = len(recs)
        if n == 0:
            return _result("PASS", "No Visualforce pages found", "0", source="tooling_api")
        return _result("WARN" if n < 10 else "FAIL",
                       f"{n} Visualforce page(s) still active", str(n), source="tooling_api")

    if sk == "installed_packages":
        recs = _records(tooling, "installed_packages")
        n = len(recs)
        return _result("PASS" if n <= 10 else "WARN",
                       f"{n} installed package(s)", str(n), source="tooling_api")

    if sk == "sandbox_info":
        recs = _records(tooling, "sandbox_info")
        if not recs:
            return _result("SKIP", "Sandbox info not available", source="tooling_api")
        return _result("PASS", f"{len(recs)} sandbox(es) found",
                       str(len(recs)), source="tooling_api")

    if sk == "field_data_classification":
        recs = _records(tooling, "field_data_classification")
        n = len(recs)
        if n > 0:
            return _result("PASS", f"{n} fields with data classification labels",
                           str(n), source="tooling_api")
        return _result("WARN", "No fields with data classification labels", "0", source="tooling_api")

    if sk == "deploy_requests":
        recs = _records(tooling, "deploy_requests")
        if not recs:
            return _result("SKIP", "Deploy request data not available", source="tooling_api")
        succeeded = sum(1 for r in recs if r.get("Status") == "Succeeded")
        rate = (succeeded / len(recs) * 100) if recs else 0
        dv = f"{succeeded}/{len(recs)} ({rate:.0f}%)"
        if rate >= 90:
            return _result("PASS", f"Deployment success rate: {rate:.0f}%", dv, source="tooling_api")
        if rate >= 75:
            return _result("WARN", f"Deployment success rate: {rate:.0f}%", dv, source="tooling_api")
        return _result("FAIL", f"Deployment success rate: {rate:.0f}%", dv, source="tooling_api")

    if sk == "metadata_dependencies":
        recs = _records(tooling, "metadata_dependencies")
        if recs:
            return _result("PASS", f"{len(recs)} metadata dependencies mapped",
                           str(len(recs)), source="tooling_api")
        return _result("WARN", "No metadata dependencies queried", "0", source="tooling_api")

    if sk == "consent_tracking":
        cnt = _first_val(runtime, "consent_tracking")
        if cnt is None:
            return _result("SKIP", "Consent data not available", source="runtime_soql")
        if cnt > 0:
            return _result("PASS", f"{int(cnt)} Individual records for consent tracking",
                           str(int(cnt)), source="runtime_soql")
        return _result("WARN", "No Individual records for consent tracking", "0", source="runtime_soql")

    # --- Fallback: mark as PENDING for AI ---
    return _result("PENDING", f"No deterministic scorer for key '{sk}'",
                   source="deterministic", confidence="Low")


def compute_category_scores(param_results: list[dict]) -> dict[str, float]:
    """Compute category scores from per-parameter results.

    category_score = (sum of scores of assessable params) / (count of assessable) * 100
    SKIP and PENDING are excluded from the denominator.
    """
    from app.config import HEALTH_CATEGORIES

    cat_params: dict[str, list[dict]] = {}
    for r in param_results:
        cat_params.setdefault(r["category"], []).append(r)

    scores: dict[str, float] = {}
    for cat in HEALTH_CATEGORIES:
        key = cat["key"]
        label = cat["label"]
        params = cat_params.get(key, [])
        assessable = [p for p in params if p["status"] not in ("SKIP", "PENDING")]
        if not assessable:
            scores[label] = 0
            continue
        total_score = sum(p["score"] for p in assessable)
        scores[label] = round(total_score / len(assessable) * 100, 1)

    return scores


def compute_health_score(category_scores: dict[str, float]) -> int:
    """Weighted average of category scores."""
    from app.config import HEALTH_CATEGORIES

    total = 0.0
    for cat in HEALTH_CATEGORIES:
        label = cat["label"]
        weight = cat["weight"]
        score = category_scores.get(label, 0)
        total += score * weight / 100
    return round(total)
