"""Static Apex code analysis — regex-based pattern detection.

Retrieves Apex source via SF CLI and scans for common anti-patterns
defined in the Parameters Checklist (Apex Code Quality + Test Coverage).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Regex patterns for anti-pattern detection ─────────────────────────

PATTERNS: dict[str, dict[str, Any]] = {
    "soql_in_loops": {
        "label": "SOQL in Loops",
        "regex": re.compile(
            r"for\s*\([^)]*\)\s*\{[^}]*\[\s*SELECT\s",
            re.IGNORECASE | re.DOTALL,
        ),
        "severity": "High",
        "category": "Apex Code Quality",
        "description": "SOQL query inside a loop risks hitting the 100-query governor limit.",
    },
    "dml_in_loops": {
        "label": "DML in Loops",
        "regex": re.compile(
            r"for\s*\([^)]*\)\s*\{[^}]*(insert|update|delete|upsert|merge)\s",
            re.IGNORECASE | re.DOTALL,
        ),
        "severity": "High",
        "category": "Apex Code Quality",
        "description": "DML operations inside loops risk hitting the 150-DML governor limit.",
    },
    "hardcoded_ids": {
        "label": "Hardcoded Record IDs",
        "regex": re.compile(r"'[a-zA-Z0-9]{15}'|'[a-zA-Z0-9]{18}'"),
        "severity": "Medium",
        "category": "Apex Code Quality",
        "description": "Hardcoded Salesforce record IDs break across environments.",
    },
    "empty_catch_blocks": {
        "label": "Empty Catch Blocks",
        "regex": re.compile(r"catch\s*\([^)]*\)\s*\{\s*\}"),
        "severity": "Medium",
        "category": "Apex Code Quality",
        "description": "Empty catch blocks silently swallow errors, making debugging impossible.",
    },
    "soql_injection": {
        "label": "SOQL Injection Risk",
        "regex": re.compile(r"Database\.query\s*\([^)]*\+[^)]*\)"),
        "severity": "Critical",
        "category": "Apex Code Quality",
        "description": "Dynamic SOQL built with string concatenation is vulnerable to injection.",
    },
    "missing_sharing": {
        "label": "Missing Sharing Declaration",
        "regex": re.compile(
            r"(public|global)\s+class\s+\w+\s*\{",
        ),
        "negative_regex": re.compile(
            r"(with\s+sharing|without\s+sharing|inherited\s+sharing)\s+"
            r"(public|global)\s+class",
        ),
        "severity": "Medium",
        "category": "Apex Code Quality",
        "description": "Class missing explicit sharing declaration defaults to 'without sharing'.",
        "use_negative": True,
    },
    "see_all_data": {
        "label": "SeeAllData=true in Tests",
        "regex": re.compile(r"@isTest\s*\(\s*SeeAllData\s*=\s*true\s*\)", re.IGNORECASE),
        "severity": "Medium",
        "category": "Test Coverage & Quality",
        "description": "SeeAllData=true makes tests fragile and data-dependent.",
    },
    "missing_asserts": {
        "label": "Test Methods Without Assertions",
        "regex": re.compile(
            r"@isTest[\s\S]*?static\s+\w+\s+\w+\s*\([^)]*\)\s*\{",
        ),
        "check_func": "_check_missing_asserts",
        "severity": "Medium",
        "category": "Test Coverage & Quality",
        "description": "Test methods without assert statements provide false coverage.",
    },
    "system_debug_overuse": {
        "label": "Excessive System.debug Usage",
        "regex": re.compile(r"System\.debug\s*\("),
        "severity": "Low",
        "category": "Apex Code Quality",
        "description": "Excessive System.debug calls impact performance; use a proper logging framework.",
        "count_threshold": 5,
    },
    "describe_in_loops": {
        "label": "Schema.describe in Loops",
        "regex": re.compile(
            r"for\s*\([^)]*\)\s*\{[^}]*Schema\.(getGlobalDescribe|describeSObjects)",
            re.IGNORECASE | re.DOTALL,
        ),
        "severity": "Medium",
        "category": "Apex Code Quality",
        "description": "Describe calls in loops waste CPU time; cache the result.",
    },
    "governor_limit_awareness": {
        "label": "Governor Limit Proactive Checks",
        "regex": re.compile(r"Limits\.get\w+\s*\("),
        "severity": "Info",
        "category": "Apex Code Quality",
        "description": "Code proactively checks governor limits using the Limits class.",
        "is_positive": True,
    },
    "test_setup_usage": {
        "label": "@testSetup Method Usage",
        "regex": re.compile(r"@testSetup", re.IGNORECASE),
        "severity": "Info",
        "category": "Test Coverage & Quality",
        "description": "Test classes use @testSetup for efficient, reusable test data.",
        "is_positive": True,
    },
    "csrf_dml_constructor": {
        "label": "DML in Constructors (CSRF Risk)",
        "regex": re.compile(
            r"(public|global)\s+\w+\s*\([^)]*\)\s*\{[^}]*(insert|update|delete|upsert)\s",
            re.DOTALL,
        ),
        "severity": "High",
        "category": "Apex Code Quality",
        "description": "DML in constructors or init methods may be vulnerable to CSRF.",
    },
    "platform_cache_usage": {
        "label": "Platform Cache Usage",
        "regex": re.compile(r"Cache\.(Org|Session)"),
        "severity": "Info",
        "category": "Apex Code Quality",
        "description": "Code uses Platform Cache for performance optimization.",
        "is_positive": True,
    },
}


def _find_sf_cli() -> str:
    path = shutil.which("sf") or shutil.which("sfdx")
    if not path:
        raise EnvironmentError("SF CLI not found on PATH")
    return path


async def retrieve_apex_source(target_org: str, output_dir: str, timeout: int = 300) -> bool:
    """Retrieve all Apex classes and triggers to a temporary sfdx project."""
    sf = _find_sf_cli()
    try:
        proc = await asyncio.create_subprocess_exec(
            sf, "project", "retrieve", "start",
            "--metadata", "ApexClass", "ApexTrigger",
            "--target-org", target_org,
            "--output-dir", output_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode == 0
    except asyncio.TimeoutError:
        logger.warning("Apex source retrieval timed out after %ds", timeout)
        return False
    except Exception as exc:
        logger.warning("Apex source retrieval failed: %s", exc)
        return False


def _scan_file(filepath: Path, content: str) -> list[dict]:
    """Run all regex patterns against a single Apex file."""
    findings: list[dict] = []
    filename = filepath.name

    for pattern_key, pattern_def in PATTERNS.items():
        is_positive = pattern_def.get("is_positive", False)
        use_negative = pattern_def.get("use_negative", False)
        threshold = pattern_def.get("count_threshold")

        if use_negative:
            class_matches = list(pattern_def["regex"].finditer(content))
            neg_matches = set()
            for m in pattern_def["negative_regex"].finditer(content):
                neg_matches.add(m.start())
            violations = [
                m for m in class_matches
                if not any(abs(m.start() - ns) < 80 for ns in neg_matches)
            ]
            if violations:
                findings.append({
                    "pattern": pattern_key,
                    "label": pattern_def["label"],
                    "severity": pattern_def["severity"],
                    "category": pattern_def["category"],
                    "description": pattern_def["description"],
                    "file": filename,
                    "count": len(violations),
                })
            continue

        matches = list(pattern_def["regex"].finditer(content))

        if is_positive:
            if matches:
                findings.append({
                    "pattern": pattern_key,
                    "label": pattern_def["label"],
                    "severity": "Info",
                    "category": pattern_def["category"],
                    "description": pattern_def["description"],
                    "file": filename,
                    "count": len(matches),
                    "is_positive": True,
                })
            continue

        if threshold:
            if len(matches) >= threshold:
                findings.append({
                    "pattern": pattern_key,
                    "label": pattern_def["label"],
                    "severity": pattern_def["severity"],
                    "category": pattern_def["category"],
                    "description": pattern_def["description"],
                    "file": filename,
                    "count": len(matches),
                })
            continue

        if matches:
            findings.append({
                "pattern": pattern_key,
                "label": pattern_def["label"],
                "severity": pattern_def["severity"],
                "category": pattern_def["category"],
                "description": pattern_def["description"],
                "file": filename,
                "count": len(matches),
            })

    return findings


async def analyze_apex_source(
    target_org: str,
    progress_callback=None,
    timeout: int = 300,
) -> dict[str, Any]:
    """Full code analysis pipeline: retrieve source, scan, aggregate results."""
    result: dict[str, Any] = {
        "source_retrieved": False,
        "files_scanned": 0,
        "total_findings": 0,
        "findings_by_pattern": {},
        "findings_by_file": {},
        "findings": [],
        "summary": {},
    }

    tmpdir = tempfile.mkdtemp(prefix="sf_code_analysis_")
    try:
        if progress_callback:
            await progress_callback("Retrieving Apex source code…")

        ok = await retrieve_apex_source(target_org, tmpdir, timeout=timeout)
        if not ok:
            result["summary"]["status"] = "source_retrieval_failed"
            return result

        result["source_retrieved"] = True

        apex_files: list[Path] = []
        for root, _dirs, files in os.walk(tmpdir):
            for f in files:
                if f.endswith((".cls", ".trigger")):
                    apex_files.append(Path(root) / f)

        result["files_scanned"] = len(apex_files)

        if progress_callback:
            await progress_callback(f"Scanning {len(apex_files)} Apex files…")

        all_findings: list[dict] = []
        for fpath in apex_files:
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                file_findings = _scan_file(fpath, content)
                all_findings.extend(file_findings)
            except Exception as exc:
                logger.warning("Failed to scan %s: %s", fpath.name, exc)

        result["findings"] = all_findings
        result["total_findings"] = len(all_findings)

        by_pattern: dict[str, int] = {}
        by_file: dict[str, int] = {}
        for f in all_findings:
            by_pattern[f["pattern"]] = by_pattern.get(f["pattern"], 0) + 1
            by_file[f["file"]] = by_file.get(f["file"], 0) + 1

        result["findings_by_pattern"] = by_pattern
        result["findings_by_file"] = by_file

        severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
        for f in all_findings:
            if not f.get("is_positive"):
                sev = f.get("severity", "Info")
                severity_counts[sev] = severity_counts.get(sev, 0) + 1

        result["summary"] = {
            "status": "completed",
            "files_scanned": len(apex_files),
            "issues_found": sum(
                1 for f in all_findings if not f.get("is_positive")
            ),
            "positive_patterns": sum(
                1 for f in all_findings if f.get("is_positive")
            ),
            "severity_counts": severity_counts,
        }

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    return result


def summarise_code_analysis(analysis: dict[str, Any]) -> str:
    """Build a textual summary of code analysis results for the LLM."""
    lines: list[str] = ["# Static Code Analysis Results\n"]

    summary = analysis.get("summary", {})
    status = summary.get("status", "unknown")

    if status == "source_retrieval_failed":
        lines.append("Source code retrieval failed. Code quality parameters "
                      "assessed from metadata only (API versions, trigger counts).\n")
        return "\n".join(lines)

    lines.append(f"- Files scanned: {analysis.get('files_scanned', 0)}")
    lines.append(f"- Issues found: {summary.get('issues_found', 0)}")
    lines.append(f"- Positive patterns detected: {summary.get('positive_patterns', 0)}")
    lines.append("")

    sev = summary.get("severity_counts", {})
    if any(sev.values()):
        lines.append("## Issue Severity Breakdown")
        for level in ("Critical", "High", "Medium", "Low", "Info"):
            if sev.get(level, 0) > 0:
                lines.append(f"- {level}: {sev[level]}")
        lines.append("")

    by_pattern = analysis.get("findings_by_pattern", {})
    if by_pattern:
        lines.append("## Findings by Pattern")
        for pat, count in sorted(by_pattern.items(), key=lambda x: -x[1]):
            label = PATTERNS.get(pat, {}).get("label", pat)
            lines.append(f"- {label}: {count} occurrences")
        lines.append("")

    findings = analysis.get("findings", [])
    issue_findings = [f for f in findings if not f.get("is_positive")]
    if issue_findings:
        lines.append("## Detailed Issue Findings (top 30)")
        for f in issue_findings[:30]:
            lines.append(
                f"- [{f['severity']}] {f['label']} in {f['file']} "
                f"({f['count']} occurrence{'s' if f['count'] > 1 else ''})"
            )
        if len(issue_findings) > 30:
            lines.append(f"  … and {len(issue_findings) - 30} more issues")
        lines.append("")

    positive = [f for f in findings if f.get("is_positive")]
    if positive:
        lines.append("## Positive Patterns Detected")
        for f in positive[:15]:
            lines.append(f"- {f['label']} in {f['file']}")
        lines.append("")

    return "\n".join(lines)
