import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BarChart3, AlertTriangle, ShieldAlert, Plus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/layout/PageTransition';
import HealthGauge from '@/components/charts/HealthGauge';
import StatCard from '@/components/ui/StatCard';
import GlassCard from '@/components/ui/GlassCard';
import ScoreBadge from '@/components/ui/ScoreBadge';
import StatusPill from '@/components/ui/StatusPill';
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
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtDate } from '@/utils/formatters';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';

export default function Dashboard() {
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

  return (
    <PageTransition>
      <div className="space-y-5">
        {/* Hero: Gauge + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <GlassCard className="lg:col-span-1 p-5 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] accent-gradient" />
            <HealthGauge score={latestScore} size="lg" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-2">Current Health Score</span>
          </GlassCard>

          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Avg Score (Last 5)"
              value={ext?.avg_score_last_5 ?? '--'}
              icon={<BarChart3 className="w-5 h-5" />}
              color="#6366F1"
              subtitle={`Based on ${Math.min(5, history.length)} scan${history.length !== 1 ? 's' : ''}`}
              animate={ext?.avg_score_last_5 != null}
            />
            <StatCard
              label="Open Issues"
              value={openIssues}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={openIssues > 0 ? '#F97316' : '#10B981'}
              subtitle={`${critOpen} critical`}
            />
            <StatCard
              label="Critical Risks"
              value={critOpen}
              icon={<ShieldAlert className="w-5 h-5" />}
              color={critOpen > 0 ? '#EF4444' : '#10B981'}
              subtitle={critOpen > 0 ? `${critOpen} require immediate action` : 'No critical risks'}
            />
          </div>
        </div>

        {/* AI Insight Strip */}
        {data?.recent_scans && data.recent_scans.length > 0 && data.recent_scans[0].summary && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="p-4 glow-border">
              <div className="flex items-start gap-3">
                <AgentPulse />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gradient">AI Insight</span>
                  <p className="text-sm text-gray-300 mt-1 leading-relaxed line-clamp-2">{data.recent_scans[0].summary}</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Limits Package Banner */}
        {state.selectedOrg && (stats?.completed_scans ?? 0) > 0 && data?.has_governor_limits === false && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="p-3 border border-yellow-500/10">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <p className="text-sm text-gray-400">
                  <span className="text-yellow-400 font-medium">Limits Package not installed</span> for this org.
                  Governor limit snapshots are not available.{' '}
                  <a
                    href="https://www.pwc.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-light hover:underline"
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
          <TrendChart history={history} />
          <SeverityDoughnut severityTotals={ext?.severity_totals || {}} onDrill={handleDrill} />
          <CategoryRadar categoryScores={ext?.latest_category_scores || {}} onDrill={handleDrill} />
          <RiskBarChart riskCategories={ext?.top_risk_categories || []} onDrill={handleDrill} />
          <EffortPolar effortDistribution={ext?.effort_distribution || []} onDrill={handleDrill} />
          <ActivityChart history={history} />
        </div>

        {/* Recent Scans */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <GlassCard className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-200">Recent Scans</h3>
              <Button variant="accent" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/scans/new')}>
                New Scan
              </Button>
            </div>
            {(!data?.recent_scans || data.recent_scans.length === 0) ? (
              <EmptyState title="No scans yet" description="Run your first health check to see results here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Org / Date', 'Score', 'Status', 'Findings'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_scans.map(s => (
                      <tr
                        key={s.id}
                        className="border-b border-white/[0.04] cursor-pointer transition-colors hover:bg-white/[0.02]"
                        onClick={() => navigate(`/scans/${s.id}`)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="text-sm font-semibold text-gray-200">{s.org_alias}</div>
                          <div className="text-[10px] text-gray-500">{fmtDate(s.started_at)}</div>
                        </td>
                        <td className="px-3 py-2.5"><ScoreBadge score={s.health_score || 0} /></td>
                        <td className="px-3 py-2.5"><StatusPill status={s.status} /></td>
                        <td className="px-3 py-2.5 text-xs text-gray-400">{s.total_findings || 0} findings</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="text-sm font-bold text-gray-200 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'Run Health Scan', icon: <Zap className="w-5 h-5" />, action: () => navigate('/scans/new') },
                { label: 'View All Scans', icon: <Activity className="w-5 h-5" />, action: () => navigate('/scans') },
                { label: 'Settings', icon: <BarChart3 className="w-5 h-5" />, action: () => navigate('/settings') },
              ].map(qa => (
                <button
                  key={qa.label}
                  onClick={qa.action}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-gray-400 text-sm font-medium transition-all hover:border-accent/30 hover:text-gray-200 hover:bg-accent/5 text-left"
                >
                  <span className="text-accent">{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/scans/new')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full accent-gradient shadow-glow-lg flex items-center justify-center z-30 hover:shadow-[0_0_60px_rgba(208,74,2,0.3)] transition-shadow"
      >
        <Plus className="w-6 h-6 text-white" />
      </motion.button>

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
