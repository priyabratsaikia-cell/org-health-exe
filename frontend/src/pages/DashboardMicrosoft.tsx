import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Plus, ChevronRight, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

/*
 * Microsoft Fluent Design System 2:
 * - Acrylic/Mica backgrounds, subtle layering
 * - Segoe UI variable font, clean hierarchy
 * - Fluent brand ramp: #0078D4 blue, neutral grays
 * - Rounded corners (8px for cards, 4px for controls)
 * - Subtle elevation with thin borders, no heavy shadows
 * - Compound components, data grids, personas
 */

const FL = {
  bg: '#1B1B1B',
  surface: '#282828',
  surfaceHover: '#333333',
  card: '#303030',
  border: 'rgba(255, 255, 255, 0.0578)',
  borderStrong: 'rgba(255, 255, 255, 0.0924)',
  text: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#D6D6D6',
  textTertiary: '#ADADAD',
  textDisabled: '#717171',
  brandPrimary: '#0078D4',
  brandLight: '#4BA0E8',
  brandDark: '#005A9E',
  brandBg: 'rgba(0, 120, 212, 0.08)',
  success: '#0E9349',
  warning: '#E9835E',
  danger: '#D13438',
  severe: '#DA3B01',
  info: '#0078D4',
};

const SEV_FL: Record<string, { color: string; bg: string }> = {
  Critical: { color: FL.danger, bg: 'rgba(209, 52, 56, 0.1)' },
  High: { color: FL.severe, bg: 'rgba(218, 59, 1, 0.1)' },
  Medium: { color: FL.warning, bg: 'rgba(233, 131, 94, 0.1)' },
  Low: { color: FL.success, bg: 'rgba(14, 147, 73, 0.1)' },
  Info: { color: FL.info, bg: 'rgba(0, 120, 212, 0.1)' },
};

function FluentCard({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`rounded-lg ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ background: FL.card, border: `1px solid ${FL.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)' }}
    >
      {children}
    </motion.div>
  );
}

function FluentBadge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold" style={{ background: bg, color }}>
      {text}
    </span>
  );
}

function FluentButton({ children, primary, onClick, className = '' }: { children: React.ReactNode; primary?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-[13px] font-semibold transition-colors ${className}`}
      style={primary
        ? { background: FL.brandPrimary, color: FL.text }
        : { background: 'transparent', color: FL.textSecondary, border: `1px solid ${FL.borderStrong}` }
      }
      onMouseEnter={e => {
        if (primary) e.currentTarget.style.background = FL.brandLight;
        else e.currentTarget.style.background = FL.surfaceHover;
      }}
      onMouseLeave={e => {
        if (primary) e.currentTarget.style.background = FL.brandPrimary;
        else e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

export default function DashboardMicrosoft() {
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
        <div className="p-5 space-y-4">
          <div className="h-20 rounded-lg animate-pulse" style={{ background: FL.card }} />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-lg animate-pulse" style={{ background: FL.card }} />)}
          </div>
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

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {});
  const radarData = categoryEntries.map(([name, score]) => ({ category: name.length > 12 ? name.substring(0, 10) + '..' : name, fullName: name, score }));
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(n => ({ name: n, value: ext?.severity_totals?.[n] || 0 })).filter(d => d.value > 0);
  const totalSev = severityEntries.reduce((a, b) => a + b.value, 0);
  const riskData = (ext?.top_risk_categories || []).slice(0, 5);

  return (
    <PageTransition>
      <div className="p-5 space-y-4">
        {/* Command Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold" style={{ color: FL.textPrimary }}>Org Health</h1>
            <span className="text-[12px]" style={{ color: FL.textTertiary }}>Monitor and manage your Salesforce org health</span>
          </div>
          <div className="flex items-center gap-2">
            <FluentButton primary onClick={() => navigate('/scans/new')}>
              <Plus className="w-3.5 h-3.5" /> New scan
            </FluentButton>
            <FluentButton onClick={() => navigate('/scans')}>View all</FluentButton>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Health Score', value: latestScore, delta, unit: '/100', color: latestScore >= 75 ? FL.success : latestScore >= 50 ? FL.warning : FL.danger },
            { label: 'Average Score', value: avgScore, unit: '/100', color: FL.brandPrimary },
            { label: 'Open Issues', value: openIssues, sub: `${resolved} resolved`, color: openIssues > 0 ? FL.warning : FL.success },
            { label: 'Critical', value: critOpen, sub: critOpen > 0 ? 'Action needed' : 'None', color: critOpen > 0 ? FL.danger : FL.success },
          ].map(kpi => (
            <FluentCard key={kpi.label} className="p-4">
              <span className="text-[12px] font-medium block mb-1" style={{ color: FL.textTertiary }}>{kpi.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-semibold" style={{ color: FL.textPrimary }}>{kpi.value}</span>
                {kpi.unit && <span className="text-[13px]" style={{ color: FL.textDisabled }}>{kpi.unit}</span>}
                {kpi.delta !== undefined && kpi.delta !== 0 && (
                  <span className="flex items-center gap-0.5 text-[12px] font-medium ml-1" style={{ color: kpi.delta > 0 ? FL.success : FL.danger }}>
                    {kpi.delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(kpi.delta)}
                  </span>
                )}
              </div>
              {kpi.sub && <span className="text-[11px] block mt-1" style={{ color: FL.textTertiary }}>{kpi.sub}</span>}
              <div className="h-0.5 mt-3 rounded-full" style={{ background: FL.border }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min((typeof kpi.value === 'number' ? kpi.value : 0), 100)}%`, background: kpi.color }} />
              </div>
            </FluentCard>
          ))}
        </div>

        {/* AI Copilot Card */}
        {data?.recent_scans?.[0]?.summary && (
          <FluentCard className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, #6264A7, #464EB8)` }}>
                <span className="text-[10px] font-bold text-white">Co</span>
              </div>
              <div>
                <span className="text-[12px] font-semibold block" style={{ color: '#6264A7' }}>Copilot Summary</span>
                <p className="text-[13px] leading-relaxed mt-1 line-clamp-2" style={{ color: FL.textSecondary }}>{data.recent_scans[0].summary}</p>
              </div>
            </div>
          </FluentCard>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-12 gap-4">
          {/* Trend Line */}
          <FluentCard className="col-span-12 xl:col-span-8 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold" style={{ color: FL.textPrimary }}>Score Trend</h3>
              <MoreHorizontal className="w-4 h-4" style={{ color: FL.textTertiary }} />
            </div>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[13px]" style={{ color: FL.textTertiary }}>No trend data available</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={FL.border} />
                    <XAxis dataKey="date" tick={{ fill: FL.textTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: FL.textTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: FL.card, border: `1px solid ${FL.borderStrong}`, borderRadius: 8, fontSize: 12, boxShadow: '0 8px 16px rgba(0,0,0,0.28)' }}
                      labelStyle={{ color: FL.textTertiary }}
                    />
                    <Line type="monotone" dataKey="score" stroke={FL.brandPrimary} strokeWidth={2.5} dot={{ fill: FL.brandPrimary, strokeWidth: 0, r: 3.5 }} activeDot={{ r: 5, fill: FL.brandLight, stroke: FL.brandPrimary, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </FluentCard>

          {/* Severity Donut */}
          <FluentCard className="col-span-12 xl:col-span-4 p-4">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: FL.textPrimary }}>By Severity</h3>
            {severityEntries.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[13px]" style={{ color: FL.textTertiary }}>No data</div>
            ) : (
              <>
                <div className="h-32 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityEntries} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" dataKey="value" stroke="none" paddingAngle={2}>
                        {severityEntries.map(d => <Cell key={d.name} fill={SEV_FL[d.name]?.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {severityEntries.map(d => (
                    <button
                      key={d.name}
                      onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                      className="w-full flex items-center justify-between py-1 group"
                    >
                      <div className="flex items-center gap-2">
                        <FluentBadge text={d.name} color={SEV_FL[d.name]?.color} bg={SEV_FL[d.name]?.bg} />
                      </div>
                      <span className="text-[12px] font-medium" style={{ color: FL.textSecondary }}>{d.value}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </FluentCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-12 gap-4">
          {/* Radar */}
          <FluentCard className="col-span-12 xl:col-span-6 p-4">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: FL.textPrimary }}>Category Analysis</h3>
            {radarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[13px]" style={{ color: FL.textTertiary }}>No category data</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke={FL.border} />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={({ x, y, payload, index }: any) => (
                        <text
                          x={x} y={y} fill={FL.textTertiary} fontSize={9} fontWeight={600} textAnchor="middle" cursor="pointer"
                          onClick={() => { const d = radarData[index]; if (d) handleDrill({ type: 'category', value: d.fullName, label: `${d.fullName} Findings` }); }}
                        >{payload.value}</text>
                      )}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: FL.textDisabled, fontSize: 8 }} axisLine={false} />
                    <Radar dataKey="score" stroke={FL.brandPrimary} fill={FL.brandPrimary} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: FL.brandPrimary }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </FluentCard>

          {/* Risk Categories */}
          <FluentCard className="col-span-12 xl:col-span-6 p-4">
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: FL.textPrimary }}>Top Risks</h3>
            {riskData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[13px]" style={{ color: FL.textTertiary }}>No risk data</div>
            ) : (
              <div className="space-y-3">
                {riskData.map((risk, i) => {
                  const maxCnt = riskData[0]?.cnt || 1;
                  const pct = (risk.cnt / maxCnt) * 100;
                  return (
                    <button
                      key={risk.category}
                      onClick={() => handleDrill({ type: 'category', value: risk.category, label: `${risk.category} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] group-hover:text-white transition-colors truncate mr-2" style={{ color: FL.textSecondary }}>{risk.category}</span>
                        <span className="text-[13px] font-semibold" style={{ color: FL.textPrimary }}>{risk.cnt}</span>
                      </div>
                      <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: FL.border }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.06 }}
                          className="h-full rounded-sm"
                          style={{ background: i === 0 ? FL.danger : i === 1 ? FL.severe : FL.brandPrimary }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </FluentCard>
        </div>

        {/* Data Grid - Scans */}
        <FluentCard className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${FL.border}` }}>
            <h3 className="text-[14px] font-semibold" style={{ color: FL.textPrimary }}>Recent Scans</h3>
            <button onClick={() => navigate('/scans')} className="text-[12px] font-semibold" style={{ color: FL.brandPrimary }}>View all</button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="p-4 text-center py-8 text-[13px]" style={{ color: FL.textTertiary }}>No scans available</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${FL.border}` }}>
                  {['Organization', 'Score', 'Status', 'Findings', 'Time', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[12px] font-semibold" style={{ color: FL.textTertiary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_scans.map(s => {
                  const sColor = (s.health_score || 0) >= 75 ? FL.success : (s.health_score || 0) >= 50 ? FL.warning : FL.danger;
                  const statusInfo = s.status === 'completed' ? { text: 'Completed', color: FL.success, bg: 'rgba(14,147,73,0.1)' } : s.status === 'running' ? { text: 'Running', color: FL.info, bg: FL.brandBg } : { text: 'Failed', color: FL.danger, bg: 'rgba(209,52,56,0.1)' };
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/scans/${s.id}`)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: `1px solid ${FL.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = FL.surfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: FL.brandBg }}>
                            <span className="text-[11px] font-bold" style={{ color: FL.brandPrimary }}>{(s.org_alias || 'O')[0].toUpperCase()}</span>
                          </div>
                          <span className="text-[13px] font-medium" style={{ color: FL.textPrimary }}>{s.org_alias}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[13px] font-semibold" style={{ color: sColor }}>{s.health_score || 0}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <FluentBadge text={statusInfo.text} color={statusInfo.color} bg={statusInfo.bg} />
                      </td>
                      <td className="px-4 py-2.5 text-[13px]" style={{ color: FL.textSecondary }}>{s.total_findings || 0}</td>
                      <td className="px-4 py-2.5 text-[12px]" style={{ color: FL.textTertiary }}>{timeAgo(s.started_at)}</td>
                      <td className="px-4 py-2.5"><ChevronRight className="w-4 h-4" style={{ color: FL.textDisabled }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </FluentCard>
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
