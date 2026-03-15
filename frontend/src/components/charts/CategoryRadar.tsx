import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';

interface Props {
  categoryScores: Record<string, number>;
  onDrill?: (filter: DrillFilter) => void;
}

export default function CategoryRadar({ categoryScores, onDrill }: Props) {
  const entries = Object.entries(categoryScores);
  if (entries.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Category Health Radar</h4>
        <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Run a scan to see category scores</div>
      </GlassCard>
    );
  }

  const data = entries.map(([name, value]) => ({
    category: name.length > 14 ? name.substring(0, 12) + '...' : name,
    fullName: name,
    score: value,
  }));

  const minEntry = entries.reduce((a, b) => a[1] < b[1] ? a : b);
  const maxEntry = entries.reduce((a, b) => a[1] > b[1] ? a : b);

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-1">Category Health Radar</h4>
      <p className="text-[10px] text-gray-500 mb-3">Click a category label to drill down</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="category"
              tick={({ x, y, payload, index }: any) => (
                <text
                  x={x} y={y}
                  fill="#9CA3AF"
                  fontSize={9}
                  fontWeight={600}
                  textAnchor="middle"
                  cursor="pointer"
                  onClick={() => {
                    const d = data[index];
                    if (d && onDrill) onDrill({ type: 'category', value: d.fullName, label: `${d.fullName} Findings` });
                  }}
                >
                  {payload.value}
                </text>
              )}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 8 }} axisLine={false} />
            <Radar dataKey="score" stroke="#D04A02" fill="#D04A02" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: '#D04A02', stroke: '#111827', strokeWidth: 2 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [`${value}/100`, 'Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Strongest: <strong className="text-emerald-400">{maxEntry[0]}</strong> ({maxEntry[1]}/100).
          Weakest: <strong className="text-red-400">{minEntry[0]}</strong> ({minEntry[1]}/100).
        </p>
      </div>
    </GlassCard>
  );
}
