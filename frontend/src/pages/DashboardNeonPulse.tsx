import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Zap, ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtDate, fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreColor, scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

const NEON = {
  cyan: '#00F0FF',
  magenta: '#FF006E',
  purple: '#8B5CF6',
  lime: '#84CC16',
  amber: '#FBBF24',
  bg: '#050816',
  card: 'rgba(10, 15, 40, 0.8)',
  border: 'rgba(0, 240, 255, 0.12)',
};

const SEVERITY_NEON: Record<string, string> = {
  Critical: '#FF006E',
  High: '#FF6B2C',
  Medium: '#FBBF24',
  Low: '#84CC16',
  Info: '#8B5CF6',
};

function NeonRingScore({ score }: { score: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (score === null) return;
    const duration = 1500;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setAnimated(Math.round(eased * score));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2, r = 80;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r - 14, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.06)';
    ctx.stroke();

    if (animated > 0) {
      const pct = Math.min(animated, 100) / 100;
      const angle = -Math.PI / 2 + pct * Math.PI * 2;
      const grad = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      grad.addColorStop(0, NEON.cyan);
      grad.addColorStop(0.5, NEON.magenta);
      grad.addColorStop(1, NEON.purple);

      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, angle);
      ctx.lineWidth = 6;
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.shadowColor = NEON.cyan;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, angle);
      ctx.lineWidth = 2;
      ctx.strokeStyle = NEON.cyan + '60';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [animated]);

  const color = score !== null ? NEON.cyan : '#6B7280';
  const grade = score !== null ? scoreGrade(score) : '--';

  return (
    <div className="relative flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: 200, height: 200 }} />
      <div className="absolute flex flex-col items-center">
        <span className="text-5xl font-black tracking-tighter" style={{ color, textShadow: `0 0 30px ${color}60` }}>
          {score !== null ? animated : '--'}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: NEON.purple }}>{grade}</span>
      </div>
    </div>
  );
}

function NeonCard({ children, className = '', glow, span }: { children: React.ReactNode; className?: string; glow?: string; span?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border backdrop-blur-xl ${span || ''} ${className}`}
      style={{
        background: NEON.card,
        borderColor: glow ? glow + '30' : NEON.border,
        boxShadow: glow ? `0 0 30px ${glow}15, inset 0 1px 0 rgba(255,255,255,0.03)` : `inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      {children}
    </motion.div>
  );
}

function SeverityStack({ totals }: { totals: Record<string, number> }) {
  const order = ['Critical', 'High', 'Medium', 'Low', 'Info'];
  const total = order.reduce((s, k) => s + (totals[k] || 0), 0);
  if (total === 0) return <div className="text-gray-600 text-sm text-center py-8">No findings yet</div>;

  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {order.map(sev => {
          const pct = (totals[sev] || 0) / total * 100;
          if (pct === 0) return null;
          return (
            <motion.div
              key={sev}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ backgroundColor: SEVERITY_NEON[sev], boxShadow: `0 0 12px ${SEVERITY_NEON[sev]}50` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {order.map(sev => {
          const count = totals[sev] || 0;
          if (count === 0) return null;
          return (
            <div key={sev} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY_NEON[sev], boxShadow: `0 0 8px ${SEVERITY_NEON[sev]}60` }} />
              <span className="text-xs font-semibold" style={{ color: SEVERITY_NEON[sev] }}>{count}</span>
              <span className="text-[10px] text-gray-500">{sev}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardNeonPulse() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
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
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: NEON.card }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-56 rounded-2xl animate-pulse" style={{ background: NEON.card }} />
            ))}
          </div>
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
  const avgScore = ext?.avg_score_last_5 ?? null;
  const trendData = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
    findings: s.total_findings || 0,
  }));

  const categoryEntries = Object.entries(ext?.latest_category_scores || {});
  const categoryData = categoryEntries.map(([name, score]) => ({ name, score })).sort((a, b) => a.score - b.score);

  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta > 0 ? NEON.lime : delta < 0 ? NEON.magenta : NEON.amber;

  return (
    <PageTransition>
      <div className="space-y-4 p-1">
        {/* Bento Grid: Hero Row */}
        <div className="grid grid-cols-12 gap-4">
          {/* Score Ring - 4 cols */}
          <NeonCard className="col-span-12 lg:col-span-4 p-6 flex flex-col items-center justify-center" glow={NEON.cyan}>
            <NeonRingScore score={latestScore} />
            <div className="flex items-center gap-2 mt-2">
              <TrendIcon className="w-4 h-4" style={{ color: trendColor }} />
              <span className="text-sm font-bold" style={{ color: trendColor }}>
                {delta > 0 ? '+' : ''}{delta} pts
              </span>
              <span className="text-[10px] text-gray-500 ml-1">vs last scan</span>
            </div>
          </NeonCard>

          {/* Stats Column - 4 cols with 2 stacked */}
          <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-4">
            <NeonCard className="p-5" glow={NEON.purple}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: NEON.purple }}>Avg Score</span>
                  <div className="text-3xl font-black mt-1" style={{ color: NEON.cyan, textShadow: `0 0 20px ${NEON.cyan}40` }}>
                    {avgScore ?? '--'}
                  </div>
                  <span className="text-[10px] text-gray-500">Last 5 scans</span>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${NEON.purple}15` }}>
                  <Activity className="w-6 h-6" style={{ color: NEON.purple }} />
                </div>
              </div>
            </NeonCard>

            <NeonCard className="p-5" glow={critOpen > 0 ? NEON.magenta : NEON.lime}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: critOpen > 0 ? NEON.magenta : NEON.lime }}>Critical Risks</span>
                  <div className="text-3xl font-black mt-1" style={{ color: critOpen > 0 ? NEON.magenta : NEON.lime, textShadow: `0 0 20px ${critOpen > 0 ? NEON.magenta : NEON.lime}40` }}>
                    {critOpen}
                  </div>
                  <span className="text-[10px] text-gray-500">{critOpen > 0 ? 'Immediate action needed' : 'All clear'}</span>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${critOpen > 0 ? NEON.magenta : NEON.lime}15` }}>
                  <ShieldAlert className="w-6 h-6" style={{ color: critOpen > 0 ? NEON.magenta : NEON.lime }} />
                </div>
              </div>
            </NeonCard>
          </div>

          {/* Severity Breakdown - 4 cols */}
          <NeonCard className="col-span-12 lg:col-span-4 p-5" glow={NEON.amber}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-sm font-bold" style={{ color: NEON.amber }}>Severity Breakdown</span>
                <p className="text-[10px] text-gray-500 mt-0.5">{openIssues} open issues across all categories</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${NEON.amber}15` }}>
                <AlertTriangle className="w-5 h-5" style={{ color: NEON.amber }} />
              </div>
            </div>
            <SeverityStack totals={ext?.severity_totals || {}} />
          </NeonCard>
        </div>

        {/* AI Insight */}
        {data?.recent_scans?.[0]?.summary && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <NeonCard className="p-4" glow={NEON.purple}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${NEON.cyan}, ${NEON.purple})` }}>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: NEON.cyan }}>Neural Insight</span>
                  <p className="text-sm text-gray-300 mt-1 leading-relaxed line-clamp-2">{data.recent_scans[0].summary}</p>
                </div>
              </div>
            </NeonCard>
          </motion.div>
        )}

        {/* Charts: Bento grid */}
        <div className="grid grid-cols-12 gap-4">
          {/* Trend Area Chart - 8 cols */}
          <NeonCard className="col-span-12 xl:col-span-8 p-5" glow={NEON.cyan}>
            <h4 className="text-sm font-bold mb-3" style={{ color: NEON.cyan }}>Health Score Trend</h4>
            {trendData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Run scans to see your trend</div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="neonGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={NEON.cyan} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={NEON.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A0F28', border: `1px solid ${NEON.cyan}30`, borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: NEON.cyan }}
                      itemStyle={{ color: NEON.cyan }}
                    />
                    <Area type="monotone" dataKey="score" stroke={NEON.cyan} strokeWidth={2.5} fill="url(#neonGrad)" dot={{ fill: NEON.cyan, strokeWidth: 0, r: 4 }} activeDot={{ r: 6, stroke: NEON.magenta, strokeWidth: 2, fill: NEON.cyan }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </NeonCard>

          {/* Category Bars - 4 cols */}
          <NeonCard className="col-span-12 xl:col-span-4 p-5" glow={NEON.purple}>
            <h4 className="text-sm font-bold mb-4" style={{ color: NEON.purple }}>Category Health</h4>
            {categoryData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-gray-600 text-sm">No category data</div>
            ) : (
              <div className="space-y-3">
                {categoryData.map((cat) => {
                  const barColor = cat.score >= 75 ? NEON.lime : cat.score >= 50 ? NEON.amber : NEON.magenta;
                  return (
                    <button
                      key={cat.name}
                      onClick={() => handleDrill({ type: 'category', value: cat.name, label: `${cat.name} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-gray-300 group-hover:text-white transition-colors truncate mr-2">{cat.name}</span>
                        <span className="text-[11px] font-bold" style={{ color: barColor }}>{cat.score}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.score}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: barColor, boxShadow: `0 0 10px ${barColor}50` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </NeonCard>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-12 gap-4">
          {/* Findings by Effort - Donut */}
          <NeonCard className="col-span-12 md:col-span-4 p-5" glow={NEON.lime}>
            <h4 className="text-sm font-bold mb-3" style={{ color: NEON.lime }}>Effort Distribution</h4>
            {(ext?.effort_distribution || []).reduce((a, e) => a + e.cnt, 0) === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(ext?.effort_distribution || []).map(e => ({ name: e.effort, value: e.cnt }))}
                      cx="50%" cy="50%" innerRadius="50%" outerRadius="80%"
                      dataKey="value" stroke="none" paddingAngle={4}
                    >
                      {(ext?.effort_distribution || []).map((e, i) => (
                        <Cell key={e.effort} fill={[NEON.lime, NEON.amber, NEON.magenta][i] || NEON.purple} opacity={0.8} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A0F28', border: `1px solid ${NEON.lime}30`, borderRadius: 12, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </NeonCard>

          {/* Activity Bar Chart */}
          <NeonCard className="col-span-12 md:col-span-4 p-5" glow={NEON.amber}>
            <h4 className="text-sm font-bold mb-3" style={{ color: NEON.amber }}>Findings per Scan</h4>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No scans yet</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.04)" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A0F28', border: `1px solid ${NEON.amber}30`, borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="findings" radius={[6, 6, 0, 0]} barSize={18}>
                      {trendData.map((_, i) => (
                        <Cell key={i} fill={NEON.amber} opacity={0.6 + (i / trendData.length) * 0.4} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </NeonCard>

          {/* Risk Categories */}
          <NeonCard className="col-span-12 md:col-span-4 p-5" glow={NEON.magenta}>
            <h4 className="text-sm font-bold mb-3" style={{ color: NEON.magenta }}>Top Risks</h4>
            {(ext?.top_risk_categories || []).length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No risk data</div>
            ) : (
              <div className="space-y-2.5">
                {(ext?.top_risk_categories || []).slice(0, 5).map((risk, i) => {
                  const maxCnt = (ext?.top_risk_categories || [])[0]?.cnt || 1;
                  const pct = (risk.cnt / maxCnt) * 100;
                  return (
                    <button
                      key={risk.category}
                      onClick={() => handleDrill({ type: 'category', value: risk.category, label: `${risk.category} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-gray-400 group-hover:text-white transition-colors truncate mr-2">{risk.category}</span>
                        <span className="text-[11px] font-bold" style={{ color: NEON.magenta }}>{risk.cnt}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: NEON.magenta, boxShadow: `0 0 8px ${NEON.magenta}60` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </NeonCard>
        </div>

        {/* Recent Scans - Timeline Style */}
        <NeonCard className="p-5" glow={NEON.cyan}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold" style={{ color: NEON.cyan }}>Scan Timeline</h3>
            <button
              onClick={() => navigate('/scans/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: `linear-gradient(135deg, ${NEON.cyan}, ${NEON.purple})`, color: '#fff' }}
            >
              <Zap className="w-3.5 h-3.5" /> New Scan
            </button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="text-center py-8 text-gray-600 text-sm">No scans yet. Launch your first health scan to get started.</div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: `linear-gradient(to bottom, ${NEON.cyan}40, transparent)` }} />
              <div className="space-y-4">
                {data.recent_scans.map((s, i) => {
                  const sColor = (s.health_score || 0) >= 75 ? NEON.lime : (s.health_score || 0) >= 50 ? NEON.amber : NEON.magenta;
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => navigate(`/scans/${s.id}`)}
                      className="flex items-start gap-4 pl-8 cursor-pointer group relative"
                    >
                      <div className="absolute left-[11px] top-2 w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: sColor, backgroundColor: i === 0 ? sColor : 'transparent', boxShadow: i === 0 ? `0 0 10px ${sColor}80` : 'none' }} />
                      <div className="flex-1 rounded-xl p-3 transition-all border" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">{s.org_alias}</span>
                            <span className="text-[10px] text-gray-500 ml-2">{timeAgo(s.started_at)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black" style={{ color: sColor }}>{s.health_score || 0}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${sColor}15`, color: sColor }}>{s.total_findings || 0} findings</span>
                            <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </NeonCard>
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
