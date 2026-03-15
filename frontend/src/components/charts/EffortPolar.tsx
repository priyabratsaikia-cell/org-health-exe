import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';

interface Props {
  effortDistribution: { effort: string; cnt: number }[];
  onDrill?: (filter: DrillFilter) => void;
}

const EFFORT_COLORS: Record<string, string> = {
  'Quick Fix': '#10B981',
  Medium: '#EAB308',
  Large: '#F97316',
};

export default function EffortPolar({ effortDistribution, onDrill }: Props) {
  const total = effortDistribution.reduce((a, e) => a + e.cnt, 0);

  if (total === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Remediation Effort</h4>
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No effort data yet</div>
      </GlassCard>
    );
  }

  const effortMap: Record<string, number> = { 'Quick Fix': 0, Medium: 0, Large: 0 };
  effortDistribution.forEach(e => { if (e.effort in effortMap) effortMap[e.effort] = e.cnt; });
  const data = Object.entries(effortMap).map(([name, value]) => ({ name, value }));
  const quickPct = total > 0 ? Math.round(effortMap['Quick Fix'] / total * 100) : 0;

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-1">Remediation Effort</h4>
      <p className="text-[10px] text-gray-500 mb-3">Click to filter by effort level</p>
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
                <Cell key={entry.name} fill={EFFORT_COLORS[entry.name] || '#6B7280'} opacity={0.7} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [`${value} findings`, name]}
            />
            <Legend
              formatter={(value) => <span className="text-[10px] text-gray-400">{value}</span>}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          <strong className="text-emerald-400">{quickPct}%</strong> are Quick Fixes. {effortMap.Large} require Large effort.
        </p>
      </div>
    </GlassCard>
  );
}
