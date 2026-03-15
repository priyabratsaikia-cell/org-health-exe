export function scoreClass(score: number): string {
  if (score >= 90) return 'healthy';
  if (score >= 70) return 'attention';
  if (score >= 50) return 'at-risk';
  return 'critical';
}

export function scoreGrade(score: number): string {
  if (score >= 90) return 'Healthy';
  if (score >= 70) return 'Needs Attention';
  if (score >= 50) return 'At Risk';
  return 'Critical';
}

export function scoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 70) return '#22C55E';
  if (score >= 50) return '#EAB308';
  return '#EF4444';
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#EAB308',
    Low: '#22C55E',
    Info: '#6366F1',
  };
  return map[severity] || '#6B7280';
}

export function severityBg(severity: string): string {
  const map: Record<string, string> = {
    Critical: 'rgba(239, 68, 68, 0.12)',
    High: 'rgba(249, 115, 22, 0.12)',
    Medium: 'rgba(234, 179, 8, 0.12)',
    Low: 'rgba(34, 197, 94, 0.12)',
    Info: 'rgba(99, 102, 241, 0.12)',
  };
  return map[severity] || 'rgba(107, 114, 128, 0.12)';
}
