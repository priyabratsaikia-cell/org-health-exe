import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import type { Scan } from '@/api/types';
import { fmtShortDate } from '@/utils/formatters';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

interface Props {
  history: Scan[];
}

export default function TrendChart({ history }: Props) {
  const { state } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const isLight = state.resolvedTheme === 'light';
  const data = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
  }));
  const avg = data.length > 0 ? Math.round(data.reduce((a, b) => a + b.score, 0) / data.length) : 0;
  const latest = data.length > 0 ? data[data.length - 1].score : 0;
  const prev = data.length >= 2 ? data[data.length - 2].score : latest;
  const delta = latest - prev;
  const direction = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'remained stable';
  const gridStroke = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const cursorFill = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';

  if (data.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Health Score Trend</h4>
        <div className="h-48 flex items-center justify-center text-sm" style={{ color: C.gray60 }}>Run scans to see your health trend</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Health Score Trend</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="date" tick={{ fill: C.gray50, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: C.gray50, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 12, color: C.gray10 }}
              labelStyle={{ color: C.gray30 }}
              itemStyle={{ color: C.blue40 }}
            />
            <ReferenceLine y={avg} stroke="rgba(99,102,241,0.4)" strokeDasharray="6 4" label={{ value: `Avg ${avg}`, fill: '#6366F1', fontSize: 9, position: 'right' }} />
            <Line type="monotone" dataKey="score" stroke={C.blue60} strokeWidth={2.5} dot={{ fill: C.blue60, strokeWidth: 2, stroke: C.gray90, r: 4 }} activeDot={{ r: 6, stroke: C.blue60, strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
        <AgentPulse size="sm" />
        <p className="text-[11px] leading-relaxed" style={{ color: C.gray40 }}>
          Your org health <strong style={{ color: C.gray30 }}>{direction}</strong> from {prev} to {latest} ({delta > 0 ? '+' : ''}{delta} pts). Average across {data.length} scans is {avg}.
        </p>
      </div>
    </GlassCard>
  );
}
