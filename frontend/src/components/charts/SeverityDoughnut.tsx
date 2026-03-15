import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';

interface Props {
  severityTotals: Record<string, number>;
  onDrill?: (filter: DrillFilter) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F97316',
  Medium: '#EAB308',
  Low: '#22C55E',
  Info: '#6366F1',
};

export default function SeverityDoughnut({ severityTotals, onDrill }: Props) {
  const data = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(name => ({
    name,
    value: severityTotals[name] || 0,
  }));
  const total = data.reduce((a, b) => a + b.value, 0);
  const critHigh = (severityTotals.Critical || 0) + (severityTotals.High || 0);

  if (total === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Findings by Severity</h4>
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No findings yet</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-1">Findings by Severity</h4>
      <p className="text-[10px] text-gray-500 mb-3">Click a slice to drill down</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              dataKey="value"
              stroke="none"
              cursor="pointer"
              onClick={(_, idx) => {
                const entry = data[idx];
                if (entry && onDrill) onDrill({ type: 'severity', value: entry.name, label: `${entry.name} Findings` });
              }}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#6B7280'} opacity={0.85} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [`${value} (${Math.round(Number(value) / total * 100)}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {data.filter(d => d.value > 0).map(d => (
          <button
            key={d.name}
            onClick={() => onDrill?.({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
            className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[d.name] }} />
            {d.name}: {d.value}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          {total} total findings. <strong className="text-gray-300">{critHigh} ({Math.round(critHigh / total * 100)}%)</strong> are Critical or High severity.
        </p>
      </div>
    </GlassCard>
  );
}
