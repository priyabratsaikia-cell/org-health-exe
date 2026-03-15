import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight, Waves } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

/*
 * AURORA — my signature dashboard.
 *
 * Inspired by the northern lights: deep indigo sky, flowing
 * gradients of teal/emerald/violet/rose that breathe and shift.
 * Glassmorphic cards float over a subtle aurora mesh.
 * Typography is clean but with personality.
 * Data is presented as living, organic visualizations.
 * Every card has a unique gradient accent derived from its data.
 */

const AU = {
  void: '#080B1A',
  deep: '#0C1025',
  surface: 'rgba(14, 18, 42, 0.65)',
  glass: 'rgba(14, 18, 42, 0.45)',
  border: 'rgba(120, 200, 255, 0.08)',
  borderGlow: 'rgba(120, 200, 255, 0.15)',

  teal: '#2DD4BF',
  emerald: '#34D399',
  violet: '#A78BFA',
  rose: '#FB7185',
  sky: '#38BDF8',
  amber: '#FBBF24',
  indigo: '#818CF8',
  pink: '#F472B6',

  text: '#E8EDF5',
  textMuted: '#8B95A8',
  textDim: '#5B6478',
};

const SEV_AU: Record<string, string> = {
  Critical: AU.rose,
  High: '#FB923C',
  Medium: AU.amber,
  Low: AU.emerald,
  Info: AU.indigo,
};

function auroraGradient(score: number): string {
  if (score >= 80) return `linear-gradient(135deg, ${AU.emerald}30, ${AU.teal}20)`;
  if (score >= 60) return `linear-gradient(135deg, ${AU.sky}25, ${AU.indigo}15)`;
  if (score >= 40) return `linear-gradient(135deg, ${AU.amber}25, ${AU.rose}15)`;
  return `linear-gradient(135deg, ${AU.rose}30, ${AU.pink}15)`;
}

function AuroraCard({ children, className = '', glow }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl backdrop-blur-xl relative overflow-hidden ${className}`}
      style={{
        background: AU.surface,
        border: `1px solid ${glow ? `${glow}25` : AU.border}`,
        boxShadow: glow ? `0 0 40px ${glow}08, inset 0 1px 0 rgba(255,255,255,0.04)` : `inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {children}
    </motion.div>
  );
}

function AuroraMesh() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: -1 }}>
      <div className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] animate-pulse"
        style={{ background: `radial-gradient(circle, ${AU.teal}, transparent)`, top: '-10%', left: '20%', animationDuration: '8s' }} />
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-[0.05]"
        style={{ background: `radial-gradient(circle, ${AU.violet}, transparent)`, top: '30%', right: '10%', animationDuration: '12s', animationName: 'pulse' }} />
      <div className="absolute w-[400px] h-[400px] rounded-full blur-[80px] opacity-[0.04]"
        style={{ background: `radial-gradient(circle, ${AU.rose}, transparent)`, bottom: '10%', left: '40%', animationDuration: '10s', animationName: 'pulse' }} />
    </div>
  );
}

function OrbitalScore({ score }: { score: number | null }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (score === null) return;
    const dur = 1500;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setAnimated(Math.round(e * score));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  const color = (score ?? 0) >= 75 ? AU.emerald : (score ?? 0) >= 50 ? AU.sky : AU.rose;
  const grade = score !== null ? scoreGrade(score) : '--';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      {/* Orbital rings */}
      {[72, 60, 48].map((r, i) => (
        <motion.div
          key={r}
          className="absolute rounded-full border"
          style={{
            width: r * 2, height: r * 2,
            borderColor: `${[AU.teal, AU.violet, AU.rose][i]}${animated > 0 ? '25' : '08'}`,
          }}
          animate={{ rotate: [0, i % 2 === 0 ? 360 : -360] }}
          transition={{ duration: 20 + i * 5, repeat: Infinity, ease: 'linear' }}
        >
          {animated > 0 && (
            <div
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: [AU.teal, AU.violet, AU.rose][i],
                top: -4, left: '50%', marginLeft: -4,
                boxShadow: `0 0 8px ${[AU.teal, AU.violet, AU.rose][i]}80`,
              }}
            />
          )}
        </motion.div>
      ))}
      {/* Score center */}
      <div className="flex flex-col items-center z-10">
        <motion.span
          className="text-5xl font-bold tracking-tighter"
          style={{ color, textShadow: `0 0 40px ${color}30` }}
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {score !== null ? animated : '--'}
        </motion.span>
        <span className="text-[11px] font-semibold tracking-widest uppercase mt-1" style={{ color: AU.textMuted }}>{grade}</span>
      </div>
    </div>
  );
}

function WaveBar({ value, max, color, delay = 0 }: { value: number; max: number; color: string; delay?: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: `${color}10` }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full relative"
        style={{ background: `linear-gradient(90deg, ${color}90, ${color})` }}
      >
        <div className="absolute right-0 top-0 w-3 h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}60` }} />
      </motion.div>
    </div>
  );
}

export default function DashboardAurora() {
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
      toast('Failed to load: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);

  const handleDrill = useCallback(async (filter: DrillFilter) => {
    if (!latestScanId) return;
    try {
      const scan = await api.getScan(latestScanId);
      setDrillFindings(scan.findings || []);
      setDrillFilter(filter);
    } catch (e: any) {
      toast('Drill failed: ' + e.message, 'error');
    }
  }, [latestScanId, toast]);

  if (loading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-5">
          {[200, 160, 240].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ background: AU.surface, height: h }} />
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
  const avgScore = ext?.avg_score_last_5 ?? 0;

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaColor = delta > 0 ? AU.emerald : delta < 0 ? AU.rose : AU.textMuted;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => a[1] - b[1]);
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(n => ({ name: n, value: ext?.severity_totals?.[n] || 0 })).filter(d => d.value > 0);
  const totalSev = severityEntries.reduce((a, b) => a + b.value, 0);
  const catColors = [AU.teal, AU.emerald, AU.sky, AU.violet, AU.indigo, AU.pink, AU.amber, AU.rose];

  return (
    <PageTransition>
      <AuroraMesh />
      <div className="p-6 space-y-5 relative">
        {/* Hero: Orbital Score + Vitals */}
        <AuroraCard className="p-8" glow={AU.teal}>
          <div className="flex items-center gap-8">
            <OrbitalScore score={latestScore} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Waves className="w-4 h-4" style={{ color: AU.teal }} />
                <span className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: AU.teal }}>Aurora Health</span>
              </div>
              <p className="text-[15px] leading-relaxed mb-5" style={{ color: AU.textMuted }}>
                Your org pulses at <strong style={{ color: AU.text }}>{latestScore ?? '--'}</strong>.
                {delta !== 0 && <> A shift of <span style={{ color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}</span> since last reading.</>}
              </p>
              <div className="flex gap-4">
                {[
                  { label: 'Average', value: avgScore, color: AU.sky, glyph: '~' },
                  { label: 'Open', value: openIssues, color: openIssues > 0 ? AU.amber : AU.emerald, glyph: openIssues > 0 ? '!' : '-' },
                  { label: 'Critical', value: critOpen, color: critOpen > 0 ? AU.rose : AU.emerald, glyph: critOpen > 0 ? '!!' : '-' },
                ].map(v => (
                  <div key={v.label} className="rounded-xl px-5 py-3 text-center" style={{ background: `${v.color}08`, border: `1px solid ${v.color}15` }}>
                    <span className="text-2xl font-bold block" style={{ color: v.color, textShadow: `0 0 20px ${v.color}25` }}>{v.value}</span>
                    <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: AU.textMuted }}>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AuroraCard>

        {/* AI Insight as aurora whisper */}
        {data?.recent_scans?.[0]?.summary && (
          <AuroraCard className="p-5" glow={AU.violet}>
            <div className="flex items-start gap-3">
              <motion.div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${AU.teal}, ${AU.violet})` }}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Waves className="w-4 h-4 text-white" />
              </motion.div>
              <div>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: AU.violet }}>Whisper</span>
                <p className="text-[14px] leading-relaxed mt-1 line-clamp-2" style={{ color: AU.text }}>{data.recent_scans[0].summary}</p>
              </div>
            </div>
          </AuroraCard>
        )}

        {/* Trend: Dual gradient area */}
        {trendData.length > 0 && (
          <AuroraCard className="p-6" glow={AU.sky}>
            <h3 className="text-[13px] font-bold tracking-[0.15em] uppercase mb-5" style={{ color: AU.sky }}>Signal Trace</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="auGrad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AU.teal} stopOpacity={0.25} />
                      <stop offset="50%" stopColor={AU.violet} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={AU.rose} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="auStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={AU.teal} />
                      <stop offset="50%" stopColor={AU.violet} />
                      <stop offset="100%" stopColor={AU.rose} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 8" stroke={AU.border} />
                  <XAxis dataKey="date" tick={{ fill: AU.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: AU.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: AU.deep, border: `1px solid ${AU.borderGlow}`, borderRadius: 14, fontSize: 12, backdropFilter: 'blur(20px)' }}
                    labelStyle={{ color: AU.teal }}
                    itemStyle={{ color: AU.text }}
                  />
                  <Area type="natural" dataKey="score" stroke="url(#auStroke)" strokeWidth={2.5} fill="url(#auGrad1)" dot={{ fill: AU.teal, strokeWidth: 0, r: 3.5 }} activeDot={{ r: 6, fill: AU.void, stroke: AU.teal, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AuroraCard>
        )}

        {/* Two columns: Severity + Categories */}
        <div className="grid grid-cols-12 gap-5">
          {/* Severity - Orbiting dots */}
          <AuroraCard className="col-span-12 xl:col-span-5 p-6" glow={AU.rose}>
            <h3 className="text-[13px] font-bold tracking-[0.15em] uppercase mb-5" style={{ color: AU.rose }}>Spectrum</h3>
            {totalSev === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: AU.textDim }}>Silence. No findings detected.</div>
            ) : (
              <div className="flex items-center gap-5">
                <div className="w-36 h-36 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityEntries} cx="50%" cy="50%" innerRadius="55%" outerRadius="82%" dataKey="value" stroke="none" paddingAngle={4}>
                        {severityEntries.map(d => <Cell key={d.name} fill={SEV_AU[d.name]} opacity={0.8} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {severityEntries.map(d => {
                    const pct = Math.round((d.value / totalSev) * 100);
                    return (
                      <button
                        key={d.name}
                        onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                        className="w-full text-left group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: SEV_AU[d.name], boxShadow: `0 0 6px ${SEV_AU[d.name]}60` }} />
                            <span className="text-[13px] group-hover:text-white transition-colors" style={{ color: AU.text }}>{d.name}</span>
                          </div>
                          <span className="text-[12px]" style={{ color: AU.textMuted }}>{d.value} ({pct}%)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </AuroraCard>

          {/* Categories - Gradient wave bars */}
          <AuroraCard className="col-span-12 xl:col-span-7 p-6" glow={AU.emerald}>
            <h3 className="text-[13px] font-bold tracking-[0.15em] uppercase mb-5" style={{ color: AU.emerald }}>Frequencies</h3>
            {categoryEntries.length === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: AU.textDim }}>No frequencies detected yet.</div>
            ) : (
              <div className="space-y-3.5">
                {categoryEntries.map(([name, score], i) => {
                  const color = catColors[i % catColors.length];
                  return (
                    <button
                      key={name}
                      onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] group-hover:text-white transition-colors" style={{ color: AU.text }}>{name}</span>
                        <span className="text-[13px] font-bold" style={{ color, textShadow: `0 0 12px ${color}30` }}>{score}</span>
                      </div>
                      <WaveBar value={score} max={100} color={color} delay={i * 0.06} />
                    </button>
                  );
                })}
              </div>
            )}
          </AuroraCard>
        </div>

        {/* Recent Scans - Aurora stream */}
        <AuroraCard className="overflow-hidden" glow={AU.indigo}>
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-[13px] font-bold tracking-[0.15em] uppercase" style={{ color: AU.indigo }}>Recent Signals</h3>
            <button onClick={() => navigate('/scans')} className="text-[12px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: AU.teal }}>
              All signals <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-6 pb-6 text-center py-10 text-[14px]" style={{ color: AU.textDim }}>
              The aurora awaits your first scan.
            </div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? AU.emerald : (s.health_score || 0) >= 50 ? AU.sky : AU.rose;
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-6 py-3.5 transition-all text-left group"
                    style={{ borderTop: i > 0 ? `1px solid ${AU.border}` : undefined }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mr-4"
                      style={{ background: `${sColor}12`, border: `1px solid ${sColor}20` }}>
                      <span className="text-[14px] font-bold" style={{ color: sColor }}>{s.health_score || 0}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium block group-hover:text-white transition-colors" style={{ color: AU.text }}>{s.org_alias}</span>
                      <span className="text-[11px]" style={{ color: AU.textDim }}>{timeAgo(s.started_at)} &middot; {s.total_findings || 0} findings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: AU.textMuted }} />
                  </motion.button>
                );
              })}
            </div>
          )}
        </AuroraCard>

        {/* Action strip */}
        <div className="flex items-center justify-center gap-3 pt-2 pb-6">
          {[
            { label: 'New Scan', color: AU.teal, action: () => navigate('/scans/new') },
            { label: 'All Scans', color: AU.violet, action: () => navigate('/scans') },
            { label: 'Settings', color: AU.indigo, action: () => navigate('/settings') },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.action}
              className="px-5 py-2 rounded-xl text-[13px] font-semibold transition-all hover:scale-105"
              style={{ background: `${a.color}12`, color: a.color, border: `1px solid ${a.color}20` }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <ChartDrillModal
        filter={drillFilter}
        findings={drillFindings}
        scanId={latestScanId}
        onClose={() => setDrillFilter(null)}
        onFindingsChange={() => { load(); if (latestScanId) api.getScan(latestScanId).then(s => setDrillFindings(s.findings || [])); }}
      />
    </PageTransition>
  );
}
