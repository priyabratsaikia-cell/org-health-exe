import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

interface Props {
  categoryScores: Record<string, number>;
  onDrill?: (filter: DrillFilter) => void;
}

export default function CategoryRadar({ categoryScores, onDrill }: Props) {
  const { state } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const isLight = state.resolvedTheme === 'light';
  const entries = Object.entries(categoryScores);
  if (entries.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Category Health Radar</h4>
        <div className="h-56 flex items-center justify-center text-sm" style={{ color: C.gray60 }}>Run a scan to see category scores</div>
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
  const gridStroke = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold mb-1" style={{ color: C.gray10 }}>Category Health Radar</h4>
      <p className="text-[10px] mb-3" style={{ color: C.gray50 }}>Click a category label to drill down</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={gridStroke} />
            <PolarAngleAxis
              dataKey="category"
              tick={({ x, y, payload, index }: any) => (
                <text
                  x={x} y={y}
                  fill={C.gray40}
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
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: C.gray50, fontSize: 8 }} axisLine={false} />
            <Radar dataKey="score" stroke={C.blue60} fill={C.blue60} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: C.blue60, stroke: C.gray90, strokeWidth: 2 }} />
            <Tooltip
              contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 12, color: C.gray10 }}
              formatter={(value) => [`${value}/100`, 'Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
        <AgentPulse size="sm" />
        <p className="text-[11px] leading-relaxed" style={{ color: C.gray40 }}>
          Strongest: <strong style={{ color: C.green40 }}>{maxEntry[0]}</strong> ({maxEntry[1]}/100).
          Weakest: <strong style={{ color: C.red40 }}>{minEntry[0]}</strong> ({minEntry[1]}/100).
        </p>
      </div>
    </GlassCard>
  );
}
