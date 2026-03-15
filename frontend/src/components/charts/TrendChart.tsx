import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import type { Scan } from '@/api/types';
import { fmtShortDate } from '@/utils/formatters';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';

interface Props {
  history: Scan[];
}

export default function TrendChart({ history }: Props) {
  const data = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
  }));
  const avg = data.length > 0 ? Math.round(data.reduce((a, b) => a + b.score, 0) / data.length) : 0;
  const latest = data.length > 0 ? data[data.length - 1].score : 0;
  const prev = data.length >= 2 ? data[data.length - 2].score : latest;
  const delta = latest - prev;
  const direction = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'remained stable';

  if (data.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Health Score Trend</h4>
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Run scans to see your health trend</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-3">Health Score Trend</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#9CA3AF' }}
              itemStyle={{ color: '#F97316' }}
            />
            <ReferenceLine y={avg} stroke="rgba(99,102,241,0.4)" strokeDasharray="6 4" label={{ value: `Avg ${avg}`, fill: '#6366F1', fontSize: 9, position: 'right' }} />
            <Line type="monotone" dataKey="score" stroke="#D04A02" strokeWidth={2.5} dot={{ fill: '#D04A02', strokeWidth: 2, stroke: '#111827', r: 4 }} activeDot={{ r: 6, stroke: '#D04A02', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Your org health <strong className="text-gray-300">{direction}</strong> from {prev} to {latest} ({delta > 0 ? '+' : ''}{delta} pts). Average across {data.length} scans is {avg}.
        </p>
      </div>
    </GlassCard>
  );
}
