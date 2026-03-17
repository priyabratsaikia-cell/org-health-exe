import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

const A = {
  bg: '#000000',
  card: 'rgba(28, 28, 30, 0.72)',
  cardSolid: '#1C1C1E',
  border: 'rgba(255, 255, 255, 0.08)',
  label: '#8E8E93',
  text: '#F5F5F7',
  secondaryText: '#A1A1A6',
  blue: '#0A84FF',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  purple: '#BF5AF2',
  teal: '#64D2FF',
  pink: '#FF375F',
  indigo: '#5E5CE6',
  yellow: '#FFD60A',
};

const SEVERITY_APPLE: Record<string, string> = {
  Critical: A.red,
  High: A.orange,
  Medium: A.yellow,
  Low: A.green,
  Info: A.blue,
};

function AppleRing({ score, size = 120, strokeWidth = 10, color }: { score: number; size?: number; strokeWidth?: number; color: string }) {
  const [animated, setAnimated] = useState(0);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(eased * score);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  const offset = circ - (animated / 100) * circ;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.1s ease-out' }}
      />
    </svg>
  );
}

function AppleCard({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onClick}
      className={`rounded-2xl backdrop-blur-2xl ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: A.card,
        border: `0.5px solid ${A.border}`,
      }}
    >
      {children}
    </motion.div>
  );
}

function SegmentedControl({ items, active, onChange }: { items: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: 'rgba(118, 118, 128, 0.24)' }}>
      {items.map((item, i) => (
        <button
          key={item}
          onClick={() => onChange(i)}
          className="relative px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all duration-200"
          style={{ color: active === i ? A.text : A.label }}
        >
          {active === i && (
            <motion.div
              layoutId="segment-bg"
              className="absolute inset-0 rounded-md"
              style={{ background: 'rgba(118, 118, 128, 0.36)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{item}</span>
        </button>
      ))}
    </div>
  );
}

export default function DashboardApple() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState(0);
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(null);
  const [drillFindings, setDrillFindings] = useState<Finding[]>([]);
  const [latestScanId, setLatestScanId] = useState<number | undefined>();
  const navigate = useNavigate();
  const { state, toast } = useApp();

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard(state.selectedOrg?.alias);
      setData(d);
      if (d.recent_scans.length > 0) setLatestScanId(d.recent_scans[0].id);
    } catch (e: any) {
      toast('Failed to load dashboard: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);

  const handleDrill = useCallback(async (filter: DrillFilter) => {
    try {
      const { findings } = await api.getAllFindings(state.selectedOrg?.alias);
      setDrillFindings(findings);
      setDrillFilter(filter);
    } catch (e: any) {
      toast('Failed to load findings: ' + e.message, 'error');
    }
  }, [state.selectedOrg?.alias, toast]);

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-5 p-2">
          {[180, 100, 260].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ background: A.cardSolid, height: h }} />
          ))}
        </div>
      </PageTransition>
    );
  }

  const stats = data?.stats;
  const ext = data?.extended;
  const history = (ext?.scan_history || []).slice().reverse();
  const latestScore = stats?.latest_health_score ?? 0;
  const openIssues = (stats?.total_findings || 0) - (stats?.resolved_findings || 0);
  const critOpen = stats?.critical_unresolved || 0;
  const avgScore = ext?.avg_score_last_5 ?? 0;

  const scoreColor = latestScore >= 75 ? A.green : latestScore >= 50 ? A.orange : A.red;
  const avgColor = avgScore >= 75 ? A.green : avgScore >= 50 ? A.orange : A.red;

  const trendData = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
    findings: s.total_findings || 0,
  }));

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => b[1] - a[1]);
  const severityData = ['Critical', 'High', 'Medium', 'Low', 'Info']
    .map(name => ({ name, value: ext?.severity_totals?.[name] || 0 }))
    .filter(d => d.value > 0);
  const totalSevFindings = severityData.reduce((a, b) => a + b.value, 0);

  return (
    <PageTransition>
      <div className="space-y-5 p-2">
        {/* Hero: Activity Rings */}
        <AppleCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight" style={{ color: A.text }}>Summary</h2>
              <p className="text-[13px] mt-0.5" style={{ color: A.label }}>Your org health at a glance</p>
            </div>
            <button
              onClick={() => navigate('/scans/new')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: A.blue, color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> New Scan
            </button>
          </div>

          <div className="flex items-center gap-10">
            {/* Nested rings like Apple Watch */}
            <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <AppleRing score={latestScore} size={160} strokeWidth={14} color={scoreColor} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <AppleRing score={avgScore} size={124} strokeWidth={14} color={A.teal} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <AppleRing score={Math.max(0, 100 - critOpen * 10)} size={88} strokeWidth={14} color={A.purple} />
              </div>
            </div>

            <div className="flex-1 grid grid-cols-3 gap-6">
              {[
                { label: 'Health Score', value: latestScore, color: scoreColor, sub: scoreGrade(latestScore) },
                { label: 'Average (5)', value: avgScore, color: A.teal, sub: `${Math.min(5, history.length)} scans` },
                { label: 'Open Issues', value: openIssues, color: A.purple, sub: `${critOpen} critical` },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: item.color }}>{item.label}</span>
                  </div>
                  <span className="text-3xl font-bold tracking-tight" style={{ color: A.text }}>{item.value}</span>
                  <span className="block text-[12px] mt-0.5" style={{ color: A.label }}>{item.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </AppleCard>

        {/* AI Summary */}
        {data?.recent_scans?.[0]?.summary && (
          <AppleCard className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #5E5CE6, #BF5AF2, #FF375F)' }}>
                <span className="text-[10px] font-black text-white">AI</span>
              </div>
              <span className="text-[13px] font-semibold" style={{ color: A.text }}>Intelligence</span>
            </div>
            <p className="text-[14px] leading-relaxed line-clamp-2" style={{ color: A.secondaryText }}>{data.recent_scans[0].summary}</p>
          </AppleCard>
        )}

        {/* Charts with Segmented Control */}
        <AppleCard className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[17px] font-semibold" style={{ color: A.text }}>Analytics</h3>
            <SegmentedControl items={['Trend', 'Severity', 'Categories']} active={chartTab} onChange={setChartTab} />
          </div>

          <AnimatePresence mode="wait">
            {chartTab === 0 && (
              <motion.div key="trend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {trendData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-[15px]" style={{ color: A.label }}>Run scans to see your trend</div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={A.blue} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={A.blue} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: A.label, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: A.label, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#2C2C2E', border: 'none', borderRadius: 12, fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
                          labelStyle={{ color: A.label }}
                          itemStyle={{ color: A.blue }}
                        />
                        <Area type="monotone" dataKey="score" stroke={A.blue} strokeWidth={2.5} fill="url(#appleGrad)" dot={false} activeDot={{ r: 5, fill: A.blue, stroke: '#000', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>
            )}

            {chartTab === 1 && (
              <motion.div key="severity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {severityData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-[15px]" style={{ color: A.label }}>No findings data</div>
                ) : (
                  <div className="h-56 flex items-center">
                    <div className="w-48 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={severityData} cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" dataKey="value" stroke="none" paddingAngle={3}>
                            {severityData.map(d => <Cell key={d.name} fill={SEVERITY_APPLE[d.name]} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 pl-6 space-y-3">
                      {severityData.map(d => {
                        const pct = Math.round((d.value / totalSevFindings) * 100);
                        return (
                          <button
                            key={d.name}
                            onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                            className="w-full flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-3 h-3 rounded-full" style={{ background: SEVERITY_APPLE[d.name] }} />
                              <span className="text-[14px] font-medium group-hover:text-white transition-colors" style={{ color: A.secondaryText }}>{d.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[14px] font-semibold" style={{ color: A.text }}>{d.value}</span>
                              <span className="text-[12px]" style={{ color: A.label }}>{pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {chartTab === 2 && (
              <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {categoryEntries.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-[15px]" style={{ color: A.label }}>No category data</div>
                ) : (
                  <div className="space-y-4 py-2 max-h-56 overflow-y-auto">
                    {categoryEntries.map(([name, score], i) => {
                      const barColor = score >= 75 ? A.green : score >= 50 ? A.orange : A.red;
                      return (
                        <button
                          key={name}
                          onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[14px] font-medium group-hover:text-white transition-colors" style={{ color: A.secondaryText }}>{name}</span>
                            <span className="text-[14px] font-semibold" style={{ color: barColor }}>{score}</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(118, 118, 128, 0.24)' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${score}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05 }}
                              className="h-full rounded-full"
                              style={{ background: barColor }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </AppleCard>

        {/* Recent Scans */}
        <AppleCard className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-[17px] font-semibold" style={{ color: A.text }}>Recent</h3>
            <button
              onClick={() => navigate('/scans')}
              className="text-[14px] font-medium flex items-center gap-0.5 transition-opacity hover:opacity-70"
              style={{ color: A.blue }}
            >
              See All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-5 pb-5 text-center py-8 text-[15px]" style={{ color: A.label }}>No scans yet</div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? A.green : (s.health_score || 0) >= 50 ? A.orange : A.red;
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-5 py-3.5 transition-colors hover:bg-white/[0.03] text-left group"
                    style={{ borderTop: i > 0 ? `0.5px solid ${A.border}` : undefined }}
                  >
                    <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0 mr-3.5">
                      <AppleRing score={s.health_score || 0} size={44} strokeWidth={4} color={sColor} />
                      <span className="absolute text-[11px] font-bold" style={{ color: sColor }}>{s.health_score || 0}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-medium block group-hover:text-white transition-colors" style={{ color: A.text }}>{s.org_alias}</span>
                      <span className="text-[12px]" style={{ color: A.label }}>{timeAgo(s.started_at)} &middot; {s.total_findings || 0} findings</span>
                    </div>
                    <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: A.label }} />
                  </motion.button>
                );
              })}
            </div>
          )}
        </AppleCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Health Scan', sub: 'Run now', color: A.blue, action: () => navigate('/scans/new') },
            { label: 'All Scans', sub: 'View reports', color: A.green, action: () => navigate('/scans') },
            { label: 'Settings', sub: 'Configure', color: A.purple, action: () => navigate('/settings') },
          ].map(qa => (
            <AppleCard key={qa.label} className="p-4 cursor-pointer transition-transform hover:scale-[1.02]" onClick={qa.action}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${qa.color}20` }}>
                <div className="w-3 h-3 rounded-full" style={{ background: qa.color }} />
              </div>
              <span className="text-[15px] font-semibold block" style={{ color: A.text }}>{qa.label}</span>
              <span className="text-[12px]" style={{ color: A.label }}>{qa.sub}</span>
            </AppleCard>
          ))}
        </div>
      </div>

      <ChartDrillModal
        filter={drillFilter}
        findings={drillFindings}
        scanId={latestScanId}
        onClose={() => setDrillFilter(null)}
        onFindingsChange={() => { load(); api.getAllFindings(state.selectedOrg?.alias).then(r => setDrillFindings(r.findings)); }}
      />
    </PageTransition>
  );
}
