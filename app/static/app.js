/* ═══════════════════════════════════════════════════════════════════
   PwC Org Health Monitor — Frontend SPA
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

  let ws = null;
  let currentScanId = null;
  let sevChart = null;
  let catChart = null;
  let dashCharts = {};

  /* ── DOM cache ───────────────────────────────────────────────── */
  const el = {};
  function cacheEls() {
    [
      "page-title", "tb-model", "tb-org", "sidebar-status",
      "dash-recent-scans", "dash-new-scan-btn",
      "health-gauge-canvas", "health-gauge-label",
      "dash-current-score", "dash-current-grade",
      "dash-avg-score", "dash-avg-sub",
      "dash-open-issues", "dash-critical-label",
      "dash-critical-open", "dash-critical-sub",
      "qa-new-scan", "qa-connect-org", "qa-settings",
      "scans-list", "scans-new-btn",
      "start-scan-btn", "scan-progress",
      "scan-progress-fill", "scan-progress-pct", "scan-log", "pipeline",
      "detail-back-btn", "detail-stats", "detail-subtitle",
      "detail-summary", "inv-tbody", "inv-footer", "inv-search",
      "filter-severity", "filter-category", "filter-unresolved", "export-report-btn",
      "detail-progress-wrap", "detail-report-wrap",
      "s-api-key", "s-model", "s-api-hint", "s-save-key-btn",
      "s-remove-key-btn", "s-org-list", "s-org-alias", "s-sandbox", "s-connect-btn",
      "toast-container",
    ].forEach((id) => {
      el[id.replace(/-/g, "_")] = document.getElementById(id);
    });
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  function toast(msg, type = "info") {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    el.toast_container.appendChild(t);
    setTimeout(() => { t.style.animation = "tOut .25s ease forwards"; setTimeout(() => t.remove(), 250); }, 4500);
  }

  /* ── API helper ──────────────────────────────────────────────── */
  async function api(method, path, body) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (!r.ok) {
      const e = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(e.detail || e.message || "Request failed");
    }
    return r.status === 204 ? null : r.json();
  }

  /* ── Navigation ──────────────────────────────────────────────── */
  const pages = {};
  function initNav() {
    $$(".page").forEach((p) => { pages[p.id.replace("page-", "")] = p; });
    $$(".nav-item[data-page]").forEach((n) => {
      n.addEventListener("click", () => navigate(n.dataset.page));
    });
  }

  function navigate(page, opts) {
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
    Object.values(pages).forEach((p) => p.classList.remove("active"));
    const target = pages[page];
    if (target) target.classList.add("active");

    const titles = {
      dashboard: "Dashboard",
      scans: "Scans & Reports",
      "new-scan": "Run Health Scan",
      "scan-detail": "Org Health Report",
      settings: "Settings",
    };
    el.page_title.textContent = titles[page] || page;

    if (page === "dashboard") loadDashboard();
    if (page === "scans") loadScans();
    if (page === "settings") loadSettings();
    if (page === "new-scan") loadNewScan();
    if (page === "scan-detail" && opts?.scanId) loadScanDetail(opts.scanId);
  }

  /* ── Health Gauge (mini for dashboard hero card) ──────────────── */
  function drawHealthGauge(score) {
    const canvas = el.health_gauge_canvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - 10;
    const radius = 80;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.lineWidth = 16;
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineCap = "round";
    ctx.stroke();

    if (score !== null && score !== undefined && score >= 0) {
      const pct = Math.min(score, 100) / 100;
      const angle = startAngle + pct * Math.PI;
      let color = "#DC2626";
      if (score >= 90) color = "#16A34A";
      else if (score >= 75) color = "#15803d";
      else if (score >= 60) color = "#CA8A04";
      else if (score >= 40) color = "#EA580C";

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, angle);
      ctx.lineWidth = 16;
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.stroke();

      el.health_gauge_label.textContent = score;
      el.health_gauge_label.style.color = color;
    } else {
      el.health_gauge_label.textContent = "--";
      el.health_gauge_label.style.color = "var(--text-3)";
    }
  }

  function scoreClass(score) {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 60) return "fair";
    if (score >= 40) return "poor";
    return "critical-score";
  }

  function scoreGrade(score) {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 60) return "Fair";
    if (score >= 40) return "Poor";
    return "Critical";
  }

  function scoreColor(score) {
    if (score >= 90) return "#16A34A";
    if (score >= 75) return "#15803d";
    if (score >= 60) return "#CA8A04";
    if (score >= 40) return "#EA580C";
    return "#DC2626";
  }

  function aiTag() {
    return '<span class="ai-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z"/></svg>AI Insight</span>';
  }

  /* ── Dashboard ───────────────────────────────────────────────── */
  async function loadDashboard() {
    try {
      const d = await api("GET", "/api/dashboard");
      const s = d.stats;
      const ext = d.extended || {};

      const latestScore = s.latest_health_score;
      drawHealthGauge(latestScore);

      if (latestScore != null) {
        el.dash_current_score.textContent = latestScore;
        el.dash_current_score.style.color = scoreColor(latestScore);
        el.dash_current_grade.textContent = scoreGrade(latestScore);
        el.dash_current_grade.style.color = scoreColor(latestScore);
      } else {
        el.dash_current_score.textContent = "--";
        el.dash_current_grade.textContent = "Run a scan to see your score";
      }

      if (ext.avg_score_last_5 != null) {
        el.dash_avg_score.textContent = ext.avg_score_last_5;
        el.dash_avg_score.style.color = scoreColor(ext.avg_score_last_5);
        const scanCount = Math.min(5, (ext.scan_history || []).length);
        el.dash_avg_sub.textContent = `Based on ${scanCount} scan${scanCount !== 1 ? "s" : ""}`;
      }

      const openIssues = (s.total_findings || 0) - (s.resolved_findings || 0);
      el.dash_open_issues.textContent = openIssues;
      el.dash_open_issues.style.color = openIssues > 0 ? "#EA580C" : "#16A34A";
      el.dash_critical_label.textContent = `${s.critical_unresolved || 0} critical`;
      el.dash_critical_label.style.color = (s.critical_unresolved || 0) > 0 ? "#DC2626" : "var(--text-3)";

      const critOpen = s.critical_unresolved || 0;
      el.dash_critical_open.textContent = critOpen;
      el.dash_critical_open.style.color = critOpen > 0 ? "#DC2626" : "#16A34A";
      el.dash_critical_sub.textContent = critOpen > 0 ? `${critOpen} require${critOpen === 1 ? "s" : ""} immediate action` : "No critical risks";
      el.dash_critical_sub.style.color = critOpen > 0 ? "#DC2626" : "var(--text-3)";

      renderDashboardCharts(ext, s);

      if (d.recent_scans.length === 0) {
        el.dash_recent_scans.innerHTML = '<div class="empty-state"><p>No scans yet. Run your first health check!</p></div>';
      } else {
        el.dash_recent_scans.innerHTML = buildScanTable(d.recent_scans);
        bindScanTableClicks(el.dash_recent_scans);
      }
    } catch (e) { toast("Failed to load dashboard: " + e.message, "error"); }
  }

  /* ── Dashboard Charts ──────────────────────────────────────────── */
  function destroyDashCharts() {
    Object.values(dashCharts).forEach((c) => { if (c) c.destroy(); });
    dashCharts = {};
  }

  function renderDashboardCharts(ext, stats) {
    destroyDashCharts();
    const history = (ext.scan_history || []).slice().reverse();

    renderTrendChart(history);
    renderSeverityDoughnut(ext.severity_totals || {});
    renderRadarChart(ext.latest_category_scores || {});
    renderRiskChart(ext.top_risk_categories || []);
    renderEffortChart(ext.effort_distribution || []);
    renderActivityChart(history);
  }

  function chartEmpty(canvasId, msg) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "500 11px Inter";
    ctx.textAlign = "center";
    ctx.fillText(msg || "No data yet — run a scan!", ctx.canvas.width / 2, ctx.canvas.height / 2);
  }

  /* 1. Health Score Trend (line) */
  function renderTrendChart(history) {
    const canvasId = "dash-chart-trend";
    const summaryEl = document.getElementById("dash-summary-trend");
    if (history.length < 1) {
      chartEmpty(canvasId, "Run scans to see your health trend");
      summaryEl.innerHTML = aiTag() + "No scan history available yet. Run your first scan to start tracking health trends.";
      return;
    }

    const labels = history.map((s) => {
      const d = s.started_at ? new Date(s.started_at + "Z") : new Date();
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    const scores = history.map((s) => s.health_score || 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    dashCharts.trend = new Chart(document.getElementById(canvasId), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Health Score",
          data: scores,
          borderColor: "#D04A02",
          backgroundColor: "rgba(208,74,2,.08)",
          borderWidth: 2.5,
          pointBackgroundColor: "#D04A02",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.35,
        }, {
          label: "Average",
          data: Array(scores.length).fill(Math.round(avg)),
          borderColor: "rgba(79,70,229,.4)",
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top", labels: { font: { size: 10, family: "Inter" }, boxWidth: 12, padding: 8 } },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: "Inter" }, color: "#9CA3AF" } },
          y: { min: 0, max: 100, grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9CA3AF", stepSize: 25 } },
        },
      },
    });

    const latest = scores[scores.length - 1];
    const prev = scores.length >= 2 ? scores[scores.length - 2] : latest;
    const delta = latest - prev;
    const direction = delta > 0 ? "improved" : delta < 0 ? "declined" : "remained stable";
    summaryEl.innerHTML = `${aiTag()}Your org health ${direction} from ${prev} to ${latest} (${delta > 0 ? "+" : ""}${delta} pts). The average score across ${scores.length} scans is ${Math.round(avg)}. ${latest >= 75 ? "Your org is in good shape — keep monitoring regularly." : "Consider addressing open findings to improve your score."}`;
  }

  /* 2. Findings by Severity (doughnut) */
  function renderSeverityDoughnut(sevTotals) {
    const canvasId = "dash-chart-severity";
    const summaryEl = document.getElementById("dash-summary-severity");
    const data = [sevTotals.Critical || 0, sevTotals.High || 0, sevTotals.Medium || 0, sevTotals.Low || 0, sevTotals.Info || 0];
    const total = data.reduce((a, b) => a + b, 0);

    if (total === 0) {
      chartEmpty(canvasId, "No findings yet");
      summaryEl.innerHTML = aiTag() + "No findings recorded. Run a health scan to identify potential issues in your org.";
      return;
    }

    const colors = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#4F46E5"];
    dashCharts.severity = new Chart(document.getElementById(canvasId), {
      type: "doughnut",
      data: {
        labels: ["Critical", "High", "Medium", "Low", "Info"],
        datasets: [{
          data,
          backgroundColor: colors.map((c) => c + "25"),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "right", labels: { font: { size: 10, family: "Inter", weight: 600 }, padding: 6, boxWidth: 10, usePointStyle: true, pointStyle: "circle" } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total * 100)}%)` } },
        },
      },
    });

    const critHigh = data[0] + data[1];
    const pctCritHigh = Math.round(critHigh / total * 100);
    summaryEl.innerHTML = `${aiTag()}${total} total findings across all scans. ${critHigh} (${pctCritHigh}%) are Critical or High severity requiring immediate attention. ${data[0] > 0 ? `There are ${data[0]} critical findings — address these first.` : "No critical issues found — focus on High severity items."}`;
  }

  /* 3. Category Health Radar */
  function renderRadarChart(catScores) {
    const canvasId = "dash-chart-radar";
    const summaryEl = document.getElementById("dash-summary-radar");
    const labels = Object.keys(catScores);
    const values = Object.values(catScores);

    if (labels.length === 0) {
      chartEmpty(canvasId, "Run a scan to see category scores");
      summaryEl.innerHTML = aiTag() + "Category health scores will appear here after your first scan, showing strengths and weaknesses across 8 key areas.";
      return;
    }

    dashCharts.radar = new Chart(document.getElementById(canvasId), {
      type: "radar",
      data: {
        labels: labels.map((l) => l.length > 14 ? l.substring(0, 12) + "…" : l),
        datasets: [{
          label: "Score",
          data: values,
          backgroundColor: "rgba(208,74,2,.1)",
          borderColor: "#D04A02",
          borderWidth: 2,
          pointBackgroundColor: "#D04A02",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 3.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            beginAtZero: true, max: 100,
            ticks: { stepSize: 25, font: { size: 8 }, color: "#9CA3AF", backdropColor: "transparent" },
            grid: { color: "rgba(0,0,0,.05)" },
            angleLines: { color: "rgba(0,0,0,.05)" },
            pointLabels: { font: { size: 9, weight: 600, family: "Inter" }, color: "#4B5563" },
          },
        },
      },
    });

    const minIdx = values.indexOf(Math.min(...values));
    const maxIdx = values.indexOf(Math.max(...values));
    summaryEl.innerHTML = `${aiTag()}Strongest area: <strong>${labels[maxIdx]}</strong> (${values[maxIdx]}/100). Weakest area: <strong>${labels[minIdx]}</strong> (${values[minIdx]}/100). ${values[minIdx] < 60 ? "This category needs immediate attention to prevent organizational risk." : "All categories are above the acceptable threshold."}`;
  }

  /* 4. Top Risk Categories (horizontal bar) */
  function renderRiskChart(riskCats) {
    const canvasId = "dash-chart-risk";
    const summaryEl = document.getElementById("dash-summary-risk");

    if (riskCats.length === 0) {
      chartEmpty(canvasId, "No open findings by category");
      summaryEl.innerHTML = aiTag() + "Risk category breakdown will appear here once findings are generated from a scan.";
      return;
    }

    const labels = riskCats.map((r) => r.category || "Unknown");
    const data = riskCats.map((r) => r.cnt);
    const gradient = data.map((_, i) => {
      const t = i / Math.max(data.length - 1, 1);
      return `rgba(${Math.round(208 + t * 12)},${Math.round(74 - t * 36)},${Math.round(2 + t * 36)},.7)`;
    });

    dashCharts.risk = new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: gradient,
          borderColor: gradient.map((c) => c.replace(",.7)", ",1)")),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.65,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9CA3AF", stepSize: 1 } },
          y: { grid: { display: false }, ticks: { font: { size: 10, weight: 600, family: "Inter" }, color: "#4B5563" } },
        },
      },
    });

    const topCat = labels[0] || "N/A";
    const topCount = data[0] || 0;
    summaryEl.innerHTML = `${aiTag()}<strong>${topCat}</strong> has the most open findings (${topCount}). ${riskCats.length > 1 ? `Followed by ${labels[1]} (${data[1]}).` : ""} Prioritize these categories in your next remediation cycle.`;
  }

  /* 5. Remediation Effort (polar area) */
  function renderEffortChart(effortDist) {
    const canvasId = "dash-chart-effort";
    const summaryEl = document.getElementById("dash-summary-effort");
    const total = effortDist.reduce((a, e) => a + e.cnt, 0);

    if (total === 0) {
      chartEmpty(canvasId, "No effort data yet");
      summaryEl.innerHTML = aiTag() + "Remediation effort estimates will appear here after findings are generated. This helps you plan sprint capacity.";
      return;
    }

    const effortMap = { "Quick Fix": 0, "Medium": 0, "Large": 0 };
    effortDist.forEach((e) => { if (e.effort in effortMap) effortMap[e.effort] = e.cnt; });
    const labels = Object.keys(effortMap);
    const data = Object.values(effortMap);
    const colors = ["#16A34A", "#CA8A04", "#EA580C"];

    dashCharts.effort = new Chart(document.getElementById(canvasId), {
      type: "polarArea",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map((c) => c + "30"),
          borderColor: colors,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { font: { size: 10, family: "Inter", weight: 600 }, padding: 8, boxWidth: 10, usePointStyle: true, pointStyle: "circle" } },
        },
        scales: {
          r: { ticks: { display: false }, grid: { color: "rgba(0,0,0,.04)" } },
        },
      },
    });

    const quickPct = total > 0 ? Math.round(effortMap["Quick Fix"] / total * 100) : 0;
    summaryEl.innerHTML = `${aiTag()}${quickPct}% of open findings are Quick Fixes — tackle these first for fast wins. ${effortMap["Large"]} finding${effortMap["Large"] !== 1 ? "s" : ""} require${effortMap["Large"] === 1 ? "s" : ""} Large effort and should be planned into upcoming sprints.`;
  }

  /* 6. Scan Activity & Scores (combo bar + line) */
  function renderActivityChart(history) {
    const canvasId = "dash-chart-activity";
    const summaryEl = document.getElementById("dash-summary-activity");

    if (history.length === 0) {
      chartEmpty(canvasId, "No scan activity yet");
      summaryEl.innerHTML = aiTag() + "Scan activity and finding counts will be visualized here. Regular scans help you track org health over time.";
      return;
    }

    const labels = history.map((s) => {
      const d = s.started_at ? new Date(s.started_at + "Z") : new Date();
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    const findingsData = history.map((s) => s.total_findings || 0);
    const scoresData = history.map((s) => s.health_score || 0);

    dashCharts.activity = new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          type: "bar",
          label: "Findings",
          data: findingsData,
          backgroundColor: "rgba(79,70,229,.15)",
          borderColor: "#4F46E5",
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.5,
          yAxisID: "y",
        }, {
          type: "line",
          label: "Score",
          data: scoresData,
          borderColor: "#16A34A",
          backgroundColor: "rgba(22,163,74,.08)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#16A34A",
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          tension: 0.3,
          fill: false,
          yAxisID: "y1",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { font: { size: 10, family: "Inter" }, boxWidth: 12, padding: 8 } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9CA3AF" } },
          y: { position: "left", beginAtZero: true, grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9CA3AF", stepSize: 5 }, title: { display: true, text: "Findings", font: { size: 9 }, color: "#9CA3AF" } },
          y1: { position: "right", min: 0, max: 100, grid: { display: false }, ticks: { font: { size: 10 }, color: "#9CA3AF", stepSize: 25 }, title: { display: true, text: "Score", font: { size: 9 }, color: "#9CA3AF" } },
        },
      },
    });

    const totalFindings = findingsData.reduce((a, b) => a + b, 0);
    const avgFindings = Math.round(totalFindings / history.length);
    summaryEl.innerHTML = `${aiTag()}Across ${history.length} scans, you averaged ${avgFindings} findings per scan. ${findingsData[findingsData.length - 1] < avgFindings ? "Your latest scan shows fewer findings than average — great progress!" : "Your latest scan has above-average findings — review recent org changes."}`;
  }

  function buildScanTable(scans) {
    const rows = scans.map((s) => {
      const date = s.started_at ? new Date(s.started_at + "Z").toLocaleString() : "—";
      const sc = s.health_score || 0;
      return `<tr data-scan-id="${s.id}">
        <td><strong>${esc(s.org_alias)}</strong><br><span style="color:var(--text-3);font-size:.7rem">${date}</span></td>
        <td><span class="score-badge ${scoreClass(sc)}">${sc}</span></td>
        <td><span class="status-pill ${s.status}">${s.status}</span></td>
        <td>${s.total_findings || 0} findings</td>
      </tr>`;
    }).join("");
    return `<table class="dash-table"><thead><tr><th>Org / Date</th><th>Score</th><th>Status</th><th>Findings</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function bindScanTableClicks(container) {
    $$("tr[data-scan-id]", container).forEach((row) => {
      row.addEventListener("click", () => navigate("scan-detail", { scanId: row.dataset.scanId }));
    });
  }

  /* ── Scans list ──────────────────────────────────────────────── */
  async function loadScans() {
    try {
      const d = await api("GET", "/api/scans");
      if (d.scans.length === 0) {
        el.scans_list.innerHTML = '<div class="empty-state"><p>No scans found.</p></div>';
        return;
      }
      el.scans_list.innerHTML = d.scans.map((s) => {
        const date = s.started_at ? new Date(s.started_at + "Z").toLocaleString() : "—";
        const sc = s.health_score || 0;
        return `<div class="scan-row" data-scan-id="${s.id}">
          <div><div class="scan-row-title">${esc(s.org_alias)}</div><div class="scan-row-sub">${esc(s.org_username || "")} · ${date}</div></div>
          <div class="scan-row-cell"><span class="score-badge ${scoreClass(sc)}">${sc}</span></div>
          <div class="scan-row-cell">${s.total_findings || 0} findings</div>
          <div><span class="status-pill ${s.status}">${s.status}</span></div>
          <div class="scan-row-actions"><button class="btn-icon btn-delete-scan" data-id="${s.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button></div>
        </div>`;
      }).join("");

      $$(".scan-row[data-scan-id]", el.scans_list).forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest(".btn-delete-scan")) return;
          navigate("scan-detail", { scanId: row.dataset.scanId });
        });
      });
      $$(".btn-delete-scan", el.scans_list).forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm("Delete this scan?")) return;
          try { await api("DELETE", `/api/scans/${btn.dataset.id}`); loadScans(); toast("Scan deleted", "info"); } catch (err) { toast(err.message, "error"); }
        });
      });
    } catch (e) { toast("Failed to load scans: " + e.message, "error"); }
  }

  /* ── New Scan ────────────────────────────────────────────────── */
  function loadNewScan() {
    el.scan_progress.classList.add("hidden");
    resetPipeline();
    el.start_scan_btn.disabled = false;
  }

  function resetPipeline() {
    $$(".pipeline-step", el.pipeline).forEach((s) => { s.className = "pipeline-step"; $(".step-sub", s).textContent = ""; });
    $$(".pipeline-connector", el.pipeline).forEach((c) => { c.className = "pipeline-connector"; });
    el.scan_progress_fill.style.width = "0%";
    el.scan_progress_pct.textContent = "0%";
    el.scan_log.innerHTML = "";
  }

  function setPipelineStep(step, status, sub) {
    const steps = $$(".pipeline-step", el.pipeline);
    const connectors = $$(".pipeline-connector", el.pipeline);
    steps.forEach((s, i) => {
      const n = i + 1;
      s.classList.remove("active", "done", "error");
      if (n < step) s.classList.add("done");
      else if (n === step) s.classList.add(status === "error" ? "error" : "active");
    });
    connectors.forEach((c, i) => {
      c.classList.remove("done", "active");
      if (i + 1 < step) c.classList.add("done");
      else if (i + 1 === step) c.classList.add("active");
    });
    if (sub && steps[step - 1]) $(".step-sub", steps[step - 1]).textContent = sub;
  }

  function addLog(text, level = "info") {
    const d = document.createElement("div");
    d.className = `log-line ${level}`;
    const ts = new Date().toLocaleTimeString();
    d.innerHTML = `<span class="log-ts">[${ts}]</span> ${esc(text)}`;
    el.scan_log.appendChild(d);
    el.scan_log.scrollTop = el.scan_log.scrollHeight;
  }

  /* ── Health Scan WebSocket ─────────────────────────────────────── */
  function connectWs() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws/scan`);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket failed"));
      ws.onclose = () => { ws = null; };
    });
  }

  async function startScan() {
    el.start_scan_btn.disabled = true;
    el.scan_progress.classList.remove("hidden");
    resetPipeline();
    addLog("Connecting to health scan engine…", "info");
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) await connectWs();
      ws.onmessage = (e) => handleWs(JSON.parse(e.data));
      ws.send(JSON.stringify({ action: "run_scan" }));
    } catch (e) {
      toast("Failed: " + e.message, "error");
      el.start_scan_btn.disabled = false;
    }
  }

  function handleWs(msg) {
    switch (msg.type) {
      case "started":
        currentScanId = msg.scan_id;
        addLog("Health scan started", "info");
        setPipelineStep(1, "active");
        break;
      case "progress": {
        const { step, percent, message } = msg;
        if (step) setPipelineStep(step, "active", message);
        el.scan_progress_fill.style.width = `${percent}%`;
        el.scan_progress_pct.textContent = `${percent}%`;
        addLog(message, "info");
        break;
      }
      case "complete":
        setPipelineStep(4, "done");
        $$(".pipeline-connector", el.pipeline).forEach((c) => { c.classList.add("done"); c.classList.remove("active"); });
        $$(".pipeline-step", el.pipeline).forEach((s) => { s.classList.remove("active"); s.classList.add("done"); });
        el.scan_progress_fill.style.width = "100%";
        el.scan_progress_pct.textContent = "100%";
        addLog("Health scan complete!", "success");
        el.start_scan_btn.disabled = false;
        toast("Org health scan complete!", "success");
        setTimeout(() => navigate("scan-detail", { scanId: msg.scan_id }), 1500);
        break;
      case "error":
        addLog(msg.message, "error");
        toast(msg.message, "error");
        el.start_scan_btn.disabled = false;
        break;
    }
  }

  /* ═════════════════════════════════════════════════════════════════
     SCAN DETAIL
     ═════════════════════════════════════════════════════════════════ */
  let detailData = null;
  let invPage = 1;
  const INV_PER_PAGE = 10;

  async function loadScanDetail(scanId) {
    try {
      const scan = await api("GET", `/api/scans/${scanId}`);
      detailData = scan;
      invPage = 1;

      const progressWrap = document.getElementById("detail-progress-wrap");
      const reportWrap = document.getElementById("detail-report-wrap");

      if (scan.status === "running") {
        progressWrap.classList.remove("hidden");
        reportWrap.classList.add("hidden");
        document.getElementById("detail-progress-title").textContent = "Health Scan In Progress";
        document.getElementById("detail-progress-sub").textContent =
          `${esc(scan.org_alias)} — Started at ${scan.started_at ? new Date(scan.started_at + "Z").toLocaleTimeString() : "unknown"}`;
        initDetailProgress(scan);
      } else if (scan.status === "failed") {
        progressWrap.classList.remove("hidden");
        reportWrap.classList.add("hidden");
        document.getElementById("detail-progress-title").textContent = "Scan Failed";
        document.getElementById("detail-progress-sub").textContent =
          `${esc(scan.org_alias)} — The scan encountered an error.`;
      } else {
        progressWrap.classList.add("hidden");
        reportWrap.classList.remove("hidden");
        renderDetail(scan);
      }
    } catch (e) { toast("Failed to load scan: " + e.message, "error"); }
  }

  function initDetailProgress(scan) {
    const pipelineEl = document.getElementById("detail-pipeline");
    const logEl = document.getElementById("detail-scan-log");
    const fillEl = document.getElementById("detail-progress-fill");
    const pctEl = document.getElementById("detail-progress-pct");

    $$(".pipeline-step", pipelineEl).forEach((s) => { s.className = "pipeline-step"; $(".step-sub", s).textContent = ""; });
    $$(".pipeline-connector", pipelineEl).forEach((c) => { c.className = "pipeline-connector"; });
    fillEl.style.width = "0%";
    pctEl.textContent = "0%";
    logEl.innerHTML = "";

    const addDetailLog = (text, level = "info") => {
      const d = document.createElement("div");
      d.className = `log-line ${level}`;
      const ts = new Date().toLocaleTimeString();
      d.innerHTML = `<span class="log-ts">[${ts}]</span> ${esc(text)}`;
      logEl.appendChild(d);
      logEl.scrollTop = logEl.scrollHeight;
    };

    const setDetailStep = (step, status, sub) => {
      const steps = $$(".pipeline-step", pipelineEl);
      const connectors = $$(".pipeline-connector", pipelineEl);
      steps.forEach((s, i) => {
        const n = i + 1;
        s.classList.remove("active", "done", "error");
        if (n < step) s.classList.add("done");
        else if (n === step) s.classList.add(status === "error" ? "error" : "active");
      });
      connectors.forEach((c, i) => {
        c.classList.remove("done", "active");
        if (i + 1 < step) c.classList.add("done");
        else if (i + 1 === step) c.classList.add("active");
      });
      if (sub && steps[step - 1]) $(".step-sub", steps[step - 1]).textContent = sub;
    };

    addDetailLog(`Monitoring scan for ${scan.org_alias}…`, "info");
    setDetailStep(1, "active", "Waiting for updates…");

    if (ws && ws.readyState === WebSocket.OPEN) {
      addDetailLog("Connected to scan engine", "info");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleWs(msg);
        if (msg.type === "progress") {
          const { step, percent, message } = msg;
          if (step) setDetailStep(step, "active", message);
          fillEl.style.width = `${percent}%`;
          pctEl.textContent = `${percent}%`;
          addDetailLog(message, "info");
        } else if (msg.type === "complete") {
          setDetailStep(4, "done");
          fillEl.style.width = "100%";
          pctEl.textContent = "100%";
          addDetailLog("Scan complete! Loading report…", "success");
          setTimeout(() => loadScanDetail(msg.scan_id || scan.id), 1500);
        } else if (msg.type === "error") {
          addDetailLog(msg.message, "error");
        }
      };
    } else {
      addDetailLog("Scan running in background. Will refresh when complete.", "info");
      pollScanStatus(scan.id);
    }
  }

  async function pollScanStatus(scanId) {
    const check = async () => {
      try {
        const scan = await api("GET", `/api/scans/${scanId}`);
        if (scan.status !== "running") { loadScanDetail(scanId); return; }
        setTimeout(check, 3000);
      } catch { setTimeout(check, 5000); }
    };
    setTimeout(check, 3000);
  }

  function renderDetail(scan) {
    const date = scan.started_at ? new Date(scan.started_at + "Z").toLocaleString() : "—";
    const findings = scan.findings || [];
    const totalFindings = findings.length;
    const resolved = findings.filter((f) => f.is_resolved).length;
    const healthScore = scan.health_score || 0;

    el.detail_subtitle.textContent =
      `${esc(scan.org_alias)} · ${date} · ${scan.total_components || 0} metadata components scanned`;

    // 5 stat cards
    el.detail_stats.innerHTML = `
      <div class="rstat accent">
        <div class="rstat-label">Health Score</div>
        <div class="rstat-num">${healthScore}<span style="font-size:.7rem;color:var(--text-3)">/100</span></div>
        <div class="rstat-trend ${healthScore >= 75 ? "up" : healthScore >= 60 ? "neutral" : "down"}">${healthScore >= 90 ? "Excellent" : healthScore >= 75 ? "Good" : healthScore >= 60 ? "Fair" : healthScore >= 40 ? "Poor" : "Critical"}</div>
      </div>
      <div class="rstat success">
        <div class="rstat-label">Resolved</div>
        <div class="rstat-num">${resolved}</div>
        <div class="rstat-trend ${resolved > 0 ? "up" : "neutral"}">${totalFindings > 0 ? Math.round(resolved / totalFindings * 100) : 0}% of findings</div>
      </div>
      <div class="rstat warning">
        <div class="rstat-label">Total Findings</div>
        <div class="rstat-num">${totalFindings}</div>
        <div class="rstat-trend neutral">${totalFindings - resolved} open</div>
      </div>
      <div class="rstat danger">
        <div class="rstat-label">Critical</div>
        <div class="rstat-num">${scan.critical_count || 0}</div>
        <div class="rstat-trend action">${(scan.critical_count || 0) > 0 ? "Action Required" : "No critical issues"}</div>
      </div>
      <div class="rstat info-r">
        <div class="rstat-label">Components</div>
        <div class="rstat-num">${fmtNum(scan.total_components || 0)}</div>
        <div class="rstat-trend neutral">Metadata scanned</div>
      </div>`;

    renderCharts(scan);

    el.detail_summary.innerHTML = `<h4>Executive Summary</h4><p>${esc(scan.summary || "No summary available.")}</p>`;

    // Populate category filter
    const catSet = new Set(findings.map((f) => f.category).filter(Boolean));
    el.filter_category.innerHTML = '<option value="">All Categories</option>';
    [...catSet].sort().forEach((c) => {
      el.filter_category.innerHTML += `<option>${esc(c)}</option>`;
    });

    renderFindingsTable(findings);
  }

  function fmtNum(n) { return n >= 1000 ? n.toLocaleString() : String(n); }

  /* ── Charts ──────────────────────────────────────────────────── */
  function renderCharts(scan) {
    if (sevChart) sevChart.destroy();
    if (catChart) catChart.destroy();

    // Severity bar chart
    const sevData = [scan.critical_count || 0, scan.high_count || 0, scan.medium_count || 0, scan.low_count || 0, scan.info_count || 0];
    const sevLabels = ["CRIT", "HIGH", "MED", "LOW", "INFO"];
    const sevColors = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#4F46E5"];

    sevChart = new Chart(document.getElementById("chart-severity"), {
      type: "bar",
      data: {
        labels: sevLabels,
        datasets: [{
          data: sevData,
          backgroundColor: sevColors.map((c) => c + "30"),
          borderColor: sevColors,
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.55,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#4B5563", font: { size: 11, weight: 600, family: "Inter" } } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" }, ticks: { color: "#9CA3AF", font: { size: 10 }, stepSize: 1 } },
        },
      },
    });

    // Category radar chart
    let categoryScores = {};
    try { categoryScores = JSON.parse(scan.category_scores || "{}"); } catch { categoryScores = {}; }
    const catLabels = Object.keys(categoryScores);
    const catData = Object.values(categoryScores);

    if (catLabels.length > 0) {
      catChart = new Chart(document.getElementById("chart-category"), {
        type: "radar",
        data: {
          labels: catLabels,
          datasets: [{
            label: "Score",
            data: catData,
            backgroundColor: "rgba(208,74,2,.12)",
            borderColor: "#D04A02",
            borderWidth: 2,
            pointBackgroundColor: "#D04A02",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: { stepSize: 25, font: { size: 9 }, color: "#9CA3AF", backdropColor: "transparent" },
              grid: { color: "rgba(0,0,0,.06)" },
              angleLines: { color: "rgba(0,0,0,.06)" },
              pointLabels: { font: { size: 10, weight: 600, family: "Inter" }, color: "#4B5563" },
            },
          },
        },
      });
    } else {
      const ctx = document.getElementById("chart-category").getContext("2d");
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = "#9CA3AF";
      ctx.font = "500 12px Inter";
      ctx.textAlign = "center";
      ctx.fillText("No category scores available", ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
  }

  /* ── Findings table ──────────────────────────────────────────── */
  function getFilteredFindings(findings) {
    let list = [...findings];
    const sevFilter = el.filter_severity.value;
    const catFilter = el.filter_category.value;
    const unresolvedOnly = el.filter_unresolved.checked;
    const search = (el.inv_search.value || "").toLowerCase().trim();
    if (sevFilter) list = list.filter((f) => f.severity === sevFilter);
    if (catFilter) list = list.filter((f) => f.category === catFilter);
    if (unresolvedOnly) list = list.filter((f) => !f.is_resolved);
    if (search) list = list.filter((f) =>
      (f.title || "").toLowerCase().includes(search) ||
      (f.category || "").toLowerCase().includes(search) ||
      (f.description || "").toLowerCase().includes(search) ||
      (f.affected_components || []).some((c) => c.toLowerCase().includes(search))
    );
    return list;
  }

  function renderFindingsTable(findings) {
    const filtered = getFilteredFindings(findings);
    const totalPages = Math.max(1, Math.ceil(filtered.length / INV_PER_PAGE));
    if (invPage > totalPages) invPage = totalPages;
    const start = (invPage - 1) * INV_PER_PAGE;
    const pageItems = filtered.slice(start, start + INV_PER_PAGE);

    if (filtered.length === 0) {
      el.inv_tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-3)">No findings match your filter.</td></tr>`;
      el.inv_footer.innerHTML = "";
      return;
    }

    el.inv_tbody.innerHTML = pageItems.map((f, idx) => {
      const sev = (f.severity || "Info").toLowerCase();
      const sevLabel = (f.severity || "Info").toUpperCase();
      const resolved = f.is_resolved;
      const effort = f.effort || "";
      const effortCls = effort.toLowerCase().includes("quick") ? "quick" : effort.toLowerCase().includes("large") ? "large" : "medium-effort";
      const comps = (f.affected_components || []);
      const compsHtml = comps.map((c) => `<span class="comp-tag">${esc(c)}</span>`).join("");

      return `
        <tr class="inv-row${resolved ? " resolved-row" : ""}" data-idx="${start + idx + 1}">
          <td><span class="inv-id">FND-${String(f.id).padStart(4, "0")}</span></td>
          <td><span class="inv-name">${esc(f.title || "Untitled")}</span></td>
          <td><span class="sev-text ${sev}">${sevLabel}</span></td>
          <td>${esc(f.category || "—")}</td>
          <td>${effort ? `<span class="effort-tag ${effortCls}">${esc(effort)}</span>` : "—"}</td>
          <td>
            <div class="status-indicator">
              <div class="status-bar"><div class="status-bar-fill ${resolved ? "resolved" : "open"}"></div></div>
              <span class="status-label ${resolved ? "resolved" : "open"}">${resolved ? "Resolved" : "Open"}</span>
            </div>
          </td>
          <td><button class="inv-details-link" data-fnd-id="${f.id}">Details</button></td>
        </tr>
        <tr class="inv-detail-row" id="inv-detail-${f.id}">
          <td colspan="7">
            <div class="inv-detail-inner">
              <div class="inv-detail-grid">
                <div class="inv-detail-section">
                  <h5>Description</h5>
                  <p>${esc(f.description || "No details available.")}</p>
                  ${compsHtml ? `<div style="margin-top:.6rem"><h5>Affected Components</h5><div class="inv-detail-components">${compsHtml}</div></div>` : ""}
                </div>
                <div class="inv-detail-section">
                  <h5>Recommendation</h5>
                  <div class="inv-detail-remed">${formatRemediation(f.recommendation)}</div>
                </div>
              </div>
              <div class="inv-detail-actions">
                <button class="btn btn-sm btn-resolve${resolved ? " resolved" : ""}" data-finding-id="${f.id}" data-resolved="${resolved ? 1 : 0}">
                  ${resolved ? "Resolved" : "Mark as Resolved"}
                </button>
              </div>
            </div>
          </td>
        </tr>`;
    }).join("");

    // Pagination
    const showStart = start + 1;
    const showEnd = Math.min(start + INV_PER_PAGE, filtered.length);
    let paginationBtns = "";
    if (totalPages > 1) {
      paginationBtns += `<button class="inv-page-btn" data-p="prev" ${invPage <= 1 ? "disabled" : ""}>Prev</button>`;
      for (let p = 1; p <= totalPages; p++) {
        paginationBtns += `<button class="inv-page-btn${p === invPage ? " active" : ""}" data-p="${p}">${p}</button>`;
      }
      paginationBtns += `<button class="inv-page-btn" data-p="next" ${invPage >= totalPages ? "disabled" : ""}>Next</button>`;
    }
    el.inv_footer.innerHTML = `
      <span class="inv-page-info">Showing ${showStart} to ${showEnd} of ${filtered.length} entries</span>
      <div class="inv-page-btns">${paginationBtns}</div>`;

    bindFindingEvents(findings, totalPages);
  }

  function bindFindingEvents(findings, totalPages) {
    const tbody = el.inv_tbody;

    $$(".inv-details-link", tbody).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.fndId;
        const detailRow = document.getElementById(`inv-detail-${id}`);
        const isOpen = detailRow.classList.contains("open");
        $$(".inv-detail-row", tbody).forEach((r) => r.classList.remove("open"));
        if (!isOpen) detailRow.classList.add("open");
      });
    });

    $$(".inv-row", tbody).forEach((row) => {
      row.addEventListener("click", () => {
        const link = $(".inv-details-link", row);
        if (link) link.click();
      });
    });

    $$(".btn-resolve", tbody).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.findingId;
        const isResolved = btn.dataset.resolved === "1";
        try {
          await api("POST", `/api/findings/${id}/${isResolved ? "unresolve" : "resolve"}`);
          const scan = await api("GET", `/api/scans/${detailData.id}`);
          detailData = scan;
          renderDetail(scan);
          toast(isResolved ? "Marked as unresolved" : "Marked as resolved", "success");
        } catch (e) { toast(e.message, "error"); }
      });
    });

    $$(".inv-page-btn", el.inv_footer).forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.p;
        if (p === "prev") invPage = Math.max(1, invPage - 1);
        else if (p === "next") invPage = Math.min(totalPages, invPage + 1);
        else invPage = parseInt(p);
        renderFindingsTable(findings);
      });
    });
  }

  /* ── Export PDF ──────────────────────────────────────────────── */
  window.__exportReport = async function () {
    if (!detailData) return;
    toast("Generating PDF report…", "info");
    try {
      const scan = detailData;
      const findings = scan.findings || [];
      const date = scan.started_at ? new Date(scan.started_at + "Z").toLocaleString() : "N/A";

      const PW = { orange: [208, 74, 2], black: [26, 26, 46], gray: [75, 85, 99], light: [156, 163, 175], white: [255, 255, 255], line: [229, 231, 235] };
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const usable = W - margin * 2;
      let y = 0;

      function addFooter() {
        pdf.setDrawColor(...PW.line);
        pdf.line(margin, H - 14, W - margin, H - 14);
        pdf.setFontSize(7); pdf.setTextColor(...PW.light);
        pdf.text("\u00A9 2026 PwC. All rights reserved.", W / 2, H - 9, { align: "center" });
        pdf.text(`Page ${pdf.getNumberOfPages()}`, W - margin, H - 9, { align: "right" });
      }

      function checkPage(need) {
        if (y + need > H - 20) { addFooter(); pdf.addPage(); y = 22; return true; }
        return false;
      }

      // Cover
      pdf.setFillColor(...PW.orange);
      pdf.rect(0, 0, W, 6, "F");
      y = 38;
      pdf.setFillColor(...PW.orange);
      pdf.rect(margin, y, 3, 20, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(28); pdf.setTextColor(...PW.black);
      pdf.text("Org Health Report", margin + 8, y + 9);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.setTextColor(...PW.gray);
      pdf.text("Proactive Monitoring Assessment", margin + 8, y + 17);

      y += 32;
      pdf.setFontSize(9); pdf.setTextColor(...PW.light);
      pdf.text(`Org: ${scan.org_alias}`, margin, y);
      pdf.text(`Health Score: ${scan.health_score}/100`, margin, y + 5);
      pdf.text(`Generated: ${date}`, margin, y + 10);
      pdf.text(`Total Findings: ${findings.length}`, margin, y + 15);

      y += 28;
      // Summary
      pdf.setFillColor(...PW.orange);
      pdf.rect(margin, y, 2.5, 6, "F");
      pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...PW.black);
      pdf.text("Executive Summary", margin + 6, y + 5);
      y += 10;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...PW.gray);
      const summaryLines = pdf.splitTextToSize(scan.summary || "No summary.", usable - 4);
      summaryLines.forEach((line) => { checkPage(5); pdf.text(line, margin + 2, y); y += 4; });

      addFooter();

      // Findings table
      pdf.addPage();
      y = 18;
      pdf.setFillColor(...PW.orange);
      pdf.rect(0, 0, W, 4, "F");
      pdf.setFillColor(...PW.orange);
      pdf.rect(margin, y, 2.5, 6, "F");
      pdf.setFontSize(13); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...PW.black);
      pdf.text("Detailed Findings", margin + 6, y + 5);
      y += 12;

      const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
      const sorted = [...findings].sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));

      pdf.autoTable({
        startY: y,
        head: [["#", "Finding", "Severity", "Category", "Effort", "Status"]],
        body: sorted.map((f) => [
          `FND-${String(f.id).padStart(4, "0")}`,
          (f.title || "Untitled").substring(0, 50),
          (f.severity || "Info").toUpperCase(),
          f.category || "—",
          f.effort || "—",
          f.is_resolved ? "Resolved" : "Open",
        ]),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [229, 231, 235], lineWidth: 0.25, textColor: PW.gray, font: "helvetica" },
        headStyles: { fillColor: PW.orange, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        margin: { left: margin, right: margin },
        didDrawPage: function () { addFooter(); pdf.setFillColor(...PW.orange); pdf.rect(0, 0, W, 4, "F"); },
      });

      const filename = `Org-Health-Report-${scan.org_alias.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
      toast("PDF downloaded!", "success");
    } catch (err) {
      console.error("PDF export failed:", err);
      toast("Failed to generate PDF: " + err.message, "error");
    }
  };

  /* ── Settings ────────────────────────────────────────────────── */
  async function loadSettings() {
    try {
      const s = await api("GET", "/api/settings");
      if (s.api_key_set) {
        el.s_api_hint.textContent = `Current key: ${s.api_key_masked}`;
        el.s_api_hint.style.color = "var(--success)";
      } else {
        el.s_api_hint.textContent = "No API key configured";
        el.s_api_hint.style.color = "var(--text-3)";
      }
      el.s_model.value = s.model;
    } catch {}
    try {
      const o = await api("GET", "/api/orgs");
      if (o.orgs.length === 0) {
        el.s_org_list.innerHTML = '<div class="empty-state" style="padding:1rem"><p>No orgs connected.</p></div>';
      } else {
        el.s_org_list.innerHTML = o.orgs.map((org) => `
          <div class="org-row">
            <div class="org-row-info"><strong>${esc(org.alias)}</strong><span>${esc(org.username || "")} · ${esc(org.instance_url || "")}</span></div>
            <button class="btn btn-ghost btn-sm btn-danger-text btn-remove-org" data-id="${org.id}">Remove</button>
          </div>`).join("");
        $$(".btn-remove-org", el.s_org_list).forEach((btn) => {
          btn.addEventListener("click", async () => {
            try { await api("DELETE", `/api/orgs/${btn.dataset.id}`); toast("Org removed", "info"); loadSettings(); refreshTopbar(); } catch (e) { toast(e.message, "error"); }
          });
        });
      }
    } catch {}
  }

  /* ── Topbar / Sidebar status ─────────────────────────────────── */
  async function refreshTopbar() {
    try {
      const s = await api("GET", "/api/settings");
      const modelLabel = { "gemini-3.1-pro-preview": "Gemini 3.1 Pro", "gemini-3-pro-preview": "Gemini 3 Pro", "gemini-2.5-pro": "Gemini 2.5 Pro" }[s.model] || s.model;
      $("span", el.tb_model).textContent = s.api_key_set ? modelLabel : "No API Key";
    } catch {}
    try {
      const o = await api("GET", "/api/orgs");
      const dot = $(".conn-dot", el.sidebar_status);
      const label = $(".conn-label", el.sidebar_status);
      const tbDot = $(".conn-dot", el.tb_org);
      const tbLabel = $("span:last-child", el.tb_org);
      if (o.orgs.length > 0) {
        const org = o.orgs[0];
        dot.className = "conn-dot connected";
        label.textContent = org.username || org.alias;
        tbDot.className = "conn-dot connected";
        tbDot.style.width = "7px"; tbDot.style.height = "7px";
        tbLabel.textContent = org.username || org.alias;
      } else {
        dot.className = "conn-dot disconnected";
        label.textContent = "No org connected";
        tbDot.className = "conn-dot disconnected";
        tbDot.style.width = "7px"; tbDot.style.height = "7px";
        tbLabel.textContent = "Not connected";
      }
    } catch {}
  }

  /* ── Utility ─────────────────────────────────────────────────── */
  function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function formatRemediation(raw) {
    if (!raw) return '<span style="color:var(--text-3)">No recommendation provided.</span>';
    const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const stepPattern = /^(?:\d+[\.\)\:]|Step\s+\d+|[-•])\s*/i;
    const steps = [];
    let current = "";
    for (const line of lines) {
      if (stepPattern.test(line)) {
        if (current) steps.push(current);
        current = line.replace(stepPattern, "").trim();
      } else if (current) {
        current += " " + line;
      } else {
        current = line;
      }
    }
    if (current) steps.push(current);
    if (steps.length > 1) {
      return '<ol class="remed-list">' + steps.map((s) => `<li>${esc(s)}</li>`).join("") + "</ol>";
    }
    const fallback = raw.split(/\d+[\.\)]\s*/).filter(Boolean).map((s) => s.trim()).filter(Boolean);
    if (fallback.length > 1) {
      return '<ol class="remed-list">' + fallback.map((s) => `<li>${esc(s)}</li>`).join("") + "</ol>";
    }
    const sentenceSplit = raw.split(/\.\s+/).filter(Boolean).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
    if (sentenceSplit.length >= 2) {
      return '<ol class="remed-list">' + sentenceSplit.map((s) => `<li>${esc(s)}.</li>`).join("") + "</ol>";
    }
    return '<ol class="remed-list"><li>' + esc(raw) + '</li></ol>';
  }

  /* ── Event bindings ──────────────────────────────────────────── */
  function bindEvents() {
    el.dash_new_scan_btn.addEventListener("click", () => navigate("new-scan"));
    el.qa_new_scan.addEventListener("click", () => navigate("new-scan"));
    el.qa_connect_org.addEventListener("click", () => navigate("settings"));
    el.qa_settings.addEventListener("click", () => navigate("settings"));
    el.scans_new_btn.addEventListener("click", () => navigate("new-scan"));

    el.start_scan_btn.addEventListener("click", startScan);
    el.detail_back_btn.addEventListener("click", () => navigate("scans"));
    el.export_report_btn.addEventListener("click", () => window.__exportReport());

    let filterTimer;
    const applyFilters = () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        if (detailData) { invPage = 1; renderFindingsTable(detailData.findings || []); }
      }, 200);
    };
    el.filter_severity.addEventListener("change", applyFilters);
    el.filter_category.addEventListener("change", applyFilters);
    el.filter_unresolved.addEventListener("change", applyFilters);
    el.inv_search.addEventListener("input", applyFilters);

    el.s_save_key_btn.addEventListener("click", async () => {
      const key = el.s_api_key.value.trim();
      if (!key) { toast("Enter an API key", "error"); return; }
      try {
        el.s_save_key_btn.disabled = true;
        el.s_save_key_btn.innerHTML = '<span class="spinner"></span>';
        await api("POST", "/api/settings/apikey", { api_key: key, model: el.s_model.value });
        toast("API key saved", "success");
        el.s_api_key.value = "";
        loadSettings(); refreshTopbar();
      } catch (e) { toast(e.message, "error"); }
      finally { el.s_save_key_btn.disabled = false; el.s_save_key_btn.textContent = "Save Key"; }
    });

    el.s_remove_key_btn.addEventListener("click", async () => {
      try { await api("DELETE", "/api/settings/apikey"); toast("API key removed", "info"); loadSettings(); refreshTopbar(); } catch (e) { toast(e.message, "error"); }
    });

    el.s_model.addEventListener("change", async () => {
      try { await api("PUT", "/api/settings/model", { model: el.s_model.value }); toast("Model updated", "success"); refreshTopbar(); } catch (e) { toast(e.message, "error"); }
    });

    el.s_connect_btn.addEventListener("click", async () => {
      const alias = el.s_org_alias.value.trim() || "org-health-agent-org";
      const sandbox = el.s_sandbox.checked;
      try {
        el.s_connect_btn.disabled = true;
        el.s_connect_btn.innerHTML = '<span class="spinner"></span> Connecting…';
        toast("Opening Salesforce login in your browser…", "info");
        await api("POST", "/api/orgs/connect", { alias, instance_url: "https://login.salesforce.com", sandbox });
        toast("Org connected!", "success"); loadSettings(); refreshTopbar();
      } catch (e) { toast("Connection failed: " + e.message, "error"); }
      finally { el.s_connect_btn.disabled = false; el.s_connect_btn.textContent = "Connect New Org"; }
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    initNav();
    bindEvents();
    refreshTopbar();
    navigate("dashboard");
  });
})();
