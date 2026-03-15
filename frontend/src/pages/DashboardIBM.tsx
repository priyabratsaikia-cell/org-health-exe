import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUp, ArrowDown, Minus, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, ComposedChart, Area } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, fmtDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

const C = {
  gray100: '#161616',
  gray90: '#262626',
  gray80: '#393939',
  gray70: '#525252',
  gray60: '#6F6F6F',
  gray50: '#8D8D8D',
  gray40: '#A8A8A8',
  gray30: '#C6C6C6',
  gray20: '#E0E0E0',
  gray10: '#F4F4F4',
  blue80: '#002D9C',
  blue60: '#0F62FE',
  blue40: '#78A9FF',
  blue20: '#D0E2FF',
  teal60: '#009D9A',
  teal40: '#08BDBA',
  purple60: '#8A3FFC',
  purple40: '#BE95FF',
  red60: '#DA1E28',
  red40: '#FF8389',
  magenta60: '#D02670',
  magenta40: '#FF7EB6',
  green60: '#198038',
  green40: '#42BE65',
  orange40: '#FF832B',
  yellow30: '#F1C21B',
  cyan40: '#33B1FF',
  white: '#FFFFFF',
  supportError: '#FA4D56',
  supportWarning: '#F1C21B',
  supportSuccess: '#42BE65',
  supportInfo: '#4589FF',
};

const SEVERITY_IBM: Record<string, { color: string; tag: string }> = {
  Critical: { color: C.red40, tag: 'Red' },
  High: { color: C.orange40, tag: 'Orange' },
  Medium: { color: C.yellow30, tag: 'Yellow' },
  Low: { color: C.green40, tag: 'Green' },
  Info: { color: C.blue40, tag: 'Blue' },
};

function CarbonTile({ children, className = '', clickable, onClick, style }: { children: React.ReactNode; className?: string; clickable?: boolean; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div
      onClick={onClick}
      className={`border-t-0 ${clickable ? 'cursor-pointer transition-colors hover:bg-[#353535]' : ''} ${className}`}
      style={{ background: C.gray90, borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${C.gray80}`, ...style }}
    >
      {children}
    </div>
  );
}

function CarbonTag({ text, color, type = 'default' }: { text: string; color: string; type?: 'default' | 'outline' }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[12px] font-normal"
      style={type === 'outline'
        ? { border: `1px solid ${color}`, color, background: 'transparent' }
        : { background: `${color}30`, color }
      }
    >
      {text}
    </span>
  );
}

export default function DashboardIBM() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
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
        <div className="space-y-0">
          {[80, 200, 300].map((h, i) => (
            <div key={i} className="animate-pulse" style={{ background: C.gray90, height: h, borderBottom: `1px solid ${C.gray80}` }} />
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
  const resolved = stats?.resolved_findings || 0;
  const totalFindings = stats?.total_findings || 0;

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => a[1] - b[1]);
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(name => ({ name, value: ext?.severity_totals?.[name] || 0 })).filter(d => d.value > 0);
  const riskData = (ext?.top_risk_categories || []).slice(0, 6);

  const tabs = ['Overview', 'Trends', 'Details'];

  return (
    <PageTransition>
      <div>
        {/* Page Header */}
        <div className="px-6 pt-5 pb-4" style={{ background: C.gray100 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-normal" style={{ color: C.gray50 }}>Dashboards</span>
            <span style={{ color: C.gray50 }}>/</span>
            <span className="text-[12px] font-normal" style={{ color: C.gray10 }}>Org Health</span>
          </div>
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-light tracking-tight" style={{ color: C.white, fontFamily: '"IBM Plex Sans", sans-serif' }}>
              Org Health Dashboard
            </h1>
            <button
              onClick={() => navigate('/scans/new')}
              className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-normal transition-colors hover:brightness-90"
              style={{ background: C.blue60, color: C.white }}
            >
              Run health scan
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ background: C.gray100, borderColor: C.gray80 }}>
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className="px-5 py-3 text-[14px] font-normal transition-colors relative"
              style={{ color: activeTab === i ? C.white : C.gray50 }}
            >
              {tab}
              {activeTab === i && <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: C.blue60 }} />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 0 && (
          <div>
            {/* KPI Row */}
            <div className="grid grid-cols-4">
              {[
                { label: 'Health Score', value: latestScore, helper: scoreGrade(latestScore), delta, color: latestScore >= 75 ? C.supportSuccess : latestScore >= 50 ? C.supportWarning : C.supportError },
                { label: 'Average Score', value: avgScore, helper: `Last ${Math.min(5, history.length)} scans`, color: C.blue40 },
                { label: 'Open Issues', value: openIssues, helper: `${resolved} resolved`, color: openIssues > 0 ? C.supportWarning : C.supportSuccess },
                { label: 'Critical Findings', value: critOpen, helper: critOpen > 0 ? 'Action required' : 'No critical issues', color: critOpen > 0 ? C.supportError : C.supportSuccess },
              ].map((kpi, i) => (
                <CarbonTile key={kpi.label} className="p-5" style={{ borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined }}>
                  <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>{kpi.label}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[36px] font-light tracking-tight" style={{ color: C.gray10 }}>{kpi.value}</span>
                    {kpi.delta !== undefined && kpi.delta !== 0 && (
                      <span className="flex items-center gap-0.5 text-[12px]" style={{ color: kpi.delta > 0 ? C.supportSuccess : C.supportError }}>
                        <DeltaIcon className="w-3 h-3" />
                        {Math.abs(kpi.delta)}
                      </span>
                    )}
                  </div>
                  <span className="text-[12px] font-normal" style={{ color: C.gray50 }}>{kpi.helper}</span>
                </CarbonTile>
              ))}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2">
              {/* Severity Breakdown */}
              <CarbonTile className="p-5" style={{ borderRight: `1px solid ${C.gray80}` }}>
                <h4 className="text-[14px] font-semibold mb-4" style={{ color: C.gray10 }}>Findings by Severity</h4>
                {severityEntries.length === 0 ? (
                  <div className="py-8 text-center text-[14px]" style={{ color: C.gray50 }}>No findings data available</div>
                ) : (
                  <div className="space-y-3">
                    {severityEntries.map(d => {
                      const info = SEVERITY_IBM[d.name];
                      const maxVal = Math.max(...severityEntries.map(s => s.value));
                      const pct = (d.value / maxVal) * 100;
                      return (
                        <button
                          key={d.name}
                          onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <CarbonTag text={d.name} color={info.color} />
                            </div>
                            <span className="text-[14px] font-normal" style={{ color: C.gray10 }}>{d.value}</span>
                          </div>
                          <div className="h-1" style={{ background: C.gray80 }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full"
                              style={{ background: info.color }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CarbonTile>

              {/* Category Scores */}
              <CarbonTile className="p-5">
                <h4 className="text-[14px] font-semibold mb-4" style={{ color: C.gray10 }}>Category Scores</h4>
                {categoryEntries.length === 0 ? (
                  <div className="py-8 text-center text-[14px]" style={{ color: C.gray50 }}>No category data</div>
                ) : (
                  <div className="space-y-2.5">
                    {categoryEntries.map(([name, score]) => {
                      const barColor = score >= 75 ? C.green40 : score >= 50 ? C.yellow30 : C.red40;
                      return (
                        <button
                          key={name}
                          onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] group-hover:text-white transition-colors" style={{ color: C.gray30 }}>{name}</span>
                            <span className="text-[13px] font-normal" style={{ color: barColor }}>{score}/100</span>
                          </div>
                          <div className="h-1" style={{ background: C.gray80 }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${score}%` }}
                              transition={{ duration: 0.8 }}
                              className="h-full"
                              style={{ background: barColor }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CarbonTile>
            </div>

            {/* AI Summary Row */}
            {data?.recent_scans?.[0]?.summary && (
              <CarbonTile className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: C.purple60 }}>
                    <span className="text-[10px] font-bold text-white">AI</span>
                  </div>
                  <div>
                    <span className="text-[12px] font-semibold block mb-1" style={{ color: C.purple40 }}>AI-Generated Summary</span>
                    <p className="text-[14px] leading-relaxed line-clamp-2" style={{ color: C.gray30 }}>{data.recent_scans[0].summary}</p>
                  </div>
                </div>
              </CarbonTile>
            )}

            {/* Structured Data Table */}
            <CarbonTile className="p-0">
              <div className="flex items-center justify-between px-5 py-3" style={{ background: C.gray80 }}>
                <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Recent Scans</span>
                <button onClick={() => navigate('/scans')} className="text-[14px] font-normal flex items-center gap-1" style={{ color: C.blue40 }}>
                  View all <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              {(!data?.recent_scans || data.recent_scans.length === 0) ? (
                <div className="px-5 py-8 text-center text-[14px]" style={{ color: C.gray50 }}>No scan data available. Run a health scan to get started.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}` }}>
                      {['Org', 'Score', 'Status', 'Findings', 'Date', ''].map(h => (
                        <th key={h} className="text-left px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.gray30 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_scans.map(s => {
                      const sColor = (s.health_score || 0) >= 75 ? C.supportSuccess : (s.health_score || 0) >= 50 ? C.supportWarning : C.supportError;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => navigate(`/scans/${s.id}`)}
                          className="cursor-pointer transition-colors hover:bg-[#353535]"
                          style={{ borderBottom: `1px solid ${C.gray80}` }}
                        >
                          <td className="px-5 py-3 text-[14px] font-normal" style={{ color: C.gray10 }}>{s.org_alias}</td>
                          <td className="px-5 py-3">
                            <span className="text-[14px] font-semibold" style={{ color: sColor }}>{s.health_score || 0}</span>
                          </td>
                          <td className="px-5 py-3">
                            <CarbonTag
                              text={s.status === 'completed' ? 'Completed' : s.status === 'running' ? 'Running' : 'Failed'}
                              color={s.status === 'completed' ? C.supportSuccess : s.status === 'running' ? C.supportInfo : C.supportError}
                              type="outline"
                            />
                          </td>
                          <td className="px-5 py-3 text-[14px]" style={{ color: C.gray30 }}>{s.total_findings || 0}</td>
                          <td className="px-5 py-3 text-[14px]" style={{ color: C.gray50 }}>{timeAgo(s.started_at)}</td>
                          <td className="px-5 py-3"><ChevronRight className="w-4 h-4" style={{ color: C.gray50 }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CarbonTile>
          </div>
        )}

        {activeTab === 1 && (
          <div>
            {/* Trend Chart Full Width */}
            <CarbonTile className="p-5">
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Health Score Over Time</h4>
              <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Tracking org health across all scans</p>
              {trendData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-[14px]" style={{ color: C.gray50 }}>Insufficient data. Run multiple scans to see trends.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <defs>
                        <linearGradient id="ibmGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.blue40} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={C.blue40} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={C.gray80} strokeDasharray="none" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: C.gray50, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: C.gray50, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 13 }}
                        labelStyle={{ color: C.gray30 }}
                      />
                      <Area type="monotone" dataKey="score" stroke="none" fill="url(#ibmGrad)" />
                      <Line type="monotone" dataKey="score" stroke={C.blue40} strokeWidth={2} dot={{ fill: C.blue40, strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: C.blue60 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CarbonTile>

            {/* Findings Activity */}
            <CarbonTile className="p-5">
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Findings per Scan</h4>
              <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Number of issues discovered in each scan</p>
              {trendData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: C.gray50 }}>No activity data</div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid stroke={C.gray80} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: C.gray50, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} />
                      <YAxis tick={{ fill: C.gray50, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 13 }} />
                      <Bar dataKey="findings" barSize={16}>
                        {trendData.map((entry, i) => (
                          <Cell key={i} fill={entry.findings > 10 ? C.red40 : entry.findings > 5 ? C.yellow30 : C.teal40} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CarbonTile>
          </div>
        )}

        {activeTab === 2 && (
          <div>
            {/* Risk Categories */}
            <CarbonTile className="p-5">
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Risk Categories</h4>
              <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Categories ranked by number of open findings</p>
              {riskData.length === 0 ? (
                <div className="py-8 text-center text-[14px]" style={{ color: C.gray50 }}>No risk data available</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskData.map(r => ({ name: r.category, value: r.cnt }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid stroke={C.gray80} horizontal={false} />
                      <XAxis type="number" tick={{ fill: C.gray50, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: C.gray30, fontSize: 12 }} axisLine={{ stroke: C.gray80 }} tickLine={false} width={120} />
                      <Tooltip contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 13 }} />
                      <Bar
                        dataKey="value"
                        barSize={14}
                        cursor="pointer"
                        onClick={(entry: any) => { if (entry?.name) handleDrill({ type: 'category', value: String(entry.name), label: `${entry.name} Findings` }); }}
                      >
                        {riskData.map((_, i) => <Cell key={i} fill={i === 0 ? C.red40 : i === 1 ? C.orange40 : C.cyan40} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CarbonTile>

            {/* Effort Distribution */}
            <CarbonTile className="p-5">
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Effort Distribution</h4>
              <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Remediation effort required for open findings</p>
              {(ext?.effort_distribution || []).length === 0 ? (
                <div className="py-8 text-center text-[14px]" style={{ color: C.gray50 }}>No effort data</div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {(ext?.effort_distribution || []).map(e => {
                    const color = e.effort === 'Quick Fix' ? C.green40 : e.effort === 'Medium' ? C.yellow30 : C.red40;
                    return (
                      <div key={e.effort} className="p-4" style={{ background: C.gray80, borderLeft: `3px solid ${color}` }}>
                        <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>{e.effort}</span>
                        <span className="text-[28px] font-light" style={{ color: C.gray10 }}>{e.cnt}</span>
                        <span className="text-[12px] block" style={{ color: C.gray50 }}>findings</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CarbonTile>
          </div>
        )}
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
