import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

const M3 = {
  primary: '#D3E3FD',
  primaryContainer: '#004A77',
  onPrimary: '#003355',
  onPrimaryContainer: '#D3E3FD',
  secondary: '#C2E7FF',
  secondaryContainer: '#004B6F',
  tertiary: '#EFDBFF',
  tertiaryContainer: '#633B77',
  surface: '#1B1B1F',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  surfaceVariant: '#44474E',
  onSurface: '#E6E1E5',
  onSurfaceVariant: '#C4C6D0',
  outline: '#8E9099',
  outlineVariant: '#44474E',
  error: '#FFB4AB',
  errorContainer: '#93000A',
  blue: '#A8C7FA',
  green: '#A8DAB5',
  yellow: '#FDD663',
  orange: '#FCBC6E',
  red: '#F2B8B5',
  purple: '#D0BCFF',
};

const SEVERITY_M3: Record<string, { bg: string; text: string }> = {
  Critical: { bg: '#93000A', text: '#FFB4AB' },
  High: { bg: '#7A2E0E', text: '#FCBC6E' },
  Medium: { bg: '#574500', text: '#FDD663' },
  Low: { bg: '#1B5E37', text: '#A8DAB5' },
  Info: { bg: '#004A77', text: '#A8C7FA' },
};

function M3Card({ children, className = '', elevated }: { children: React.ReactNode; className?: string; elevated?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className={`rounded-3xl ${className}`}
      style={{
        background: elevated ? M3.surfaceContainerHigh : M3.surfaceContainer,
        border: 'none',
      }}
    >
      {children}
    </motion.div>
  );
}

function M3Chip({ label, color, count, onClick }: { label: string; color: { bg: string; text: string }; count: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:brightness-110"
      style={{ background: color.bg, color: color.text }}
    >
      {label}
      <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold" style={{ background: `${color.text}20` }}>{count}</span>
    </button>
  );
}

function M3FAB({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center z-30 shadow-lg"
      style={{ background: M3.primaryContainer, color: M3.onPrimaryContainer }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </motion.button>
  );
}

export default function DashboardGoogle() {
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
        <div className="space-y-4 p-2">
          <div className="h-44 rounded-3xl animate-pulse" style={{ background: M3.surfaceContainer }} />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-48 rounded-3xl animate-pulse" style={{ background: M3.surfaceContainer }} />)}
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

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const latest = trendData.length > 0 ? trendData[trendData.length - 1].score : 0;
  const prev = trendData.length >= 2 ? trendData[trendData.length - 2].score : latest;
  const delta = latest - prev;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {});
  const radarData = categoryEntries.map(([name, score]) => ({ category: name.length > 12 ? name.substring(0, 10) + '..' : name, fullName: name, score }));
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(name => ({ name, value: ext?.severity_totals?.[name] || 0 })).filter(d => d.value > 0);
  const riskData = (ext?.top_risk_categories || []).slice(0, 5);

  return (
    <PageTransition>
      <div className="space-y-4 p-2">
        {/* Hero Card with large score */}
        <M3Card className="p-6" elevated>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[12px] font-medium tracking-wide uppercase" style={{ color: M3.onSurfaceVariant }}>Org Health Score</span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-6xl font-normal tracking-tight" style={{ color: M3.primary }}>{latestScore}</span>
                <span className="text-[16px] font-medium" style={{ color: M3.onSurfaceVariant }}>/ 100</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <TrendIcon className="w-4 h-4" style={{ color: delta >= 0 ? M3.green : M3.red }} />
                <span className="text-[14px] font-medium" style={{ color: delta >= 0 ? M3.green : M3.red }}>
                  {delta > 0 ? '+' : ''}{delta} from last scan
                </span>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex gap-3">
              {[
                { label: 'Average', value: avgScore, color: M3.blue },
                { label: 'Open', value: openIssues, color: M3.orange },
                { label: 'Critical', value: critOpen, color: M3.red },
              ].map(s => (
                <div key={s.label} className="text-center px-5 py-3 rounded-2xl" style={{ background: M3.surfaceContainerHighest }}>
                  <span className="text-2xl font-medium block" style={{ color: s.color }}>{s.value}</span>
                  <span className="text-[11px] font-medium" style={{ color: M3.onSurfaceVariant }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </M3Card>

        {/* Severity Chips */}
        {severityEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {severityEntries.map(d => (
              <M3Chip
                key={d.name}
                label={d.name}
                color={SEVERITY_M3[d.name]}
                count={d.value}
                onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
              />
            ))}
          </div>
        )}

        {/* AI Insight */}
        {data?.recent_scans?.[0]?.summary && (
          <M3Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: M3.tertiaryContainer }}>
                <span className="text-[14px] font-bold" style={{ color: M3.tertiary }}>AI</span>
              </div>
              <div>
                <span className="text-[12px] font-medium tracking-wide uppercase" style={{ color: M3.purple }}>Summary</span>
                <p className="text-[14px] leading-relaxed mt-1 line-clamp-2" style={{ color: M3.onSurface }}>{data.recent_scans[0].summary}</p>
              </div>
            </div>
          </M3Card>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Trend Line */}
          <M3Card className="p-5">
            <h4 className="text-[14px] font-medium mb-4" style={{ color: M3.onSurface }}>Score Trend</h4>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: M3.onSurfaceVariant }}>No data yet</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={M3.outlineVariant + '30'} />
                    <XAxis dataKey="date" tick={{ fill: M3.outline, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: M3.outline, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: M3.surfaceContainerHighest, border: 'none', borderRadius: 16, fontSize: 13, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                      labelStyle={{ color: M3.onSurfaceVariant }}
                    />
                    <Line type="monotone" dataKey="score" stroke={M3.blue} strokeWidth={3} dot={{ fill: M3.blue, strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </M3Card>

          {/* Radar */}
          <M3Card className="p-5">
            <h4 className="text-[14px] font-medium mb-4" style={{ color: M3.onSurface }}>Category Radar</h4>
            {radarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: M3.onSurfaceVariant }}>No data</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke={M3.outlineVariant + '30'} />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={({ x, y, payload, index }: any) => (
                        <text
                          x={x} y={y} fill={M3.onSurfaceVariant} fontSize={9} fontWeight={500} textAnchor="middle" cursor="pointer"
                          onClick={() => { const d = radarData[index]; if (d) handleDrill({ type: 'category', value: d.fullName, label: `${d.fullName} Findings` }); }}
                        >{payload.value}</text>
                      )}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: M3.outline, fontSize: 8 }} axisLine={false} />
                    <Radar dataKey="score" stroke={M3.purple} fill={M3.purple} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: M3.purple }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </M3Card>

          {/* Findings Bar */}
          <M3Card className="p-5">
            <h4 className="text-[14px] font-medium mb-4" style={{ color: M3.onSurface }}>Findings per Scan</h4>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: M3.onSurfaceVariant }}>No activity</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={M3.outlineVariant + '30'} />
                    <XAxis dataKey="date" tick={{ fill: M3.outline, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: M3.outline, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: M3.surfaceContainerHighest, border: 'none', borderRadius: 16, fontSize: 13, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }} />
                    <Bar dataKey="findings" radius={[8, 8, 0, 0]} barSize={20}>
                      {trendData.map((_, i) => <Cell key={i} fill={M3.secondary} opacity={0.7} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </M3Card>

          {/* Top Risks */}
          <M3Card className="p-5">
            <h4 className="text-[14px] font-medium mb-4" style={{ color: M3.onSurface }}>Top Risk Categories</h4>
            {riskData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: M3.onSurfaceVariant }}>No risks found</div>
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
                        <span className="text-[13px] font-medium group-hover:text-white transition-colors" style={{ color: M3.onSurface }}>{risk.category}</span>
                        <span className="text-[13px] font-semibold" style={{ color: M3.orange }}>{risk.cnt}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: M3.surfaceVariant }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.08 }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${M3.orange}, ${M3.yellow})` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </M3Card>
        </div>

        {/* Recent Scans */}
        <M3Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-[16px] font-medium" style={{ color: M3.onSurface }}>Recent Scans</h3>
            <button onClick={() => navigate('/scans')} className="text-[14px] font-medium" style={{ color: M3.blue }}>View all</button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-5 pb-5 text-center py-8 text-[14px]" style={{ color: M3.onSurfaceVariant }}>No scans yet. Tap + to start.</div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? M3.green : (s.health_score || 0) >= 50 ? M3.yellow : M3.red;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-5 py-3.5 transition-colors hover:bg-white/[0.03] text-left group"
                    style={{ borderTop: i > 0 ? `1px solid ${M3.outlineVariant}30` : undefined }}
                  >
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mr-4" style={{ background: M3.surfaceContainerHighest }}>
                      <span className="text-[14px] font-semibold" style={{ color: sColor }}>{s.health_score || 0}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium block" style={{ color: M3.onSurface }}>{s.org_alias}</span>
                      <span className="text-[12px]" style={{ color: M3.onSurfaceVariant }}>{timeAgo(s.started_at)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] font-medium block" style={{ color: M3.onSurfaceVariant }}>{s.total_findings || 0}</span>
                      <span className="text-[11px]" style={{ color: M3.outline }}>findings</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </M3Card>
      </div>

      {/* Material FAB */}
      <M3FAB onClick={() => navigate('/scans/new')} />

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
