import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import { useColors } from '@/context/AppContext';
import type { DrillFilter } from '@/api/types';

interface Props {
  effortDistribution: { effort: string; cnt: number }[];
  onDrill?: (filter: DrillFilter) => void;
}

const EFFORT_COLORS: Record<string, string> = {
  Low: '#10B981',
  Medium: '#EAB308',
  High: '#F97316',
};

const EFFORT_REMAP: Record<string, string> = {
  'Quick Fix': 'Low',
  Medium: 'Medium',
  Large: 'High',
  Low: 'Low',
  High: 'High',
};

export default function EffortPolar({ effortDistribution, onDrill }: Props) {
  const C = useColors();
  const total = effortDistribution.reduce((a, e) => a + e.cnt, 0);

  if (total === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Remediation Effort</h4>
        <div className="h-48 flex items-center justify-center text-sm" style={{ color: C.gray60 }}>No effort data yet</div>
      </GlassCard>
    );
  }

  const effortMap: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
  effortDistribution.forEach(e => {
    const mapped = EFFORT_REMAP[e.effort] ?? e.effort;
    if (mapped in effortMap) effortMap[mapped] += e.cnt;
  });
  const data = Object.entries(effortMap).map(([name, value]) => ({ name, value }));
  const lowPct = total > 0 ? Math.round(effortMap.Low / total * 100) : 0;

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold mb-1" style={{ color: C.gray10 }}>Remediation Effort</h4>
      <p className="text-[10px] mb-3" style={{ color: C.gray50 }}>Click to filter by effort level</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius="75%"
              dataKey="value"
              stroke="none"
              cursor="pointer"
              onClick={(_, idx) => {
                const entry = data[idx];
                if (entry && onDrill) onDrill({ type: 'effort', value: entry.name, label: `${entry.name} Effort Findings` });
              }}
            >
              {data.map(entry => (
                <Cell key={entry.name} fill={EFFORT_COLORS[entry.name] || '#6F6F6F'} opacity={0.7} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 12, color: C.gray10 }}
              formatter={(value, name) => [`${value} findings`, name]}
            />
            <Legend
              formatter={(value) => <span className="text-[10px]" style={{ color: C.gray40 }}>{value}</span>}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
        <AgentPulse size="sm" />
        <p className="text-[11px] leading-relaxed" style={{ color: C.gray40 }}>
          <strong style={{ color: C.green40 }}>{lowPct}%</strong> are Low effort. {effortMap.High} require High effort.
        </p>
      </div>
    </GlassCard>
  );
}
