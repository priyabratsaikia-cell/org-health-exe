# Org Health Agent — Complete Technical Deep Dive

> **Version:** 1.0.0  
> **Stack:** Python 3.11+ · FastAPI · LangGraph · Gemini LLM · Salesforce CLI · SQLite · Vanilla JS  
> **Port:** 8502

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Directory Structure — Every File Explained](#3-directory-structure--every-file-explained)
4. [Application Startup Flow](#4-application-startup-flow)
5. [The LangGraph Agent Pipeline — Heart of the System](#5-the-langgraph-agent-pipeline--heart-of-the-system)
6. [Node 1: Metadata Collection — "What Exists"](#6-node-1-metadata-collection--what-exists)
7. [Node 2: Runtime Data Collection — "How It's Behaving"](#7-node-2-runtime-data-collection--how-its-behaving)
8. [Node 3: AI Health Analysis — "What's Wrong and Why"](#8-node-3-ai-health-analysis--whats-wrong-and-why)
9. [Node 4: Report Generation — "The Final Deliverable"](#9-node-4-report-generation--the-final-deliverable)
10. [Error Handling Node](#10-error-handling-node)
11. [State Management — AgentState](#11-state-management--agentstate)
12. [Salesforce CLI Integration](#12-salesforce-cli-integration)
13. [Gemini LLM Integration](#13-gemini-llm-integration)
14. [FastAPI Server & REST API](#14-fastapi-server--rest-api)
15. [WebSocket Real-Time Communication](#15-websocket-real-time-communication)
16. [SQLite Database Layer](#16-sqlite-database-layer)
17. [Configuration & Thresholds](#17-configuration--thresholds)
18. [Pydantic Models](#18-pydantic-models)
19. [Frontend — Single Page Application](#19-frontend--single-page-application)
20. [PDF Report Export](#20-pdf-report-export)
21. [Complete Data Flow — Start to Finish](#21-complete-data-flow--start-to-finish)
22. [Sequence Diagram](#22-sequence-diagram)
23. [Dependencies](#23-dependencies)
24. [Key Design Decisions & Trade-offs](#24-key-design-decisions--trade-offs)

---

## 1. What This Project Does

The Org Health Agent is an **AI-powered Salesforce org health monitoring tool**. It connects to any Salesforce org via the Salesforce CLI, extracts two layers of intelligence — **metadata** (what exists in the org) and **runtime data** (how the org is behaving operationally) — then feeds both into **Google Gemini** to produce a comprehensive health assessment.

The output is a scored report (0–100) with categorized findings, severity ratings, actionable recommendations, effort estimates, and per-category scores visualized as charts.

Think of it as an automated Salesforce technical debt audit + operational health check, driven by AI.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (SPA)                            │
│   index.html + app.js + styles.css                              │
│   Chart.js (charts) · jsPDF (PDF export)                        │
│                                                                 │
│   Pages: Dashboard │ Scans & Reports │ New Scan │ Settings      │
└───────────────┬─────────────────────┬───────────────────────────┘
                │  REST API           │  WebSocket /ws/scan
                │  (CRUD, settings)   │  (real-time scan progress)
                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI SERVER (server.py)                    │
│   Port 8502 · Lifespan init · CORS · No-Cache Static           │
│                                                                 │
│   Endpoints:                                                    │
│   GET  /api/health          GET  /api/dashboard                 │
│   GET  /api/settings        POST /api/settings/apikey           │
│   GET  /api/orgs            POST /api/orgs/connect              │
│   GET  /api/scans           GET  /api/scans/{id}                │
│   POST /api/findings/{id}/resolve                               │
│   WS   /ws/scan                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               LANGGRAPH AGENT PIPELINE (graph.py)               │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  COLLECT      │───▶│  COLLECT      │───▶│  ANALYSE      │     │
│   │  METADATA     │    │  RUNTIME      │    │  HEALTH       │     │
│   │  (Node 1)     │    │  (Node 2)     │    │  (Node 3)     │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│          │ on error          │ on error          │ on error      │
│          ▼                   ▼                   ▼               │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  ERROR NODE   │    │  ERROR NODE   │    │  ERROR NODE   │     │
│   └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                 │
│                                          ┌──────────────┐       │
│                                     ───▶│  GENERATE     │       │
│                                          │  REPORT       │       │
│                                          │  (Node 4)     │       │
│                                          └──────┬───────┘       │
│                                                 │               │
│                                                 ▼ END           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌────────────────┐ ┌─────────────┐ ┌─────────────┐
│ SALESFORCE CLI │ │ GEMINI LLM  │ │ SQLITE DB   │
│ (sf commands)  │ │ (analysis)  │ │ (persist)   │
│                │ │             │ │             │
│ • list metadata│ │ • Health    │ │ • settings  │
│ • list limits  │ │   scoring   │ │ • orgs      │
│ • data query   │ │ • Findings  │ │ • scans     │
│ • org login    │ │   generation│ │ • findings  │
└────────────────┘ └─────────────┘ └─────────────┘
```

---

## 3. Directory Structure — Every File Explained

```
Org Health Agent/
├── main.py                         # Entry point — starts uvicorn server + opens browser
├── requirements.txt                # Python dependencies with version constraints
├── ORG_HEALTH_AGENT_DEEP_DIVE.md   # This documentation
│
├── data/                           # Auto-created at runtime
│   └── org_health_agent.db         # SQLite database (settings, orgs, scans, findings)
│
└── app/
    ├── __init__.py                 # Package marker (empty)
    ├── server.py                   # FastAPI app — REST endpoints, WebSocket handler, lifespan
    ├── config.py                   # All configuration: metadata types, SOQL queries, thresholds, health categories
    ├── models.py                   # Pydantic request/response models
    ├── database.py                 # SQLite persistence layer (aiosqlite) — all CRUD operations
    │
    ├── agent/
    │   ├── __init__.py             # Package marker (empty)
    │   ├── state.py                # AgentState TypedDict — the shared state flowing through all nodes
    │   ├── nodes.py                # The 4 pipeline nodes + error node — the actual business logic
    │   └── graph.py                # LangGraph StateGraph construction, compilation, and run_health_scan()
    │
    ├── services/
    │   ├── __init__.py             # Package marker (empty)
    │   ├── salesforce.py           # Salesforce CLI wrapper — metadata, limits, SOQL, org management
    │   └── llm.py                  # Gemini LLM wrapper — thin langchain-google-genai abstraction
    │
    └── static/
        ├── index.html              # Full SPA HTML — sidebar, pages, modals, pipeline visualizer
        ├── app.js                  # Frontend JavaScript — SPA routing, API calls, WebSocket, charts, PDF
        └── styles.css              # Complete CSS — PwC-branded dark/light design system
```

---

## 4. Application Startup Flow

### 4.1 Entry Point (`main.py`)

When you run `python main.py`, here is exactly what happens:

1. **Logging is configured** — format `HH:MM:SS  LEVEL     module  message`, level INFO
2. **A daemon thread is spawned** that waits 1.5 seconds, then calls `webbrowser.open("http://127.0.0.1:8502")` to auto-open the UI
3. **Uvicorn starts** the FastAPI app from `app.server:app` on `127.0.0.1:8502`

```python
# main.py — simplified
HOST = "127.0.0.1"
PORT = 8502

def main():
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("app.server:app", host=HOST, port=PORT, log_level="info", reload=False)
```

### 4.2 FastAPI Lifespan (`server.py`)

When uvicorn starts the app, the **lifespan** context manager runs before any request is served:

1. `db.init_db()` — creates the SQLite database file at `data/org_health_agent.db` if it doesn't exist, runs the schema DDL (creates `settings`, `orgs`, `scans`, `findings` tables)
2. Loads `gemini_api_key` and `gemini_model` from the `settings` table into the in-memory `app_state` singleton
3. Loads the first connected org from the `orgs` table into `app_state` (alias, username, instance_url, `is_org_connected = True`)
4. The FastAPI app is now ready to serve requests

```python
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
```

### 4.3 Middleware Stack

The app uses two middleware layers:

- **NoCacheStaticMiddleware** — adds `Cache-Control: no-cache, no-store, must-revalidate` headers to all static file and root (`/`) responses, so the browser always gets the latest frontend code during development
- **CORSMiddleware** — allows all origins, methods, and headers (wide-open CORS for local development)

### 4.4 Static Files

The `app/static/` directory is mounted at `/static/` via FastAPI's `StaticFiles`. The root route (`/`) serves `index.html` directly.

---

## 5. The LangGraph Agent Pipeline — Heart of the System

### 5.1 What is LangGraph?

LangGraph is a framework for building stateful, multi-step AI agent workflows as directed graphs. Each **node** is a function that reads from and writes to a shared **state** dictionary. **Edges** define the execution order, and **conditional edges** allow branching (e.g., to an error handler).

### 5.2 Graph Construction (`graph.py`)

The function `build_health_graph()` constructs and compiles the workflow:

```python
def build_health_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Register 5 nodes
    graph.add_node("collect_metadata", collect_metadata_node)
    graph.add_node("collect_runtime", collect_runtime_node)
    graph.add_node("analyse_health", analyse_health_node)
    graph.add_node("generate_report", generate_report_node)
    graph.add_node("error", error_node)

    # Entry point
    graph.set_entry_point("collect_metadata")

    # Conditional routing — after each node, check for errors
    graph.add_conditional_edges("collect_metadata", _route_after_metadata, {
        "collect_runtime": "collect_runtime",
        "error": "error",
    })
    graph.add_conditional_edges("collect_runtime", _route_after_runtime, {
        "analyse_health": "analyse_health",
        "error": "error",
    })
    graph.add_conditional_edges("analyse_health", _route_after_analysis, {
        "generate_report": "generate_report",
        "error": "error",
    })

    # Terminal edges
    graph.add_edge("generate_report", END)
    graph.add_edge("error", END)

    return graph.compile()
```

### 5.3 Routing Functions

Each routing function is dead simple — it checks if the state has an `error` key set:

```python
def _route_after_metadata(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    return "collect_runtime"
```

If any node sets `error` in its return dict, the pipeline immediately diverts to the error handler node and then terminates.

### 5.4 Pipeline Execution (`run_health_scan`)

This is the single async entry point that the server calls:

```python
async def run_health_scan(gemini_api_key, gemini_model, target_org, progress_callback) -> dict:
    set_progress_callback(progress_callback)    # allows nodes to send live progress to the WebSocket
    workflow = build_health_graph()

    initial_state: AgentState = {
        "gemini_api_key": gemini_api_key,
        "gemini_model": gemini_model,
        "target_org": target_org,
        "org_metadata": {},
        "org_metadata_summary": "",
        "runtime_data": {},
        "runtime_data_summary": "",
        "health_report": {},
        "error": None,
        "current_step": "starting",
        "messages": [],
    }

    final_state = await workflow.ainvoke(initial_state)    # runs the full graph asynchronously

    set_progress_callback(None)    # clean up

    if final_state.get("error"):
        raise RuntimeError(final_state["error"])

    return final_state.get("health_report", {})
```

Key points:

- `workflow.ainvoke()` is an **async** call — the entire pipeline runs non-blocking
- Each node receives the current state and returns a dict of updates to merge into it
- The final state contains the complete `health_report`
- If any error occurred, it raises a `RuntimeError` that the server catches

---

## 6. Node 1: Metadata Collection — "What Exists"

**Purpose:** Inventory every component in the Salesforce org — Apex classes, triggers, flows, custom objects, profiles, permission sets, connected apps, etc.

**File:** `nodes.py` → `collect_metadata_node()`

### 6.1 How It Works

1. Reads `target_org` from state (the Salesforce CLI alias)
2. Calls `salesforce.retrieve_org_metadata(target_org)` which iterates over 25 metadata types
3. For each type, runs the CLI command: `sf org list metadata --metadata-type <Type> --target-org <alias> --json`
4. Collects the results into a dict: `{"ApexClass": [{fullName: "MyClass", ...}, ...], "Flow": [...], ...}`
5. Calls `salesforce.summarise_metadata()` to create a **text summary** for the LLM — includes component counts and sample names (first 30 per type)
6. Returns the raw metadata dict, the text summary, and a count message

### 6.2 The 25 Metadata Types Retrieved


| Category          | Types                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| **Code**          | ApexClass, ApexTrigger, ApexPage, ApexComponent                         |
| **Data Model**    | CustomObject, CustomField, CustomMetadata                               |
| **Automation**    | Flow, FlowDefinition, WorkflowRule                                      |
| **UI Components** | LightningComponentBundle, AuraDefinitionBundle                          |
| **Security**      | Profile, PermissionSet, CustomPermission, SharingRules                  |
| **App Config**    | CustomApplication, CustomTab, Layout, ValidationRule                    |
| **Integration**   | ConnectedApp, NamedCredential, ExternalDataSource, PlatformEventChannel |
| **Testing**       | ApexTestSuite                                                           |


### 6.3 How Metadata Summarization Works

The `summarise_metadata()` function creates a Markdown-formatted text string for the LLM:

```
# Org Metadata Summary — 2,847 total components

## ApexClass (312 components)
MyController, AccountService, BatchProcessor, ... and 282 more

## Flow (45 components)
Account_Assignment_Flow, Lead_Routing, ...

## CustomObject (23 components)
...
```

This format gives the LLM both quantitative data (how many of each type) and qualitative data (actual component names to reference in findings).

### 6.4 Progress Updates

The node sends progress updates to the WebSocket via the callback:

- "Retrieving org metadata inventory…" (5%)
- "Retrieving ApexClass (1/25)…" through each type
- "Retrieved 2,847 metadata components across 18 types" (25%)

---

## 7. Node 2: Runtime Data Collection — "How It's Behaving"

**Purpose:** Gather live operational data — governor limits usage, login patterns, failed jobs, admin user counts, API version adoption, setup audit trail.

**File:** `nodes.py` → `collect_runtime_node()`

### 7.1 How It Works

1. Calls `salesforce.collect_runtime_data(target_org, RUNTIME_SOQL_QUERIES)` which does two things:
  - **Gets governor limits** via `sf org list limits --target-org <alias> --json`
  - **Runs 12 SOQL queries** via `sf data query --query "..." --target-org <alias> --json`
2. Calls `salesforce.summarise_runtime_data()` to create a text summary for the LLM
3. Returns the raw runtime data dict and its text summary

### 7.2 The 12 Runtime SOQL Queries


| Key                           | What It Queries                                               | Why It Matters                                                                    |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `old_api_apex`                | `SELECT COUNT(Id) cnt FROM ApexClass WHERE ApiVersion < 58.0` | Measures technical debt — old API versions miss security patches and new features |
| `total_apex`                  | `SELECT COUNT(Id) cnt FROM ApexClass`                         | Baseline for ratio calculations                                                   |
| `user_profile_distribution`   | Active users grouped by profile name                          | Identifies over-provisioned profiles                                              |
| `admin_users`                 | Count of active System Administrator users                    | Security risk — too many admins = too much power                                  |
| `failed_logins_24h`           | Failed login attempts in last 24 hours                        | Security indicator — possible brute force attempts                                |
| `total_logins_24h`            | Total login attempts in last 24 hours                         | Baseline for failed login percentage                                              |
| `failed_async_jobs_7d`        | Failed AsyncApexJob records in last 7 days (top 50)           | Operational health — broken batch jobs, queueable failures                        |
| `setup_audit_trail`           | Last 200 setup audit trail entries                            | Change management — who changed what recently                                     |
| `active_user_count`           | Count of active users                                         | Org scale metric                                                                  |
| `custom_object_record_counts` | Count from Organization (org metadata)                        | Org metadata verification                                                         |
| `modify_all_profiles`         | Profiles with PermissionsModifyAllData = true                 | Security — the most dangerous permission                                          |
| `view_all_profiles`           | Profiles with PermissionsViewAllData = true                   | Security — broad data access                                                      |


### 7.3 Governor Limits Collection

The `get_org_limits()` function runs `sf org list limits` and returns a dict like:

```python
{
    "DailyApiRequests": {"max": 100000, "remaining": 87234},
    "DataStorageMB": {"max": 5120, "remaining": 3200},
    "FileStorageMB": {"max": 5120, "remaining": 4800},
    "DailyAsyncApexExecutions": {"max": 250000, "remaining": 249800},
    ...
}
```

### 7.4 How Runtime Summarization Works

The `summarise_runtime_data()` function creates a Markdown summary:

```
# Org Runtime Data

## Governor Limits
- DailyApiRequests: 12,766/100,000 used (13%)
- DataStorageMB: 1,920/5,120 used (38%)
- FileStorageMB: 320/5,120 used (6%)
- DailyAsyncApexExecutions: 200/250,000 used (0%)
...

## admin_users
- {"cnt": 8}

## failed_logins_24h
- {"cnt": 23}

## modify_all_profiles
- {"Id": "00eXX000000...", "Name": "System Administrator"}
- {"Id": "00eXX000000...", "Name": "Custom Admin"}
```

It specifically highlights 12 **critical limits** (DailyApiRequests, DataStorageMB, FileStorageMB, etc.) with calculated usage percentages, then includes all SOQL query results.

---

## 8. Node 3: AI Health Analysis — "What's Wrong and Why"

**Purpose:** Feed the metadata summary and runtime summary into Gemini to produce a structured health assessment with scored findings.

**File:** `nodes.py` → `analyse_health_node()`

### 8.1 The System Prompt

This is the most critical piece of the entire system — a ~200-line system prompt that turns Gemini into a senior Salesforce platform architect. Here is the complete instruction set:

**Role:** "You are a senior Salesforce platform architect and org health consultant."

**Input description:** Metadata inventory + live runtime data

**Required output:** Valid JSON with this exact schema:

```json
{
  "health_score": 72,
  "summary": "2-3 paragraph executive summary...",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low|Info",
      "category": "one of the 8 categories",
      "title": "concise finding title",
      "description": "detailed explanation and implications",
      "affected_components": ["Component1", "Component2"],
      "recommendation": "specific, actionable steps",
      "effort": "Quick Fix|Medium|Large"
    }
  ],
  "statistics": {
    "critical": 2, "high": 5, "medium": 8, "low": 3, "info": 1
  },
  "category_scores": {
    "Limits & Usage": 85,
    "Security": 45,
    "Code Quality": 62,
    ...
  }
}
```

### 8.2 Health-Check Rules Embedded in the Prompt

The system prompt contains explicit rules for each of the 8 categories:

**Limits & Usage:**

- API request usage > 70% → Medium, > 90% → Critical
- Data/file storage > 75% → Medium, > 90% → Critical
- Check async apex execution limits

**Security:**

- Profiles with Modify All Data or View All Data → High
- More than 5 System Administrator users → High
- Failed login rate > 10% of total → Medium
- Permission set sprawl → Medium

**Code Quality:**

- Apex classes on API versions < v58.0 → Medium/High
- Low test coverage (< 75%) → Critical
- Large number of triggers without handler pattern → Medium
- High ratio of classes to test classes → inadequate testing

**Automation Health:**

- Workflow Rules still in use (should be Flows) → Medium
- Process Builders still active (deprecated) → High
- Excessive Flows → automation sprawl → Low/Medium

**Data Model:**

- Custom objects with > 400 custom fields → High (approaching 500 limit)
- Large number of custom objects → Low

**Technical Debt:**

- Aura components (should migrate to LWC) → Medium
- Visualforce pages (legacy) → Low/Medium
- Deprecated API version usage across org

**Integration Health:**

- Connected Apps count and configuration
- Named Credentials and External Data Sources
- Platform Event channels

**Change Management:**

- High-frequency config changes by few users → risk indicator
- Sensitive setup changes (security, permissions) → highlighted

### 8.3 Scoring Guidelines in the Prompt


| Score Range | Rating    | Meaning                                       |
| ----------- | --------- | --------------------------------------------- |
| 90–100      | Excellent | Minimal issues, well-maintained org           |
| 75–89       | Good      | Some areas need attention                     |
| 60–74       | Fair      | Multiple issues requiring remediation         |
| 40–59       | Poor      | Significant problems needing urgent attention |
| 0–39        | Critical  | Major risks, immediate action required        |


### 8.4 How the LLM Call Works

```python
raw_response = await invoke_llm(
    api_key=api_key,
    model=model,                                    # default: gemini-3.1-pro-preview
    system_prompt=HEALTH_ANALYSIS_SYSTEM_PROMPT,     # the full 200-line prompt
    user_prompt=user_prompt,                         # metadata_summary + runtime_summary
    temperature=0.15,                                # low temperature for consistent, factual output
)
```

- **Temperature 0.15** — very low creativity, high consistency
- **Max output tokens: 65,536** — allows for very detailed reports
- The user prompt is capped at **900,000 characters** to avoid token limits

### 8.5 JSON Parsing & Error Recovery

After receiving the LLM response:

1. Strip leading/trailing whitespace
2. Remove markdown code fences if present (`json ...` )
3. Parse as JSON via `json.loads()`
4. If JSON parsing fails → create a **partial report** with `parse_error: True`, the raw response truncated to 5,000 chars, and empty findings/statistics
5. If the entire LLM call fails → route to error node

---

## 9. Node 4: Report Generation — "The Final Deliverable"

**Purpose:** Assemble the final report structure by merging AI analysis with metadata counts.

**File:** `nodes.py` → `generate_report_node()`

### 9.1 What It Produces

```python
report = {
    "generated_at": "2026-03-13T10:30:00+00:00",           # UTC ISO timestamp
    "org_alias": "my-prod-org",                              # the SF CLI alias
    "total_metadata_components": 2847,                       # sum of all metadata items
    "metadata_types_scanned": ["ApexClass", "Flow", ...],    # list of types that returned data
    "health_score": 72,                                      # 0-100 from Gemini
    "summary": "The org shows moderate health...",           # executive summary from Gemini
    "findings": [...],                                       # array of finding objects from Gemini
    "statistics": {"critical": 2, "high": 5, ...},          # severity counts
    "category_scores": {"Security": 45, "Code Quality": 62, ...}  # per-category scores from Gemini
}
```

### 9.2 Statistics Recalculation

If Gemini didn't return `statistics` but did return `findings`, the node recalculates:

```python
if not report["statistics"] and report["findings"]:
    stats = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for finding in report["findings"]:
        sev = finding.get("severity", "info").lower()
        stats[sev] = stats.get(sev, 0) + 1
    report["statistics"] = stats
```

---

## 10. Error Handling Node

**Purpose:** Gracefully handle failures from any node.

```python
async def error_node(state: AgentState) -> dict:
    error = state.get("error", "Unknown error occurred")
    await _emit(f"Error: {error}", step=0, total=4, percent=0)
    return {"current_step": "error"}
```

This node:

1. Reads the error message from state
2. Sends it to the WebSocket progress callback so the user sees it in real-time
3. Sets `current_step` to `"error"`
4. The graph then terminates (edge to END)

### Error Propagation Through the System

```
Node sets error → Routing function detects it → Diverts to error_node → END
                                                      ↓
                                        _handle_scan catches RuntimeError
                                                      ↓
                                        Updates scan status to "failed" in DB
                                                      ↓
                                        Sends {"type": "error"} via WebSocket
                                                      ↓
                                        Frontend shows toast notification
```

---

## 11. State Management — AgentState

**File:** `state.py`

The entire pipeline operates on a single shared state object:

```python
class AgentState(TypedDict, total=False):
    # Configuration inputs
    gemini_api_key: str           # the Google API key for Gemini
    gemini_model: str             # e.g., "gemini-3.1-pro-preview"
    target_org: str               # Salesforce CLI alias like "my-prod-org"

    # Metadata layer — "what exists"
    org_metadata: dict[str, list[dict]]    # raw metadata from SF CLI
    org_metadata_summary: str               # text summary for the LLM

    # Runtime layer — "how it's behaving"
    runtime_data: dict[str, Any]           # limits + SOQL results
    runtime_data_summary: str               # text summary for the LLM

    # Analysis outputs
    health_report: dict[str, Any]          # the final report

    # Control
    error: str | None                       # error message or None
    current_step: str                       # tracks pipeline progress
    messages: list[dict[str, str]]          # conversation history (system messages)
```

`total=False` means all fields are optional — this is important because the state starts nearly empty and gets populated as each node runs.

### How State Flows

```
Initial state (3 fields set)
    ↓ collect_metadata_node
State + org_metadata, org_metadata_summary, current_step, messages
    ↓ collect_runtime_node
State + runtime_data, runtime_data_summary, current_step, messages
    ↓ analyse_health_node
State + health_report (from LLM), current_step, messages
    ↓ generate_report_node
State + health_report (enriched final version), current_step, messages
```

---

## 12. Salesforce CLI Integration

**File:** `services/salesforce.py`

This is the bridge between the Python application and Salesforce. It wraps the Salesforce CLI (`sf`) as a subprocess — **no direct REST API or SOAP API calls** are made.

### 12.1 CLI Discovery

```python
def _find_sf_cli() -> str:
    path = shutil.which("sf")       # try "sf" first (modern CLI)
    if path: return path
    path = shutil.which("sfdx")     # fallback to legacy "sfdx"
    if path: return path
    raise EnvironmentError("Salesforce CLI not found on PATH")
```

### 12.2 Command Execution

Every SF CLI command goes through `_run_cli()`:

```python
async def _run_cli(args: list[str], timeout: int = 120) -> dict:
    sf = _find_sf_cli()
    cmd = [sf] + args + ["--json"]    # always request JSON output
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    raw = stdout.decode("utf-8", errors="replace").strip()
    data = json.loads(raw)
    return data
```

Key behaviors:

- **All commands get `--json`** appended automatically for machine-readable output
- **Timeout defaults to 120 seconds** — CLI commands can be slow, especially for large orgs
- **Non-JSON output** is caught and returned as `{"raw": output}` instead of crashing
- **Error detection** checks both `proc.returncode` and the `status` field in the JSON response

### 12.3 Full Function Inventory


| Function                                    | CLI Command                                             | Timeout  | Returns                             |
| ------------------------------------------- | ------------------------------------------------------- | -------- | ----------------------------------- |
| `login_web(alias, instance_url)`            | `sf org login web --alias X --instance-url Y`           | 300s     | OAuth login result                  |
| `display_org(target_org)`                   | `sf org display --target-org X`                         | 120s     | Org details (username, instanceUrl) |
| `list_orgs()`                               | `sf org list`                                           | 120s     | All authenticated orgs              |
| `list_metadata(target_org, type)`           | `sf org list metadata --metadata-type T --target-org X` | 60s      | List of metadata components         |
| `retrieve_org_metadata(target_org, types)`  | Calls `list_metadata` for each of 25 types              | 60s each | Dict of all metadata                |
| `get_org_limits(target_org)`                | `sf org list limits --target-org X`                     | 60s      | Governor limits dict                |
| `run_soql(target_org, query)`               | `sf data query --query "..." --target-org X`            | 120s     | SOQL query records                  |
| `collect_runtime_data(target_org, queries)` | Calls `get_org_limits` + `run_soql` for each query      | varies   | Complete runtime dict               |


### 12.4 Authentication Flow

When the user clicks "Connect New Org" in the UI:

1. Frontend calls `POST /api/orgs/connect` with `{alias, instance_url, sandbox}`
2. Server calls `salesforce.login_web(alias, instance_url)` with 300s timeout
3. The SF CLI opens the user's **default browser** to the Salesforce login page
4. User authenticates via OAuth in the browser
5. SF CLI receives the OAuth callback and stores the session locally (in `~/.sf/`)
6. Server calls `salesforce.display_org(alias)` to get the username and instance URL
7. Server saves the org in SQLite and updates `app_state`

**Important:** The CLI stores sessions locally, so once authenticated, you don't need to re-login unless the session expires.

---

## 13. Gemini LLM Integration

**File:** `services/llm.py`

A thin wrapper around `langchain-google-genai`:

```python
async def invoke_llm(api_key, model, system_prompt, user_prompt, *, temperature=0.2) -> str:
    llm = ChatGoogleGenerativeAI(
        model=model,                          # "gemini-3.1-pro-preview"
        google_api_key=api_key,
        temperature=temperature,               # 0.15 for health analysis
        max_output_tokens=65_536,              # generous output limit
        convert_system_message_to_human=True,  # Gemini quirk — system messages become human
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]
    response = await llm.ainvoke(messages)
    return str(response.content)
```

**Key detail:** `convert_system_message_to_human=True` is required because Gemini models handle system messages differently than OpenAI models. This flag converts the system message into a human message prefix, which gives more consistent behavior.

### Available Models

The UI offers three model choices:


| Model ID                 | Display Name                     |
| ------------------------ | -------------------------------- |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview (default) |
| `gemini-3-pro-preview`   | Gemini 3 Pro Preview             |
| `gemini-2.5-pro`         | Gemini 2.5 Pro                   |


---

## 14. FastAPI Server & REST API

**File:** `server.py`

### 14.1 Complete API Reference

#### Health & Meta


| Method | Path          | Description                                    |
| ------ | ------------- | ---------------------------------------------- |
| `GET`  | `/`           | Serves `index.html`                            |
| `GET`  | `/api/health` | Returns `{"status": "ok", "version": "1.0.0"}` |


#### Settings


| Method   | Path                   | Description                                     |
| -------- | ---------------------- | ----------------------------------------------- |
| `GET`    | `/api/settings`        | Returns masked API key status and current model |
| `POST`   | `/api/settings/apikey` | Saves API key and model to SQLite and app_state |
| `DELETE` | `/api/settings/apikey` | Removes API key                                 |
| `PUT`    | `/api/settings/model`  | Updates just the model                          |


#### Orgs


| Method   | Path                 | Description                                |
| -------- | -------------------- | ------------------------------------------ |
| `GET`    | `/api/orgs`          | Lists all active connected orgs            |
| `POST`   | `/api/orgs/connect`  | Triggers SF CLI login, stores org info     |
| `DELETE` | `/api/orgs/{org_id}` | Soft-deletes an org (sets `is_active = 0`) |


#### Scans


| Method   | Path                   | Description                                    |
| -------- | ---------------------- | ---------------------------------------------- |
| `GET`    | `/api/scans`           | Lists all scans (newest first)                 |
| `GET`    | `/api/scans/{scan_id}` | Returns scan details + all findings            |
| `DELETE` | `/api/scans/{scan_id}` | Hard-deletes scan and its findings             |
| `GET`    | `/api/dashboard`       | Returns aggregated stats + 5 most recent scans |


#### Findings


| Method | Path                           | Description                   |
| ------ | ------------------------------ | ----------------------------- |
| `POST` | `/api/findings/{id}/resolve`   | Marks a finding as resolved   |
| `POST` | `/api/findings/{id}/unresolve` | Marks a finding as unresolved |


#### Categories


| Method | Path              | Description                                  |
| ------ | ----------------- | -------------------------------------------- |
| `GET`  | `/api/categories` | Returns the 8 health categories with weights |


### 14.2 API Key Masking

When returning settings, the API key is masked for display:

```python
masked_key = raw[:4] + "•" * max(0, len(raw) - 8) + raw[-4:]
# e.g., "AIza••••••••••••Xy3f"
```

---

## 15. WebSocket Real-Time Communication

**Endpoint:** `ws://127.0.0.1:8502/ws/scan`

### 15.1 Protocol

The WebSocket uses a simple JSON message protocol:

**Client → Server:**

```json
{"action": "run_scan"}      // start a health scan
{"action": "ping"}          // keepalive
```

**Server → Client:**

```json
{"type": "pong"}                                    // keepalive response
{"type": "started", "scan_id": 42}                  // scan started
{"type": "progress", "step": 2, "total_steps": 4,
 "message": "Running runtime query: admin_users (4/12)…",
 "percent": 38}                                      // progress update
{"type": "complete", "scan_id": 42}                  // scan finished successfully
{"type": "error", "message": "Gemini API key not configured."}  // error
```

### 15.2 Scan Lifecycle Through WebSocket

```
Client sends: {"action": "run_scan"}
    ↓
Server validates:
  - API key configured? If not → {"type": "error"}
  - Org connected? If not → {"type": "error"}
  - Scan already running? If so → {"type": "error"}
    ↓
Server creates scan row in DB (status: "running")
    ↓
Server sends: {"type": "started", "scan_id": 42}
    ↓
Server calls run_health_scan() with progress_callback
    ↓
[~20 progress messages stream through as each metadata type is fetched,
 each SOQL query runs, LLM processes, report generates]
    ↓
On success: Server saves report + findings to DB, sends {"type": "complete"}
On failure: Server updates scan to "failed", sends {"type": "error"}
    ↓
Finally: app_state.scan_running = False
```

### 15.3 Progress Callback Mechanism

The nodes communicate progress through a module-level callback:

```python
_progress_callback = None

def set_progress_callback(cb):
    global _progress_callback
    _progress_callback = cb

async def _emit(msg, step=0, total=4, percent=0):
    if _progress_callback:
        await _progress_callback(msg, step, total, percent)
```

The server defines the callback to send WebSocket messages:

```python
async def progress_cb(message, step=0, total=4, percent=0):
    await ws.send_json({
        "type": "progress", "step": step, "total_steps": total,
        "message": message, "percent": percent,
    })
```

---

## 16. SQLite Database Layer

**File:** `database.py`  
**Database path:** `data/org_health_agent.db`

### 16.1 Schema

Four tables:

#### `settings` — Key-value store

```sql
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
```

Stores: `gemini_api_key`, `gemini_model`

#### `orgs` — Connected Salesforce orgs

```sql
CREATE TABLE orgs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alias        TEXT NOT NULL UNIQUE,
    username     TEXT,
    instance_url TEXT,
    is_active    INTEGER DEFAULT 1,      -- soft delete flag
    connected_at TEXT DEFAULT (datetime('now'))
);
```

#### `scans` — Health scan records

```sql
CREATE TABLE scans (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias        TEXT NOT NULL,
    org_username     TEXT,
    scan_type        TEXT DEFAULT 'full',
    status           TEXT DEFAULT 'running',      -- running | completed | failed
    health_score     INTEGER DEFAULT 0,
    category_scores  TEXT,                         -- JSON string
    total_components INTEGER DEFAULT 0,
    total_findings   INTEGER DEFAULT 0,
    critical_count   INTEGER DEFAULT 0,
    high_count       INTEGER DEFAULT 0,
    medium_count     INTEGER DEFAULT 0,
    low_count        INTEGER DEFAULT 0,
    info_count       INTEGER DEFAULT 0,
    summary          TEXT,
    report_json      TEXT,                         -- full JSON report
    started_at       TEXT DEFAULT (datetime('now')),
    completed_at     TEXT
);
```

#### `findings` — Individual health findings

```sql
CREATE TABLE findings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id             INTEGER NOT NULL,
    severity            TEXT NOT NULL,              -- Critical | High | Medium | Low | Info
    category            TEXT,
    title               TEXT,
    description         TEXT,
    affected_components TEXT,                       -- JSON array as string
    recommendation      TEXT,
    effort              TEXT,                       -- Quick Fix | Medium | Large
    is_resolved         INTEGER DEFAULT 0,
    resolved_at         TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
);
```

### 16.2 Key Operations

- **Async** — all operations use `aiosqlite` for non-blocking I/O
- **Findings ordered by severity** — when queried, findings are sorted: Critical → High → Medium → Low → Info
- **Affected components** stored as JSON string, parsed back to list on read
- **Soft delete for orgs** — `is_active = 0` instead of row deletion
- **Hard delete for scans** — CASCADE deletes findings too
- **Dashboard stats** are computed via aggregate SQL queries in `get_dashboard_stats()`

### 16.3 Dashboard Stats Query

```python
return {
    "total_scans": COUNT(*) FROM scans,
    "completed_scans": COUNT(*) WHERE status='completed',
    "total_findings": COUNT(*) FROM findings,
    "resolved_findings": COUNT(*) WHERE is_resolved=1,
    "critical_unresolved": COUNT(*) WHERE severity='Critical' AND is_resolved=0,
    "connected_orgs": COUNT(*) FROM orgs WHERE is_active=1,
    "latest_health_score": health_score FROM latest completed scan,
}
```

---

## 17. Configuration & Thresholds

**File:** `config.py`

### 17.1 Health Categories (8 categories with weights)


| Key              | Label              | Weight  | What It Measures                                  |
| ---------------- | ------------------ | ------- | ------------------------------------------------- |
| `limits_usage`   | Limits & Usage     | 15%     | API usage, storage, async limits                  |
| `security`       | Security           | **20%** | Admin users, dangerous permissions, failed logins |
| `code_quality`   | Code Quality       | 15%     | API versions, test coverage, trigger patterns     |
| `automation`     | Automation Health  | 10%     | Flows, workflow rules, process builders           |
| `data_model`     | Data Model         | 10%     | Custom objects, custom fields                     |
| `technical_debt` | Technical Debt     | 10%     | Aura vs LWC, Visualforce, deprecated APIs         |
| `integration`    | Integration Health | 10%     | Connected apps, named credentials                 |
| `change_mgmt`    | Change Management  | 10%     | Setup audit trail patterns                        |


**Security has the highest weight (20%)** — reflecting the critical importance of Salesforce security posture.

### 17.2 Thresholds

```python
THRESHOLDS = {
    "api_usage_warn_pct": 70,              # 70% API usage → warning
    "api_usage_critical_pct": 90,          # 90% API usage → critical
    "storage_warn_pct": 75,                # 75% storage → warning
    "storage_critical_pct": 90,            # 90% storage → critical
    "old_api_version_cutoff": 58.0,        # API version < 58 = outdated
    "max_admin_users": 5,                  # more than 5 admins = risk
    "failed_login_warn_pct": 10,           # 10% failed logins → concern
    "apex_test_coverage_min": 75,          # below 75% = problem
    "custom_fields_per_object_warn": 400,  # approaching 500 limit
    "custom_fields_per_object_critical": 500,  # at the limit
}
```

### 17.3 Mutable App State

```python
@dataclass
class AppState:
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    sf_target_org: str = ""
    sf_instance_url: str = ""
    sf_username: str = ""
    is_org_connected: bool = False
    scan_running: bool = False
    last_report: dict = field(default_factory=dict)

app_state = AppState()    # singleton instance
```

This is an in-memory singleton that holds the current application state. It's populated from SQLite at startup and updated by API calls.

---

## 18. Pydantic Models

**File:** `models.py`

### Request Models

```python
class SetApiKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1)
    model: str = Field(default="gemini-3.1-pro-preview")

class ConnectOrgRequest(BaseModel):
    alias: str = Field(default="org-health-agent-org")
    instance_url: str = Field(default="https://login.salesforce.com")
    sandbox: bool = False

class RunScanRequest(BaseModel):
    scan_type: str = Field(default="full")
```

### Response/Data Models

```python
class FindingItem(BaseModel):
    severity: str                              # Critical|High|Medium|Low|Info
    category: str                              # one of 8 categories
    title: str
    description: str = ""
    affected_components: list[str] = []
    recommendation: str = ""
    effort: str = ""                           # Quick Fix|Medium|Large

class HealthReport(BaseModel):
    health_score: int = 0
    org_alias: str = ""
    generated_at: str = ""
    summary: str = ""
    total_metadata_components: int = 0
    findings: list[FindingItem] = []
    statistics: dict = {}
    category_scores: dict = {}

class ScanProgress(BaseModel):
    step: int
    total_steps: int
    step_name: str
    message: str
    percent: int = 0
```

---

## 19. Frontend — Single Page Application

**Files:** `static/index.html`, `static/app.js`, `static/styles.css`

### 19.1 Architecture

The frontend is a **vanilla JavaScript SPA** — no React, no Vue, no build tools. Everything runs from three static files.

### 19.2 Pages


| Page ID       | Name              | What It Shows                                              |
| ------------- | ----------------- | ---------------------------------------------------------- |
| `dashboard`   | Dashboard         | Health gauge, stat cards, recent scans, quick actions      |
| `scans`       | Scans & Reports   | List of all past scans with score, status, findings count  |
| `new-scan`    | Run Health Scan   | Launch button + live 4-step pipeline visualizer            |
| `scan-detail` | Org Health Report | Full report with charts, stats, findings table, PDF export |
| `settings`    | Settings          | API key config, model selector, org connection             |


### 19.3 Navigation System

```javascript
function navigate(page, opts) {
    // Toggle active nav item
    // Toggle active page section
    // Update top bar title
    // Load page-specific data:
    if (page === "dashboard") loadDashboard();
    if (page === "scans") loadScans();
    if (page === "settings") loadSettings();
    if (page === "new-scan") loadNewScan();
    if (page === "scan-detail" && opts?.scanId) loadScanDetail(opts.scanId);
}
```

### 19.4 Health Gauge

The dashboard features a **semi-circular gauge** drawn on an HTML5 Canvas:

- Gray background arc (empty)
- Colored overlay arc (filled based on score percentage)
- Color coding: Green (90+) → Dark Green (75+) → Yellow (60+) → Orange (40+) → Red (below 40)

### 19.5 Real-Time Pipeline Visualizer

When a scan runs, the UI shows a 4-step pipeline with animated connectors:

```
[Collect Metadata] ──▶ [Runtime Data] ──▶ [AI Analysis] ──▶ [Generate Report]
```

Each step transitions through states: idle → active (pulsing) → done (green check) or error (red X). A progress bar and percentage indicator track overall completion. A scrolling log shows real-time messages from the server.

### 19.6 Charts

Two Chart.js charts on the scan detail page:

- **Bar chart** — findings by severity (Critical/High/Medium/Low/Info)
- **Radar chart** — category health scores (the 8 categories plotted on a radar)

### 19.7 Findings Table

A paginated, filterable table showing all findings:

- **Filters:** severity dropdown, category dropdown, unresolved-only toggle, text search
- **Pagination:** 10 items per page with prev/next/page buttons
- **Expandable rows** — click a finding to reveal description, affected components, and recommendation
- **Resolve/unresolve** — toggle finding resolution status via API

### 19.8 External Libraries (CDN)


| Library         | Version | Purpose                   |
| --------------- | ------- | ------------------------- |
| Chart.js        | 4.4.7   | Bar and radar charts      |
| jsPDF           | 2.5.2   | PDF generation in browser |
| jsPDF-autotable | 3.8.4   | Table rendering in PDFs   |
| Inter font      | —       | Primary UI font           |
| JetBrains Mono  | —       | Monospace font for IDs    |


---

## 20. PDF Report Export

The `__exportReport()` function in `app.js` generates a PwC-branded PDF report:

### 20.1 Cover Page

- Orange PwC brand bar at top
- "Org Health Report" title with orange accent bar
- Subtitle: "Proactive Monitoring Assessment"
- Meta info: org alias, health score, date, total findings

### 20.2 Executive Summary Section

- Orange section marker
- Word-wrapped summary text

### 20.3 Findings Table

- Full-page table with all findings
- Columns: #, Finding, Severity, Category, Effort, Status
- PwC orange header with white text
- Alternating row colors
- Auto-pagination across multiple pages

### 20.4 Footer

- Page numbers on every page
- "© 2026 PwC. All rights reserved."
- Horizontal rule separator

---

## 21. Complete Data Flow — Start to Finish

Here is the complete journey from the moment you click "Start Health Scan" to seeing the report:

```
 USER CLICKS "Start Health Scan"
         │
         ▼
 app.js: startScan()
   ├─ Connects WebSocket to ws://127.0.0.1:8502/ws/scan (if not already open)
   ├─ Sends {"action": "run_scan"}
   └─ Shows pipeline visualizer
         │
         ▼
 server.py: scan_websocket() receives message
   ├─ Validates: API key set? Org connected? No scan running?
   ├─ Creates scan row in SQLite (status: "running")
   ├─ Sets app_state.scan_running = True
   ├─ Sends {"type": "started", "scan_id": 42}
   └─ Calls _handle_scan()
         │
         ▼
 graph.py: run_health_scan()
   ├─ Sets progress callback (sends WS messages)
   ├─ Builds LangGraph: 4 nodes + error node + conditional edges
   ├─ Creates initial AgentState with API key, model, target org
   └─ Calls workflow.ainvoke(initial_state)
         │
         ▼
 ┌─── NODE 1: collect_metadata_node ───┐
 │                                      │
 │  For each of 25 metadata types:      │
 │    sf org list metadata              │
 │      --metadata-type ApexClass       │
 │      --target-org my-org             │
 │      --json                          │
 │                                      │
 │  → {"ApexClass": [...], ...}         │
 │  → Text summary for LLM             │
 │  → Progress: 5% → 25%               │
 │                                      │
 │  On error → route to error_node      │
 └──────────────┬───────────────────────┘
                │
                ▼
 ┌─── NODE 2: collect_runtime_node ────┐
 │                                      │
 │  1. sf org list limits               │
 │     → {DailyApiRequests: {max, rem}} │
 │                                      │
 │  2. For each of 12 SOQL queries:     │
 │     sf data query                    │
 │       --query "SELECT COUNT..."       │
 │       --target-org my-org             │
 │       --json                          │
 │                                      │
 │  → {limits: {...}, admin_users: [...]}│
 │  → Text summary for LLM             │
 │  → Progress: 30% → 50%              │
 │                                      │
 │  On error → route to error_node      │
 └──────────────┬───────────────────────┘
                │
                ▼
 ┌─── NODE 3: analyse_health_node ─────┐
 │                                      │
 │  Constructs prompt:                  │
 │    System: 200-line architect prompt  │
 │    User: metadata_summary +           │
 │          runtime_summary              │
 │                                      │
 │  Calls Gemini API:                   │
 │    model: gemini-3.1-pro-preview     │
 │    temperature: 0.15                 │
 │    max_output_tokens: 65,536         │
 │                                      │
 │  Parses JSON response:              │
 │    health_score, findings,           │
 │    statistics, category_scores       │
 │                                      │
 │  → Progress: 55% → 85%              │
 │                                      │
 │  On JSON parse error → partial report│
 │  On LLM error → route to error_node  │
 └──────────────┬───────────────────────┘
                │
                ▼
 ┌─── NODE 4: generate_report_node ────┐
 │                                      │
 │  Merges AI analysis with metadata:   │
 │    generated_at (UTC timestamp)      │
 │    org_alias                         │
 │    total_metadata_components         │
 │    metadata_types_scanned            │
 │    health_score                      │
 │    summary                           │
 │    findings[]                        │
 │    statistics{}                      │
 │    category_scores{}                 │
 │                                      │
 │  Recalculates statistics if missing  │
 │  → Progress: 90% → 100%             │
 └──────────────┬───────────────────────┘
                │
                ▼
 graph.py: workflow returns final_state
   └─ Returns health_report dict
         │
         ▼
 server.py: _handle_scan() saves to DB
   ├─ update_scan(scan_id, status="completed", health_score=72, ...)
   ├─ For each finding: add_finding(scan_id, severity, category, ...)
   ├─ Sends {"type": "complete", "scan_id": 42}
   └─ app_state.scan_running = False
         │
         ▼
 app.js: handleWs() receives "complete"
   ├─ Sets all pipeline steps to "done"
   ├─ Progress bar → 100%
   ├─ Shows success toast
   └─ After 1.5s → navigates to scan-detail page
         │
         ▼
 app.js: loadScanDetail(42)
   ├─ GET /api/scans/42 → full scan + findings
   ├─ Renders stat cards (score, resolved, total, critical, components)
   ├─ Renders severity bar chart (Chart.js)
   ├─ Renders category radar chart (Chart.js)
   ├─ Renders executive summary
   └─ Renders paginated findings table
         │
         ▼
 USER SEES COMPLETE HEALTH REPORT
```

---

## 22. Sequence Diagram

```
Browser              Server              LangGraph             SF CLI              Gemini
  │                    │                    │                    │                    │
  │─── WS Connect ────▶│                    │                    │                    │
  │◀── WS Accept ──────│                    │                    │                    │
  │                    │                    │                    │                    │
  │─ {run_scan} ──────▶│                    │                    │                    │
  │                    │─ CREATE scan ──────▶│ (DB)               │                    │
  │◀── {started} ──────│                    │                    │                    │
  │                    │─ run_health_scan() ▶│                    │                    │
  │                    │                    │                    │                    │
  │                    │                    │── Node 1 ──────────▶│                    │
  │◀── {progress 5%} ──│◀── progress cb ────│  sf org list meta  │                    │
  │◀── {progress 10%} ─│◀── progress cb ────│  (×25 types)       │                    │
  │◀── {progress 25%} ─│◀── progress cb ────│◀── metadata ───────│                    │
  │                    │                    │                    │                    │
  │                    │                    │── Node 2 ──────────▶│                    │
  │◀── {progress 30%} ─│◀── progress cb ────│  sf org list limits │                    │
  │◀── {progress 35%} ─│◀── progress cb ────│  sf data query ×12 │                    │
  │◀── {progress 50%} ─│◀── progress cb ────│◀── runtime data ───│                    │
  │                    │                    │                    │                    │
  │                    │                    │── Node 3 ───────────────────────────────▶│
  │◀── {progress 55%} ─│◀── progress cb ────│  system + user prompt                   │
  │◀── {progress 60%} ─│◀── progress cb ────│  (waiting for LLM)                      │
  │◀── {progress 85%} ─│◀── progress cb ────│◀── JSON analysis ──────────────────────│
  │                    │                    │                    │                    │
  │                    │                    │── Node 4           │                    │
  │◀── {progress 90%} ─│◀── progress cb ────│  (build report)    │                    │
  │◀── {progress 100%}─│◀── progress cb ────│                    │                    │
  │                    │                    │                    │                    │
  │                    │◀── final report ───│                    │                    │
  │                    │─ UPDATE scan (DB) ──│                    │                    │
  │                    │─ INSERT findings ───│                    │                    │
  │◀── {complete} ─────│                    │                    │                    │
  │                    │                    │                    │                    │
  │─ GET /scans/42 ───▶│                    │                    │                    │
  │◀── full report ────│                    │                    │                    │
  │                    │                    │                    │                    │
  │ [renders charts,   │                    │                    │                    │
  │  stats, findings]  │                    │                    │                    │
```

---

## 23. Dependencies

From `requirements.txt`:


| Package                  | Version  | Purpose                                                     |
| ------------------------ | -------- | ----------------------------------------------------------- |
| `fastapi`                | ≥0.115.0 | Web framework — REST + WebSocket                            |
| `uvicorn[standard]`      | ≥0.32.0  | ASGI server — runs the FastAPI app                          |
| `websockets`             | ≥13.0    | WebSocket support for uvicorn                               |
| `httpx`                  | ≥0.27.0  | HTTP client (available but not directly used by this agent) |
| `langgraph`              | ≥0.2.0   | Agent workflow framework — StateGraph                       |
| `langchain-google-genai` | ≥2.0.0   | Gemini LLM integration via LangChain                        |
| `langchain-core`         | ≥0.3.0   | Base LangChain types (SystemMessage, HumanMessage)          |
| `pydantic`               | ≥2.9.0   | Data validation for API models                              |
| `pydantic-settings`      | ≥2.6.0   | Settings management (available but not directly used)       |
| `python-multipart`       | ≥0.0.12  | Form data parsing for FastAPI                               |
| `aiosqlite`              | ≥0.20.0  | Async SQLite driver                                         |


### External Requirements (not in requirements.txt)

- **Salesforce CLI** (`sf` or `sfdx`) must be installed and on PATH
- **Google Gemini API key** — obtained from Google AI Studio
- **Python 3.11+** — for `str | None` union syntax and `TypedDict` features

---

## 24. Key Design Decisions & Trade-offs

### Why Salesforce CLI instead of REST API?

The SF CLI handles OAuth session management, token refresh, and multi-org switching automatically. Using it as a subprocess avoids implementing a full Salesforce OAuth flow, storing refresh tokens, and handling token expiration. The trade-off is a dependency on the CLI being installed and slightly slower execution (subprocess overhead).

### Why LangGraph instead of a simple function chain?

LangGraph provides formal state management, conditional error routing, and the foundation for future enhancements like parallel node execution, human-in-the-loop approvals, or branching analysis paths. For the current 4-node linear pipeline, it's arguably over-engineered, but it makes the architecture extensible.

### Why SQLite instead of PostgreSQL?

This is a single-user desktop tool — SQLite requires zero configuration, no separate server, and the database is a single portable file. If this ever needs multi-user support, the `aiosqlite` calls could be swapped to `asyncpg` with minimal changes.

### Why Vanilla JS instead of React/Vue?

The frontend is relatively simple (5 pages, a few charts, one WebSocket). A framework would add build tooling complexity without proportional benefit. The trade-off is more manual DOM manipulation.

### Why a single system prompt instead of multiple LLM calls?

One large prompt with all rules produces a more holistic analysis — the LLM can weigh findings against each other and produce a coherent overall score. Multiple calls would risk inconsistency between categories and require complex score merging logic.

### Why temperature 0.15?

Low temperature ensures consistent, factual analysis. Health assessments need to be reproducible and grounded in evidence, not creative. The slight above-zero value allows the model some flexibility in phrasing recommendations.

### Why 900K character prompt limit?

Gemini models have context window limits. The 900K character cap prevents token overflow while allowing very large orgs (thousands of components) to be fully analyzed.

### Why soft delete for orgs but hard delete for scans?

Orgs might be reconnected later (their CLI session persists), so soft delete preserves the record. Scans are historical artifacts — if you delete one, you probably want it gone completely, including all findings.

---

*This document covers the complete technical architecture of the Org Health Agent. Every file, every function, every data flow, and every design decision is documented here.*