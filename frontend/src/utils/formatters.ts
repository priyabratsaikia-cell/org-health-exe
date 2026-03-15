export function fmtNum(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString();
}

export function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatRemediation(raw: string | null): string[] {
  if (!raw) return ['No recommendation provided.'];
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  const stepPattern = /^(?:\d+[.):]|Step\s+\d+|[-•])\s*/i;
  const steps: string[] = [];
  let current = '';
  for (const line of lines) {
    if (stepPattern.test(line)) {
      if (current) steps.push(current);
      current = line.replace(stepPattern, '').trim();
    } else if (current) {
      current += ' ' + line;
    } else {
      current = line;
    }
  }
  if (current) steps.push(current);
  if (steps.length > 1) return steps;
  const fallback = raw.split(/\d+[.)]\s*/).filter(Boolean).map(s => s.trim()).filter(Boolean);
  if (fallback.length > 1) return fallback;
  return [raw];
}
