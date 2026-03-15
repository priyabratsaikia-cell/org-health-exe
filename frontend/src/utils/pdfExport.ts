import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scan, Finding } from '@/api/types';

export function exportReport(scan: Scan, findings: Finding[]) {
  const date = scan.started_at ? new Date(scan.started_at + 'Z').toLocaleString() : 'N/A';
  const PW = { orange: [208, 74, 2] as const, black: [26, 26, 46] as const, gray: [75, 85, 99] as const, light: [156, 163, 175] as const, line: [229, 231, 235] as const };

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usable = W - margin * 2;
  let y = 0;

  function addFooter() {
    pdf.setDrawColor(...PW.line);
    pdf.line(margin, H - 14, W - margin, H - 14);
    pdf.setFontSize(7);
    pdf.setTextColor(...PW.light);
    pdf.text('\u00A9 2026 PwC. All rights reserved.', W / 2, H - 9, { align: 'center' });
    pdf.text(`Page ${pdf.getNumberOfPages()}`, W - margin, H - 9, { align: 'right' });
  }

  function checkPage(need: number) {
    if (y + need > H - 20) { addFooter(); pdf.addPage(); y = 22; return true; }
    return false;
  }

  function sectionHeader(title: string) {
    checkPage(12);
    pdf.setFillColor(...PW.orange);
    pdf.rect(margin, y, 2.5, 6, 'F');
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...PW.black);
    pdf.text(title, margin + 6, y + 5);
    y += 10;
  }

  // ── Page 1: Title + Summary ──────────────────────────────────────────
  pdf.setFillColor(...PW.orange);
  pdf.rect(0, 0, W, 6, 'F');
  y = 38;
  pdf.setFillColor(...PW.orange);
  pdf.rect(margin, y, 3, 20, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(28); pdf.setTextColor(...PW.black);
  pdf.text('Org Health Report', margin + 8, y + 9);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(...PW.gray);
  pdf.text('Proactive Monitoring Assessment', margin + 8, y + 17);

  y += 32;
  pdf.setFontSize(9); pdf.setTextColor(...PW.light);
  pdf.text(`Org: ${scan.org_alias}`, margin, y);
  pdf.text(`Health Score: ${scan.health_score}/100`, margin, y + 5);
  pdf.text(`Generated: ${date}`, margin, y + 10);
  pdf.text(`Total Findings: ${findings.length}`, margin, y + 15);

  // Parameter coverage
  let paramCoverage: any = null;
  try { paramCoverage = scan.parameter_coverage_json ? JSON.parse(scan.parameter_coverage_json) : null; } catch {}
  if (paramCoverage) {
    pdf.text(`Parameters Assessed: ${paramCoverage.assessed}/${paramCoverage.total} (${Math.round(paramCoverage.assessed / paramCoverage.total * 100)}%)`, margin, y + 20);
    y += 30;
  } else {
    y += 25;
  }

  // Executive Summary
  sectionHeader('Executive Summary');
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...PW.gray);
  const summaryLines = pdf.splitTextToSize(scan.summary || 'No summary.', usable - 4);
  summaryLines.forEach((line: string) => { checkPage(5); pdf.text(line, margin + 2, y); y += 4; });

  y += 6;

  // ── Category Score Breakdown ──────────────────────────────────────
  let catScores: Record<string, number> = {};
  try { catScores = JSON.parse(scan.category_scores || '{}'); } catch {}
  if (Object.keys(catScores).length > 0) {
    sectionHeader('Category Health Scores');

    const catEntries = Object.entries(catScores).sort((a, b) => a[1] - b[1]);
    autoTable(pdf, {
      startY: y,
      head: [['Category', 'Score', 'Status']],
      body: catEntries.map(([name, score]) => [
        name,
        `${score}/100`,
        score >= 90 ? 'HEALTHY' : score >= 70 ? 'NEEDS ATTENTION' : score >= 50 ? 'AT RISK' : 'CRITICAL',
      ]),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0.25, textColor: [...PW.gray] as [number, number, number], font: 'helvetica' },
      headStyles: { fillColor: [...PW.orange] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      margin: { left: margin, right: margin },
      didDrawPage() { addFooter(); pdf.setFillColor(...PW.orange); pdf.rect(0, 0, W, 4, 'F'); },
    });

    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // ── Governor Limits Summary ──────────────────────────────────────
  let govLimits: any[] = [];
  try { govLimits = scan.governor_limits_json ? JSON.parse(scan.governor_limits_json) : []; } catch {}
  const criticalLimits = govLimits.filter((l: any) => (l.LastPercentOfLimit__c ?? 0) >= 70);
  if (criticalLimits.length > 0) {
    checkPage(30);
    sectionHeader('Governor Limits (>70% Usage)');

    autoTable(pdf, {
      startY: y,
      head: [['Limit', 'Usage %', 'Threshold']],
      body: criticalLimits
        .sort((a: any, b: any) => (b.LastPercentOfLimit__c ?? 0) - (a.LastPercentOfLimit__c ?? 0))
        .slice(0, 20)
        .map((l: any) => [
          l.Name || l.LimitKey__c,
          `${(l.LastPercentOfLimit__c ?? 0).toFixed(1)}%`,
          `${((l.AlertThreshold__c ?? 0.75) * 100).toFixed(0)}%`,
        ]),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0.25, textColor: [...PW.gray] as [number, number, number], font: 'helvetica' },
      headStyles: { fillColor: [...PW.orange] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      margin: { left: margin, right: margin },
      didDrawPage() { addFooter(); pdf.setFillColor(...PW.orange); pdf.rect(0, 0, W, 4, 'F'); },
    });

    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // ── Code Analysis Summary ──────────────────────────────────────
  let codeAnalysis: any = null;
  try { codeAnalysis = scan.code_analysis_json ? JSON.parse(scan.code_analysis_json) : null; } catch {}
  if (codeAnalysis && codeAnalysis.status === 'completed' && codeAnalysis.issues_found > 0) {
    checkPage(30);
    sectionHeader('Static Code Analysis');

    const patternEntries = Object.entries(codeAnalysis.findings_by_pattern || {}).sort((a: any, b: any) => b[1] - a[1]);
    if (patternEntries.length > 0) {
      const labels: Record<string, string> = {
        soql_in_loops: 'SOQL in Loops', dml_in_loops: 'DML in Loops', hardcoded_ids: 'Hardcoded IDs',
        empty_catch_blocks: 'Empty Catch Blocks', soql_injection: 'SOQL Injection', missing_sharing: 'Missing Sharing',
        see_all_data: 'SeeAllData=true', system_debug_overuse: 'Debug Overuse',
        describe_in_loops: 'Describe in Loops', csrf_dml_constructor: 'CSRF Risk',
      };

      autoTable(pdf, {
        startY: y,
        head: [['Pattern', 'Occurrences']],
        body: patternEntries.map(([pat, count]) => [labels[pat] || pat, String(count)]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0.25, textColor: [...PW.gray] as [number, number, number], font: 'helvetica' },
        headStyles: { fillColor: [...PW.orange] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        margin: { left: margin, right: margin },
        didDrawPage() { addFooter(); pdf.setFillColor(...PW.orange); pdf.rect(0, 0, W, 4, 'F'); },
      });

      y = (pdf as any).lastAutoTable.finalY + 8;
    }
  }

  addFooter();

  // ── Findings Page ──────────────────────────────────────────────
  pdf.addPage();
  y = 18;
  pdf.setFillColor(...PW.orange);
  pdf.rect(0, 0, W, 4, 'F');
  pdf.setFillColor(...PW.orange);
  pdf.rect(margin, y, 2.5, 6, 'F');
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...PW.black);
  pdf.text('Detailed Findings', margin + 6, y + 5);
  y += 12;

  const sevOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
  const sorted = [...findings].sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));

  autoTable(pdf, {
    startY: y,
    head: [['#', 'Finding', 'Severity', 'Category', 'Effort', 'Status']],
    body: sorted.map(f => [
      `FND-${String(f.id).padStart(4, '0')}`,
      (f.title || 'Untitled').substring(0, 50),
      (f.severity || 'Info').toUpperCase(),
      f.category || '\u2014',
      f.effort || '\u2014',
      f.is_resolved ? 'Resolved' : 'Open',
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0.25, textColor: [...PW.gray] as [number, number, number], font: 'helvetica' },
    headStyles: { fillColor: [...PW.orange] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    margin: { left: margin, right: margin },
    didDrawPage() { addFooter(); pdf.setFillColor(...PW.orange); pdf.rect(0, 0, W, 4, 'F'); },
  });

  const filename = `Org-Health-Report-${scan.org_alias.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
