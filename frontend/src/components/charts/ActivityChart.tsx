import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { Scan } from '@/api/types';
import { fmtShortDate } from '@/utils/formatters';
import GlassCard from '../ui/GlassCard';
import AgentPulse from '../ui/AgentPulse';

interface Props {
  history: Scan[];
}

export default function ActivityChart({ history }: Props) {
  if (history.length === 0) {
    return (
      <GlassCard className="p-4">
        <h4 className="text-sm font-bold text-gray-300 mb-3">Scan Activity & Scores</h4>
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No scan activity yet</div>
      </GlassCard>
    );
  }

  const data = history.map(s => ({
    date: fmtShortDate(s.started_at),
    findings: s.total_findings || 0,
    score: s.health_score || 0,
  }));

  const avgFindings = Math.round(data.reduce((a, b) => a + b.findings, 0) / data.length);

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-bold text-gray-300 mb-3">Scan Activity & Scores</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Findings', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 9 } }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Score', angle: 90, position: 'insideRight', style: { fill: '#6B7280', fontSize: 9 } }} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
            <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-[10px] text-gray-400">{value}</span>} />
            <Bar yAxisId="left" dataKey="findings" fill="rgba(99,102,241,0.3)" stroke="#6366F1" strokeWidth={1} radius={[4, 4, 0, 0]} barSize={20} />
            <Line yAxisId="right" type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', strokeWidth: 2, stroke: '#111827', r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <AgentPulse size="sm" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Across {data.length} scans, you averaged <strong className="text-gray-300">{avgFindings} findings</strong> per scan.
        </p>
      </div>
    </GlassCard>
  );
}
