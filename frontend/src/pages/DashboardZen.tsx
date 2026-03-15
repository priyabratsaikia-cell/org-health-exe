import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight, Leaf, Wind } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData } from '@/api/types';

const ZEN = {
  stone: '#78716C',
  sage: '#6EE7B7',
  ink: '#1C1917',
  sand: '#D6D3D1',
  warm: '#FAFAF9',
  moss: '#059669',
  clay: '#C2410C',
  pebble: '#A8A29E',
  cardBg: 'rgba(28, 25, 23, 0.6)',
  border: 'rgba(168, 162, 158, 0.08)',
};

const SEVERITY_ZEN: Record<string, { color: string; label: string }> = {
  Critical: { color: '#DC2626', label: 'Urgent' },
  High: { color: '#EA580C', label: 'Important' },
  Medium: { color: '#CA8A04', label: 'Notable' },
  Low: { color: '#16A34A', label: 'Minor' },
  Info: { color: '#7C3AED', label: 'Informational' },
};

function BreathingScore({ score }: { score: number | null }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (score === null) return;
    const duration = 2000;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setAnimated(Math.round(eased * score));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  const grade = score !== null ? scoreGrade(score) : '--';
  const color = score !== null
    ? score >= 75 ? ZEN.moss : score >= 50 ? ZEN.clay : '#DC2626'
    : ZEN.stone;

  return (
    <motion.div
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      className="flex flex-col items-center"
    >
      <span className="text-8xl font-extralight tracking-tighter leading-none" style={{ color }}>
        {score !== null ? animated : '--'}
      </span>
      <span className="text-sm font-medium tracking-[0.3em] uppercase mt-3" style={{ color: ZEN.pebble }}>{grade}</span>
    </motion.div>
  );
}

function ZenDivider() {
  return <div className="h-px my-8" style={{ background: `linear-gradient(to right, transparent, ${ZEN.border.replace('0.08', '0.15')}, transparent)` }} />;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="inline-block ml-3 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardZen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { state, toast } = useApp();

  const load = useCallback(async () => {
    try {
      setData(await api.getDashboard(state.selectedOrg?.alias));
    } catch (e: any) {
      toast('Failed to load dashboard: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto py-12 space-y-12">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: ZEN.cardBg }} />
          ))}
        </div>
      </PageTransition>
    );
  }

  const stats = data?.stats;
  const ext = data?.extended;
  const history = (ext?.scan_history || []).slice().reverse();
  const latestScore = stats?.latest_health_score ?? null;
  const openIssues = (stats?.total_findings || 0) - (stats?.resolved_findings || 0);
  const critOpen = stats?.critical_unresolved || 0;
  const avgScore = ext?.avg_score_last_5;

  const trendData = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
  }));
  const scoreHistory = history.map(s => s.health_score || 0);

  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaColor = delta > 0 ? ZEN.moss : delta < 0 ? ZEN.clay : ZEN.stone;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => b[1] - a[1]);
  const severityEntries = Object.entries(ext?.severity_totals || {}).filter(([_, v]) => v > 0);
  const totalFindings = severityEntries.reduce((a, [_, v]) => a + v, 0);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Hero Score */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="text-center py-12"
        >
          <div className="flex items-center justify-center gap-2 mb-8">
            <Wind className="w-4 h-4" style={{ color: ZEN.pebble }} />
            <span className="text-xs tracking-[0.4em] uppercase font-medium" style={{ color: ZEN.pebble }}>Org Health</span>
          </div>
          <BreathingScore score={latestScore} />
          <div className="flex items-center justify-center gap-2 mt-6">
            <DeltaIcon className="w-4 h-4" style={{ color: deltaColor }} />
            <span className="text-sm font-medium" style={{ color: deltaColor }}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
            <span className="text-xs" style={{ color: ZEN.pebble }}>from previous</span>
          </div>
        </motion.div>

        <ZenDivider />

        {/* Key Numbers */}
        <div className="grid grid-cols-3 gap-8 text-center">
          {[
            { label: 'Average', value: avgScore ?? '--', sparkData: scoreHistory, color: ZEN.moss },
            { label: 'Open Issues', value: openIssues, sparkData: history.map(s => s.total_findings || 0), color: openIssues > 0 ? ZEN.clay : ZEN.moss },
            { label: 'Critical', value: critOpen, sparkData: history.map(s => s.critical_count || 0), color: critOpen > 0 ? '#DC2626' : ZEN.moss },
          ].map(item => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-[10px] font-medium tracking-[0.2em] uppercase" style={{ color: ZEN.pebble }}>{item.label}</span>
              <div className="flex items-center justify-center mt-2">
                <span className="text-3xl font-light tracking-tight" style={{ color: item.color }}>{item.value}</span>
                <MiniSparkline data={item.sparkData} color={item.color} />
              </div>
            </motion.div>
          ))}
        </div>

        <ZenDivider />

        {/* Trend Chart */}
        {trendData.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h3 className="text-xs tracking-[0.3em] uppercase font-medium mb-6" style={{ color: ZEN.pebble }}>Trajectory</h3>
            <div className="h-48 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="zenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ZEN.sage} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={ZEN.sage} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="1 6" stroke="rgba(168, 162, 158, 0.06)" />
                  <XAxis dataKey="date" tick={{ fill: ZEN.pebble, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: ZEN.pebble, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: ZEN.ink, border: `1px solid ${ZEN.border}`, borderRadius: 8, fontSize: 12, color: ZEN.sand }}
                    labelStyle={{ color: ZEN.pebble }}
                    itemStyle={{ color: ZEN.sage }}
                  />
                  <Area type="natural" dataKey="score" stroke={ZEN.moss} strokeWidth={1.5} fill="url(#zenGrad)" dot={{ fill: ZEN.moss, strokeWidth: 0, r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ZenDivider />
          </motion.div>
        )}

        {/* Severity - Dot Plot Style */}
        {totalFindings > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <h3 className="text-xs tracking-[0.3em] uppercase font-medium mb-6" style={{ color: ZEN.pebble }}>Findings</h3>
            <div className="space-y-5">
              {severityEntries.map(([sev, count]) => {
                const info = SEVERITY_ZEN[sev] || { color: ZEN.stone, label: sev };
                const pct = Math.round((count / totalFindings) * 100);
                return (
                  <div key={sev} className="flex items-center gap-4">
                    <span className="w-24 text-right text-[11px] font-medium" style={{ color: ZEN.pebble }}>{info.label}</span>
                    <div className="flex-1 flex items-center gap-1.5">
                      {Array.from({ length: Math.min(count, 20) }).map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: info.color, opacity: 0.7 }}
                        />
                      ))}
                      {count > 20 && <span className="text-[10px] ml-1" style={{ color: ZEN.pebble }}>+{count - 20}</span>}
                    </div>
                    <span className="text-xs font-light w-12 text-right" style={{ color: info.color }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            <ZenDivider />
          </motion.div>
        )}

        {/* Categories - Clean Horizontal Bars */}
        {categoryEntries.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <h3 className="text-xs tracking-[0.3em] uppercase font-medium mb-6" style={{ color: ZEN.pebble }}>Categories</h3>
            <div className="space-y-4">
              {categoryEntries.map(([name, score], i) => {
                const barColor = score >= 75 ? ZEN.moss : score >= 50 ? ZEN.clay : '#DC2626';
                return (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-gray-300">{name}</span>
                      <span className="text-[12px] font-light" style={{ color: barColor }}>{score}/100</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(168, 162, 158, 0.06)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score}%` }}
                        transition={{ duration: 1.2, delay: 0.5 + i * 0.05, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: barColor }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <ZenDivider />
          </motion.div>
        )}

        {/* AI Insight - Haiku Style */}
        {data?.recent_scans?.[0]?.summary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <div className="text-center py-6">
              <Leaf className="w-5 h-5 mx-auto mb-4" style={{ color: ZEN.sage, opacity: 0.5 }} />
              <p className="text-sm leading-relaxed max-w-md mx-auto font-light italic" style={{ color: ZEN.sand }}>
                "{data.recent_scans[0].summary}"
              </p>
              <span className="text-[10px] tracking-[0.2em] uppercase mt-3 block" style={{ color: ZEN.pebble }}>AI Reflection</span>
            </div>
            <ZenDivider />
          </motion.div>
        )}

        {/* Recent Scans - Minimal List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs tracking-[0.3em] uppercase font-medium" style={{ color: ZEN.pebble }}>Recent</h3>
            <button
              onClick={() => navigate('/scans/new')}
              className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: ZEN.moss }}
            >
              New Scan <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="text-center py-12">
              <p className="text-sm font-light" style={{ color: ZEN.pebble }}>Begin your journey with a health scan.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? ZEN.moss : (s.health_score || 0) >= 50 ? ZEN.clay : '#DC2626';
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 + i * 0.05 }}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center justify-between py-3 px-2 rounded-lg transition-colors text-left group"
                    style={{ borderBottom: `1px solid ${ZEN.border}` }}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-extralight" style={{ color: sColor }}>{s.health_score || 0}</span>
                      <div>
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors block">{s.org_alias}</span>
                        <span className="text-[10px]" style={{ color: ZEN.pebble }}>{timeAgo(s.started_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-light" style={{ color: ZEN.pebble }}>{s.total_findings || 0} findings</span>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center gap-6 mt-12 pb-8">
          {[
            { label: 'New Scan', action: () => navigate('/scans/new') },
            { label: 'All Scans', action: () => navigate('/scans') },
            { label: 'Settings', action: () => navigate('/settings') },
          ].map(qa => (
            <button
              key={qa.label}
              onClick={qa.action}
              className="text-xs font-medium tracking-wider uppercase transition-colors hover:text-gray-200"
              style={{ color: ZEN.pebble }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
