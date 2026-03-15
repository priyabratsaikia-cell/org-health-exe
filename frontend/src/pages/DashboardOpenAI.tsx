import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Send, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

/*
 * OpenAI design: ChatGPT-inspired. Clean dark (#212121), bright green accent (#10A37F),
 * clean sans-serif (Söhne / system), conversation-bubble style AI insights,
 * ultra-clean spacing, subtle rounded corners, muted separators.
 */

const OA = {
  bg: '#212121',
  surface: '#2F2F2F',
  surfaceHover: '#3A3A3A',
  surfaceBright: '#424242',
  border: 'rgba(255, 255, 255, 0.08)',
  green: '#10A37F',
  greenLight: '#19C37D',
  greenMuted: 'rgba(16, 163, 127, 0.12)',
  text: '#ECECF1',
  textSecondary: '#B4B4B4',
  textMuted: '#8E8EA0',
  white: '#FFFFFF',
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  purple: '#A855F7',
};

const SEV_OA: Record<string, string> = {
  Critical: OA.red,
  High: OA.orange,
  Medium: OA.yellow,
  Low: OA.greenLight,
  Info: OA.purple,
};

function OACard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl ${className}`}
      style={{ background: OA.surface, border: `1px solid ${OA.border}` }}
    >
      {children}
    </motion.div>
  );
}

function ChatBubble({ role, children }: { role: 'assistant' | 'system'; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: role === 'assistant' ? OA.green : OA.surfaceBright }}
      >
        {role === 'assistant' ? (
          <Sparkles className="w-3.5 h-3.5 text-white" />
        ) : (
          <span className="text-[10px] font-bold" style={{ color: OA.textMuted }}>SYS</span>
        )}
      </div>
      <div className="flex-1 rounded-2xl px-4 py-3" style={{ background: role === 'assistant' ? 'transparent' : OA.surfaceBright }}>
        {children}
      </div>
    </div>
  );
}

export default function DashboardOpenAI() {
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
    if (!latestScanId) return;
    try {
      const scan = await api.getScan(latestScanId);
      setDrillFindings(scan.findings || []);
      setDrillFilter(filter);
    } catch (e: any) {
      toast('Failed to load findings: ' + e.message, 'error');
    }
  }, [latestScanId, toast]);

  if (loading) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
          {[100, 200, 160].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ background: OA.surface, height: h }} />
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

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => b[1] - a[1]);
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(n => ({ name: n, value: ext?.severity_totals?.[n] || 0 })).filter(d => d.value > 0);
  const totalSev = severityEntries.reduce((a, b) => a + b.value, 0);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
        {/* Hero: Score + Stats */}
        <OACard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[12px] font-medium" style={{ color: OA.textMuted }}>Health Score</span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-5xl font-semibold tracking-tight" style={{ color: OA.text }}>{latestScore}</span>
                {delta !== 0 && (
                  <span className="flex items-center gap-1 text-[14px] font-medium" style={{ color: delta > 0 ? OA.greenLight : OA.red }}>
                    {delta > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    {Math.abs(delta)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-6">
              {[
                { label: 'Average', value: avgScore },
                { label: 'Open', value: openIssues },
                { label: 'Critical', value: critOpen },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <span className="text-xl font-semibold block" style={{ color: OA.text }}>{s.value}</span>
                  <span className="text-[11px]" style={{ color: OA.textMuted }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </OACard>

        {/* AI Insight - ChatGPT bubble */}
        {data?.recent_scans?.[0]?.summary && (
          <OACard className="p-5">
            <ChatBubble role="assistant">
              <p className="text-[14px] leading-relaxed" style={{ color: OA.text }}>{data.recent_scans[0].summary}</p>
            </ChatBubble>
          </OACard>
        )}

        {/* Trend */}
        {trendData.length > 0 && (
          <OACard className="p-5">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: OA.text }}>Score Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="oaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={OA.green} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={OA.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: OA.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: OA.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: OA.surfaceBright, border: `1px solid ${OA.border}`, borderRadius: 12, fontSize: 13 }}
                    labelStyle={{ color: OA.textMuted }}
                    itemStyle={{ color: OA.green }}
                  />
                  <Area type="monotone" dataKey="score" stroke={OA.green} strokeWidth={2} fill="url(#oaGrad)" dot={false} activeDot={{ r: 4.5, fill: OA.green, stroke: OA.bg, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </OACard>
        )}

        {/* Severity + Findings side by side */}
        <div className="grid grid-cols-2 gap-4">
          <OACard className="p-5">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: OA.text }}>Severity</h3>
            {severityEntries.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ color: OA.textMuted }}>No findings yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityEntries} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="value" stroke="none" paddingAngle={2}>
                        {severityEntries.map(d => <Cell key={d.name} fill={SEV_OA[d.name]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 flex-1">
                  {severityEntries.map(d => (
                    <button
                      key={d.name}
                      onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                      className="w-full flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm" style={{ background: SEV_OA[d.name] }} />
                        <span className="text-[13px] group-hover:text-white transition-colors" style={{ color: OA.textSecondary }}>{d.name}</span>
                      </div>
                      <span className="text-[13px] font-medium" style={{ color: OA.text }}>{d.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </OACard>

          <OACard className="p-5">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: OA.text }}>Findings per Scan</h3>
            {trendData.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ color: OA.textMuted }}>No data</p>
            ) : (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <XAxis dataKey="date" tick={{ fill: OA.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: OA.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: OA.surfaceBright, border: `1px solid ${OA.border}`, borderRadius: 12, fontSize: 13 }} />
                    <Bar dataKey="findings" radius={[6, 6, 0, 0]} barSize={16}>
                      {trendData.map((_, i) => <Cell key={i} fill={OA.green} opacity={0.5 + (i / trendData.length) * 0.5} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </OACard>
        </div>

        {/* Categories */}
        {categoryEntries.length > 0 && (
          <OACard className="p-5">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: OA.text }}>Categories</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {categoryEntries.map(([name, score], i) => {
                const barColor = score >= 75 ? OA.greenLight : score >= 50 ? OA.yellow : OA.red;
                return (
                  <button
                    key={name}
                    onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                    className="text-left group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] truncate mr-2 group-hover:text-white transition-colors" style={{ color: OA.textSecondary }}>{name}</span>
                      <span className="text-[13px] font-medium" style={{ color: barColor }}>{score}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score}%` }}
                        transition={{ duration: 0.7, delay: i * 0.03 }}
                        className="h-full rounded-full"
                        style={{ background: barColor }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </OACard>
        )}

        {/* Recent Scans */}
        <OACard className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: OA.text }}>Recent Scans</h3>
            <button onClick={() => navigate('/scans')} className="text-[13px] font-medium" style={{ color: OA.green }}>See all</button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-5 pb-5 text-center py-8 text-[13px]" style={{ color: OA.textMuted }}>No scans yet</div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? OA.greenLight : (s.health_score || 0) >= 50 ? OA.yellow : OA.red;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-5 py-3 text-left transition-colors group"
                    style={{ borderTop: i > 0 ? `1px solid ${OA.border}` : undefined }}
                    onMouseEnter={e => (e.currentTarget.style.background = OA.surfaceHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mr-3" style={{ background: `${sColor}15` }}>
                      <span className="text-[14px] font-semibold" style={{ color: sColor }}>{s.health_score || 0}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium block" style={{ color: OA.text }}>{s.org_alias}</span>
                      <span className="text-[12px]" style={{ color: OA.textMuted }}>{timeAgo(s.started_at)} &middot; {s.total_findings || 0} findings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: OA.textMuted }} />
                  </button>
                );
              })}
            </div>
          )}
        </OACard>

        {/* Action Bar - ChatGPT input style */}
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3"
          style={{ background: OA.surfaceBright, border: `1px solid ${OA.border}` }}
        >
          {[
            { label: 'New Scan', action: () => navigate('/scans/new') },
            { label: 'All Scans', action: () => navigate('/scans') },
            { label: 'Settings', action: () => navigate('/settings') },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.action}
              className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={{ background: OA.greenMuted, color: OA.greenLight }}
              onMouseEnter={e => (e.currentTarget.style.background = `rgba(16, 163, 127, 0.2)`)}
              onMouseLeave={e => (e.currentTarget.style.background = OA.greenMuted)}
            >
              {a.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => navigate('/scans/new')}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: OA.green }}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
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
