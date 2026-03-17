import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';
import type { DrillFilter } from '@/api/types';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

interface Props {
  riskCategories: { category: string; cnt: number }[];
  onDrill?: (filter: DrillFilter) => void;
}

export default function RiskBarChart({ riskCategories, onDrill }: Props) {
  const { state } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const isLight = state.resolvedTheme === 'light';

  if (riskCategories.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: C.gray10 }}>Top Risk Categories</h4>
        <div className="h-48 flex items-center justify-center text-sm" style={{ color: C.gray60 }}>No findings by category</div>
      </GlassCard>
    );
  }

  const top5 = riskCategories.slice(0, 5);
  const barOpacities = [0.85, 0.7, 0.55, 0.45, 0.35];
  const data = top5.map((r, i) => ({
    name: r.category || 'Unknown',
    value: r.cnt,
    opacity: barOpacities[i] || 0.3,
  }));

  const cursorFill = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold mb-1" style={{ color: C.gray10 }}>Top Risk Categories</h4>
      <p className="text-[10px] mb-3" style={{ color: C.gray50 }}>Click a bar to filter findings</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
            <XAxis type="number" tick={{ fill: C.gray50, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: C.gray40, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip
              contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 12, color: C.gray10 }}
              cursor={{ fill: cursorFill }}
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
                <Cell key={i} fill={C.blue60} opacity={entry.opacity} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
        <AgentPulse size="sm" />
        <p className="text-[11px] leading-relaxed" style={{ color: C.gray40 }}>
          <strong style={{ color: C.gray30 }}>{data[0]?.name}</strong> has the most open findings ({data[0]?.value}).
        </p>
      </div>
    </GlassCard>
  );
}
