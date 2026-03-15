import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';

interface Props {
  riskCategories: { category: string; cnt: number }[];
  onDrill?: (filter: DrillFilter) => void;
}

export default function RiskBarChart({ riskCategories, onDrill }: Props) {
  if (riskCategories.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Top Risk Categories</h4>
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No findings by category</div>
      </GlassCard>
    );
  }

  const data = riskCategories.map((r, i) => ({
    name: r.category || 'Unknown',
    value: r.cnt,
    fill: `rgba(${208 + i * 4}, ${74 - i * 10}, ${2 + i * 12}, 0.7)`,
  }));

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-1">Top Risk Categories</h4>
      <p className="text-[10px] text-gray-500 mb-3">Click a bar to filter findings</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
            <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry) => {
                if (onDrill && entry.name) onDrill({ type: 'category', value: String(entry.name), label: `${entry.name} Findings` });
              }}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          <strong className="text-gray-300">{data[0]?.name}</strong> has the most open findings ({data[0]?.value}).
        </p>
      </div>
    </GlassCard>
  );
}
