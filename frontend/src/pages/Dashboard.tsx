import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BarChart3, AlertTriangle, ShieldAlert, Plus, ArrowUp, ArrowDown, Minus, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/layout/PageTransition';
import HealthGauge from '@/components/charts/HealthGauge';
import StatCard from '@/components/ui/StatCard';
import GlassCard from '@/components/ui/GlassCard';
import ScoreBadge from '@/components/ui/ScoreBadge';
import AgentPulse from '@/components/ui/AgentPulse';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton';
import TrendChart from '@/components/charts/TrendChart';
import SeverityDoughnut from '@/components/charts/SeverityDoughnut';
import CategoryRadar from '@/components/charts/CategoryRadar';
import RiskBarChart from '@/components/charts/RiskBarChart';
import EffortPolar from '@/components/charts/EffortPolar';
import ActivityChart from '@/components/charts/ActivityChart';
import ChartDrillModal from '@/components/charts/ChartDrillModal';
import ScanCompareModal from '@/components/charts/ScanCompareModal';
import { api } from '@/api/client';
import { useApp, useColors } from '@/context/AppContext';
import { fmtDate } from '@/utils/formatters';
import type { DashboardData, DrillFilter, Finding, Scan } from '@/api/types';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(null);
  const [drillFindings, setDrillFindings] = useState<Finding[]>([]);
  const [latestScanId, setLatestScanId] = useState<number | undefined>();
  const [insightExpanded, setInsightExpanded] = useState(false);
  const [compareScan, setCompareScan] = useState<Scan | null>(null);
  const [comparePrevScan, setComparePrevScan] = useState<Scan | null>(null);
  const navigate = useNavigate();
  const { state, toast } = useApp();
  const C = useColors();

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

  useEffect(() => {
    const saved = sessionStorage.getItem('dashboard_drill_filter');
    if (saved) {
      sessionStorage.removeItem('dashboard_drill_filter');
      try {
        const filter = JSON.parse(saved) as DrillFilter;
        handleDrill(filter);
      } catch { /* ignore */ }
    }
  }, []);

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
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonChart key={i} />)}
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
  const totalFindings = stats?.total_findings || 0;
  const resolvedFindings = stats?.resolved_findings || 0;
  const resolutionRate = totalFindings > 0 ? Math.round(resolvedFindings / totalFindings * 100) : 0;

  const hoverBg = state.resolvedTheme === 'light' ? '#EBEBEB' : '#2a2a2a';

  return (
    <PageTransition>
      <div className="space-y-5">
        {/* Hero: Gauge + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <GlassCard className="lg:col-span-1 p-5 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] accent-gradient" />
            <HealthGauge score={latestScore} size="lg" />
            <span className="text-[10px] font-bold uppercase tracking-wider mt-2" style={{ color: C.gray50 }}>Health Score</span>
            {ext?.avg_score_last_5 != null && (
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xs" style={{ color: C.gray50 }}>Avg</span>
                <span className="text-lg font-extrabold" style={{ color: '#6366F1' }}>{Math.round(ext.avg_score_last_5)}</span>
                <span className="text-[10px]" style={{ color: C.gray50 }}>(last {Math.min(5, history.length)})</span>
              </div>
            )}
          </GlassCard>

          <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Open Issues"
              value={openIssues}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={openIssues > 0 ? '#F97316' : '#10B981'}
              subtitle={`${critOpen} critical`}
              onClick={() => handleDrill({ type: 'open', value: 'unresolved', label: 'Open Issues' })}
            />
            <StatCard
              label="Critical Risks"
              value={critOpen}
              icon={<ShieldAlert className="w-5 h-5" />}
              color={critOpen > 0 ? '#EF4444' : '#10B981'}
              subtitle={critOpen > 0 ? `${critOpen} require immediate action` : 'No critical risks'}
              onClick={() => handleDrill({ type: 'severity', value: 'Critical', label: 'Critical Risks' })}
            />
            <StatCard
              label="Resolution Rate"
              value={`${resolutionRate}%`}
              icon={<CheckCircle className="w-5 h-5" />}
              color={resolutionRate >= 75 ? '#10B981' : resolutionRate >= 50 ? '#F97316' : '#EF4444'}
              subtitle={`${resolvedFindings} of ${totalFindings} resolved`}
              animate={false}
            />
          </div>
        </div>

        {/* AI Insight Strip */}
        {data?.recent_scans && data.recent_scans.length > 0 && data.recent_scans[0].summary && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard
              className="p-4 glow-border cursor-pointer"
              onClick={() => setInsightExpanded(prev => !prev)}
            >
              <div className="flex items-start gap-3">
                <AgentPulse />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gradient">AI Insight</span>
                    <span className="text-[10px]" style={{ color: C.gray50 }}>{insightExpanded ? 'Click to collapse' : 'Click to expand'}</span>
                  </div>
                  <motion.div
                    initial={false}
                    animate={{ height: 'auto' }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className={`text-sm mt-1 leading-relaxed ${insightExpanded ? '' : 'line-clamp-2'}`} style={{ color: C.gray30 }}>
                      {data.recent_scans[0].summary}
                    </p>
                  </motion.div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Limits Package Banner */}
        {state.selectedOrg && (stats?.completed_scans ?? 0) > 0 && data?.has_governor_limits === false && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="p-3" style={{ border: `1px solid ${C.supportWarning}20` }}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: C.supportWarning }} />
                <p className="text-sm" style={{ color: C.gray40 }}>
                  <span className="font-medium" style={{ color: C.supportWarning }}>Limits Package not installed</span> for this org.
                  Governor limit snapshots are not available.{' '}
                  <a
                    href="https://www.pwc.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: C.blue40 }}
                  >
                    Learn more
                  </a>
                </p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <RiskBarChart riskCategories={ext?.top_risk_categories || []} onDrill={handleDrill} />
          <SeverityDoughnut severityTotals={ext?.severity_totals || {}} onDrill={handleDrill} />
          <EffortPolar effortDistribution={ext?.effort_distribution || []} onDrill={handleDrill} />
          <CategoryRadar categoryScores={ext?.latest_category_scores || {}} onDrill={handleDrill} />
          <TrendChart history={history} />
          <ActivityChart history={history} />
        </div>

        {/* Recent Scans */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ color: C.gray10 }}>Recent Scans</h3>
            <Button variant="accent" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/scans/new')}>
              New Scan
            </Button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <EmptyState title="No scans yet" description="Run your first health check to see results here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '40%' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.gray80}` }}>
                    {['Org / Date', 'Score', 'Change', 'Findings', 'Key Changes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.gray50 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recent_scans.map((s, idx) => {
                    const prevScan = data.recent_scans[idx + 1];
                    const scoreDelta = prevScan ? (s.health_score || 0) - (prevScan.health_score || 0) : null;
                    const DeltaIcon = scoreDelta !== null ? (scoreDelta > 0 ? ArrowUp : scoreDelta < 0 ? ArrowDown : Minus) : null;
                    const deltaColor = scoreDelta !== null ? (scoreDelta > 0 ? '#10B981' : scoreDelta < 0 ? '#EF4444' : C.gray50) : C.gray50;

                    let keyChanges: { name: string; delta: number }[] = [];
                    if (prevScan) {
                      try {
                        const curCats: Record<string, number> = JSON.parse(s.category_scores || '{}');
                        const prevCats: Record<string, number> = JSON.parse(prevScan.category_scores || '{}');
                        const allKeys = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);
                        keyChanges = [...allKeys]
                          .map(k => ({ name: k, delta: Math.round((curCats[k] ?? 0) - (prevCats[k] ?? 0)) }))
                          .filter(c => c.delta !== 0)
                          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                          .slice(0, 3);
                      } catch { /* ignore parse errors */ }
                    }

                    return (
                      <tr
                        key={s.id}
                        style={{ borderBottom: `1px solid ${C.gray80}40` }}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold" style={{ color: C.gray10 }}>{s.org_alias}</div>
                          <div className="text-[10px]" style={{ color: C.gray50 }}>{fmtDate(s.started_at)}</div>
                        </td>
                        <td className="px-4 py-3"><ScoreBadge score={s.health_score || 0} /></td>
                        <td className="px-4 py-3">
                          {scoreDelta !== null ? (
                            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: deltaColor }}>
                              {DeltaIcon && <DeltaIcon className="w-3 h-3" />}
                              {scoreDelta > 0 ? '+' : ''}{scoreDelta}%
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: C.gray50 }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/scans/${s.id}?tab=findings`)}
                            className="text-xs font-semibold transition-opacity hover:opacity-80"
                            style={{ color: C.blue40 }}
                          >
                            {s.total_findings || 0} findings
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {prevScan ? (
                            <button
                              onClick={() => { setCompareScan(s); setComparePrevScan(prevScan); }}
                              className="flex flex-wrap gap-1.5 cursor-pointer transition-opacity hover:opacity-80 text-left"
                            >
                              {keyChanges.length > 0 ? (
                                keyChanges.map(c => (
                                  <span
                                    key={c.name}
                                    className="text-[10px] font-medium px-2 py-0.5"
                                    style={{
                                      background: c.delta > 0 ? '#10B98115' : '#EF444415',
                                      color: c.delta > 0 ? '#10B981' : '#EF4444',
                                      border: `1px solid ${c.delta > 0 ? '#10B98130' : '#EF444430'}`,
                                    }}
                                  >
                                    {c.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px]" style={{ color: C.gray50 }}>No changes</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px]" style={{ color: C.gray50 }}>First scan</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/scans/new')}
        className="fixed bottom-6 right-6 w-12 h-12 flex items-center justify-center z-30 transition-colors"
        style={{ background: C.blue60 }}
        onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
        onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
      >
        <Plus className="w-5 h-5 text-white" />
      </motion.button>

      <ChartDrillModal
        filter={drillFilter}
        findings={drillFindings}
        scanId={latestScanId}
        onClose={() => setDrillFilter(null)}
        onFindingsChange={() => { load(); api.getAllFindings(state.selectedOrg?.alias).then(r => setDrillFindings(r.findings)); }}
      />

      <ScanCompareModal
        scan={compareScan}
        prevScan={comparePrevScan}
        onClose={() => { setCompareScan(null); setComparePrevScan(null); }}
      />
    </PageTransition>
  );
}
