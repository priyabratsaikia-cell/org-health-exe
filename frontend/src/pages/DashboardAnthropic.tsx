import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

/*
 * Anthropic's design: warm, literary, cream-on-brown tones,
 * generous whitespace, serif-inspired headings, conversational AI voice,
 * rounded but restrained, sandy/parchment palette.
 */

const AN = {
  bg: '#1A1510',
  surface: '#231E17',
  surfaceAlt: '#2C261D',
  border: 'rgba(194, 170, 135, 0.10)',
  borderHover: 'rgba(194, 170, 135, 0.20)',
  cream: '#E8DCC8',
  sand: '#C2AA87',
  sandMuted: '#9A8B72',
  warmGray: '#6B5F50',
  parchment: '#D4C4A8',
  rust: '#C17444',
  teal: '#5B9E8F',
  plum: '#9B6B9E',
  clay: '#B85C3A',
  sage: '#7FA67C',
  ochre: '#D4A63C',
  ink: '#F5EDE0',
};

const SEV_AN: Record<string, string> = {
  Critical: AN.clay,
  High: AN.rust,
  Medium: AN.ochre,
  Low: AN.sage,
  Info: AN.teal,
};

function WarmCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className={`rounded-xl ${className}`}
      style={{ background: AN.surface, border: `1px solid ${AN.border}` }}
    >
      {children}
    </motion.div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-[14.5px] leading-[1.7]" style={{ color: AN.parchment, fontFamily: '"Georgia", "Times New Roman", serif' }}>{children}</p>;
}

export default function DashboardAnthropic() {
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
        <div className="max-w-4xl mx-auto py-10 px-6 space-y-6">
          {[120, 200, 280].map((h, i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ background: AN.surface, height: h }} />
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

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => b[1] - a[1]);
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(n => ({ name: n, value: ext?.severity_totals?.[n] || 0 })).filter(d => d.value > 0);
  const totalSev = severityEntries.reduce((a, b) => a + b.value, 0);
  const riskData = (ext?.top_risk_categories || []).slice(0, 5);

  const scoreDescriptor = latestScore >= 90 ? 'excellent' : latestScore >= 75 ? 'healthy' : latestScore >= 60 ? 'fair' : latestScore >= 40 ? 'concerning' : 'critical';
  const deltaWord = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'held steady';

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
        {/* Warm header with conversational tone */}
        <div className="pb-2">
          <h1 className="text-[26px] font-normal tracking-tight" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>
            Health Overview
          </h1>
          <p className="text-[14px] mt-1" style={{ color: AN.sandMuted }}>
            A thoughtful summary of your Salesforce org's wellbeing
          </p>
        </div>

        {/* Score Hero - narrative style */}
        <WarmCard className="p-7">
          <div className="flex items-start gap-8">
            <div className="flex flex-col items-center flex-shrink-0">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="text-7xl font-light tracking-tighter"
                style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}
              >
                {latestScore}
              </motion.span>
              <span className="text-[12px] font-medium tracking-wide uppercase mt-1" style={{ color: AN.sand }}>{scoreGrade(latestScore)}</span>
              <div className="flex items-center gap-1.5 mt-3">
                <DeltaIcon className="w-3.5 h-3.5" style={{ color: delta >= 0 ? AN.sage : AN.clay }} />
                <span className="text-[13px] font-medium" style={{ color: delta >= 0 ? AN.sage : AN.clay }}>{delta > 0 ? '+' : ''}{delta}</span>
              </div>
            </div>
            <div className="flex-1 pt-1">
              <Prose>
                Your org health is currently <strong style={{ color: AN.cream }}>{scoreDescriptor}</strong> at {latestScore} out of 100.
                {trendData.length >= 2 && <> The score has {deltaWord} by {Math.abs(delta)} points since the previous scan.</>}
                {' '}There {openIssues === 1 ? 'is' : 'are'} <strong style={{ color: openIssues > 0 ? AN.rust : AN.sage }}>{openIssues} open issue{openIssues !== 1 ? 's' : ''}</strong> across your org
                {critOpen > 0 && <>, of which <strong style={{ color: AN.clay }}>{critOpen} {critOpen === 1 ? 'is' : 'are'} critical</strong> and {critOpen === 1 ? 'requires' : 'require'} attention</>}.
              </Prose>
            </div>
          </div>
        </WarmCard>

        {/* Metrics as prose cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Average Health', value: avgScore, note: `over ${Math.min(5, history.length)} scans`, color: AN.teal },
            { label: 'Open Findings', value: openIssues, note: `${stats?.resolved_findings || 0} resolved`, color: openIssues > 0 ? AN.ochre : AN.sage },
            { label: 'Critical Issues', value: critOpen, note: critOpen > 0 ? 'needs attention' : 'none outstanding', color: critOpen > 0 ? AN.clay : AN.sage },
          ].map(m => (
            <WarmCard key={m.label} className="p-5">
              <span className="text-[11px] font-medium tracking-wider uppercase" style={{ color: AN.sandMuted }}>{m.label}</span>
              <div className="text-3xl font-light mt-2 tracking-tight" style={{ color: m.color, fontFamily: '"Georgia", serif' }}>{m.value}</div>
              <span className="text-[12px] mt-1 block" style={{ color: AN.warmGray }}>{m.note}</span>
            </WarmCard>
          ))}
        </div>

        {/* AI Insight - as a literary quote */}
        {data?.recent_scans?.[0]?.summary && (
          <WarmCard className="p-6">
            <div className="flex items-start gap-4">
              <BookOpen className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: AN.sand }} />
              <div>
                <span className="text-[11px] font-medium tracking-wider uppercase" style={{ color: AN.sand }}>Claude's Analysis</span>
                <blockquote className="mt-2 pl-4" style={{ borderLeft: `2px solid ${AN.rust}40` }}>
                  <Prose>{data.recent_scans[0].summary}</Prose>
                </blockquote>
              </div>
            </div>
          </WarmCard>
        )}

        {/* Trend */}
        {trendData.length > 0 && (
          <WarmCard className="p-6">
            <h3 className="text-[16px] font-normal mb-1" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>Health Trajectory</h3>
            <p className="text-[12px] mb-5" style={{ color: AN.warmGray }}>How your score has evolved over time</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="anthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AN.rust} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={AN.rust} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 8" stroke={AN.border} />
                  <XAxis dataKey="date" tick={{ fill: AN.warmGray, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: AN.warmGray, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: AN.surfaceAlt, border: `1px solid ${AN.border}`, borderRadius: 10, fontSize: 13 }}
                    labelStyle={{ color: AN.sand }}
                    itemStyle={{ color: AN.rust }}
                  />
                  <Area type="natural" dataKey="score" stroke={AN.rust} strokeWidth={2} fill="url(#anthGrad)" dot={{ fill: AN.rust, strokeWidth: 0, r: 3.5 }} activeDot={{ r: 5.5, fill: AN.cream, stroke: AN.rust, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </WarmCard>
        )}

        {/* Two column: Severity + Categories */}
        <div className="grid grid-cols-2 gap-4">
          {/* Severity */}
          <WarmCard className="p-6">
            <h3 className="text-[16px] font-normal mb-4" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>Findings by Severity</h3>
            {severityEntries.length === 0 ? (
              <p className="py-6 text-center text-[14px]" style={{ color: AN.warmGray }}>No findings recorded yet.</p>
            ) : (
              <div className="space-y-3.5">
                {severityEntries.map(d => {
                  const pct = Math.round((d.value / totalSev) * 100);
                  return (
                    <button
                      key={d.name}
                      onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: SEV_AN[d.name] }} />
                          <span className="text-[13.5px] group-hover:text-white transition-colors" style={{ color: AN.parchment, fontFamily: '"Georgia", serif' }}>{d.name}</span>
                        </div>
                        <span className="text-[13px]" style={{ color: AN.sand }}>{d.value} <span style={{ color: AN.warmGray }}>({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${AN.border}` }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full rounded-full"
                          style={{ background: SEV_AN[d.name] }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </WarmCard>

          {/* Categories */}
          <WarmCard className="p-6">
            <h3 className="text-[16px] font-normal mb-4" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>Category Scores</h3>
            {categoryEntries.length === 0 ? (
              <p className="py-6 text-center text-[14px]" style={{ color: AN.warmGray }}>Run a scan to see category breakdowns.</p>
            ) : (
              <div className="space-y-3">
                {categoryEntries.map(([name, score], i) => {
                  const barColor = score >= 75 ? AN.sage : score >= 50 ? AN.ochre : AN.clay;
                  return (
                    <button
                      key={name}
                      onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] group-hover:text-white transition-colors truncate mr-2" style={{ color: AN.parchment }}>{name}</span>
                        <span className="text-[13px] font-medium" style={{ color: barColor }}>{score}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: AN.border }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${score}%` }}
                          transition={{ duration: 0.9, delay: i * 0.04 }}
                          className="h-full rounded-full"
                          style={{ background: barColor }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </WarmCard>
        </div>

        {/* Risk Categories Bar */}
        {riskData.length > 0 && (
          <WarmCard className="p-6">
            <h3 className="text-[16px] font-normal mb-1" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>Areas of Concern</h3>
            <p className="text-[12px] mb-5" style={{ color: AN.warmGray }}>Categories with the most open findings</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData.map(r => ({ name: r.category, value: r.cnt }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="2 8" stroke={AN.border} horizontal={false} />
                  <XAxis type="number" tick={{ fill: AN.warmGray, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: AN.sand, fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ backgroundColor: AN.surfaceAlt, border: `1px solid ${AN.border}`, borderRadius: 10, fontSize: 13 }} />
                  <Bar
                    dataKey="value" radius={[0, 4, 4, 0]} barSize={14} cursor="pointer"
                    onClick={(entry: any) => { if (entry?.name) handleDrill({ type: 'category', value: String(entry.name), label: `${entry.name} Findings` }); }}
                  >
                    {riskData.map((_, i) => <Cell key={i} fill={i === 0 ? AN.clay : AN.rust} opacity={0.75} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </WarmCard>
        )}

        {/* Recent Scans */}
        <WarmCard className="overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-[16px] font-normal" style={{ color: AN.cream, fontFamily: '"Georgia", serif' }}>Recent Scans</h3>
            <button onClick={() => navigate('/scans')} className="text-[13px] font-medium flex items-center gap-1" style={{ color: AN.rust }}>
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-6 pb-6 text-center py-8">
              <Prose>No scans have been run yet. Start your first health scan to build a picture of your org.</Prose>
            </div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? AN.sage : (s.health_score || 0) >= 50 ? AN.ochre : AN.clay;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-6 py-4 transition-colors text-left group"
                    style={{ borderTop: i > 0 ? `1px solid ${AN.border}` : undefined, background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = AN.surfaceAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="text-2xl font-light mr-5 w-10 text-right" style={{ color: sColor, fontFamily: '"Georgia", serif' }}>{s.health_score || 0}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium block" style={{ color: AN.cream }}>{s.org_alias}</span>
                      <span className="text-[12px]" style={{ color: AN.warmGray }}>{timeAgo(s.started_at)} &middot; {s.total_findings || 0} findings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: AN.sand }} />
                  </button>
                );
              })}
            </div>
          )}
        </WarmCard>

        {/* Warm footer actions */}
        <div className="flex items-center justify-center gap-8 pt-2 pb-8">
          {[
            { label: 'Run a new scan', action: () => navigate('/scans/new') },
            { label: 'Browse all scans', action: () => navigate('/scans') },
            { label: 'Settings', action: () => navigate('/settings') },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.action}
              className="text-[13px] font-medium transition-colors"
              style={{ color: AN.rust, borderBottom: `1px solid transparent` }}
              onMouseEnter={e => (e.currentTarget.style.borderBottomColor = AN.rust)}
              onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
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
        onFindingsChange={() => { load(); api.getAllFindings(state.selectedOrg?.alias).then(r => setDrillFindings(r.findings)); }}
      />
    </PageTransition>
  );
}
