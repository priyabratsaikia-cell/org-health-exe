import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { Scan } from '@/api/types';
import { fmtShortDate } from '@/utils/formatters';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import { useColors, useApp } from '@/context/AppContext';

interface Props {
  history: Scan[];
}

export default function ActivityChart({ history }: Props) {
  const C = useColors();
  const { state } = useApp();
  const isLight = state.resolvedTheme === 'light';
  const gridStroke = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  if (history.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Resolution Progress</h4>
        <div className="h-48 flex items-center justify-center text-sm" style={{ color: C.gray60 }}>No scan data yet</div>
      </GlassCard>
    );
  }

  const data = history.map(s => {
    const resolved = s.resolved_count ?? 0;
    const total = s.total_findings || 0;
    return {
      date: fmtShortDate(s.started_at),
      resolved,
      unresolved: Math.max(0, total - resolved),
      total,
    };
  });

  const latest = data[data.length - 1];
  const first = data[0];
  const latestRate = latest.total > 0 ? Math.round(latest.resolved / latest.total * 100) : 0;
  const firstRate = first.total > 0 ? Math.round(first.resolved / first.total * 100) : 0;
  const rateDelta = latestRate - firstRate;

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Resolution Progress</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="unresolvedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F97316" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#F97316" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="date" tick={{ fill: C.gray50, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.gray50, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 12, color: C.gray10 }}
              formatter={(value, name) => [value, name === 'resolved' ? 'Resolved' : 'Unresolved']}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-[10px]" style={{ color: C.gray40 }}>
                  {value === 'resolved' ? 'Resolved' : 'Unresolved'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              stackId="1"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#resolvedGrad)"
            />
            <Area
              type="monotone"
              dataKey="unresolved"
              stackId="1"
              stroke="#F97316"
              strokeWidth={2}
              fill="url(#unresolvedGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
        <AgentPulse size="sm" />
        <p className="text-[11px] leading-relaxed" style={{ color: C.gray40 }}>
          Resolution rate is <strong style={{ color: latestRate >= 50 ? C.green40 : '#F97316' }}>{latestRate}%</strong>
          {data.length > 1 && (
            <>{' '}({rateDelta > 0 ? '+' : ''}{rateDelta}% since first scan)</>
          )}.{' '}
          {latest.unresolved > 0
            ? <><strong style={{ color: '#F97316' }}>{latest.unresolved}</strong> findings still open.</>
            : <strong style={{ color: C.green40 }}>All findings resolved!</strong>
          }
        </p>
      </div>
    </GlassCard>
  );
}
