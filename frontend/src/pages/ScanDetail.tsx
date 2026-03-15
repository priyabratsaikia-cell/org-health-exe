import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, AlertTriangle, ShieldAlert, ChevronDown, ChevronRight, Code2, BarChart3, Shield, Info, X, ExternalLink, TrendingUp, CheckCircle2, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import GlassCard from '@/components/ui/GlassCard';
import Button from '@/components/ui/Button';
import FindingsTable from '@/components/findings/FindingsTable';
import { SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtDate, fmtNum } from '@/utils/formatters';
import { scoreGrade, scoreColor } from '@/utils/scoreHelpers';
import { exportReport } from '@/utils/pdfExport';
import type { Scan, Finding, CodeAnalysisResult, ParameterCoverage, CategoryDetail, ParameterResult, ParameterResultsPayload } from '@/api/types';

const SEV_COLORS: Record<string, string> = { CRIT: '#EF4444', HIGH: '#F97316', MED: '#EAB308', LOW: '#22C55E', INFO: '#6366F1' };
const SEV_LABELS: Record<string, string> = { CRIT: 'Critical', HIGH: 'High', MED: 'Medium', LOW: 'Low', INFO: 'Info' };

const CODE_PATTERN_LABELS: Record<string, string> = {
  soql_in_loops: 'SOQL in Loops', dml_in_loops: 'DML in Loops', hardcoded_ids: 'Hardcoded IDs',
  empty_catch_blocks: 'Empty Catch Blocks', soql_injection: 'SOQL Injection', missing_sharing: 'Missing Sharing',
  see_all_data: 'SeeAllData=true', missing_asserts: 'Missing Asserts', system_debug_overuse: 'Debug Overuse',
  describe_in_loops: 'Describe in Loops', csrf_dml_constructor: 'CSRF Risk',
};

type TabKey = 'overview' | 'findings' | 'code_quality' | 'coverage';

function catScoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 70) return '#22C55E';
  if (score >= 50) return '#EAB308';
  return '#EF4444';
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PASS: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'PASS' },
  WARN: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'WARN' },
  FAIL: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'FAIL' },
  SKIP: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'SKIP' },
  PENDING: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'PENDING' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
  return <span className={`${s.bg} ${s.text} text-[9px] font-bold px-1.5 py-0.5 rounded uppercase`}>{s.label}</span>;
}

function ScoringMethodologyModal({ open, onClose, categoryDetails, catData }: {
  open: boolean;
  onClose: () => void;
  categoryDetails: CategoryDetail[];
  catData: { name: string; score: number }[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4 bg-surface border border-white/[0.08] rounded-xl shadow-2xl"
      >
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-gray-200 tracking-wide">Scoring Methodology</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-[12px] text-gray-400 leading-relaxed">
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">How We Score</h5>
            <p>Each of the <strong className="text-gray-300">294 parameters</strong> is individually assessed as <span className="text-green-400 font-semibold">PASS</span> (1.0), <span className="text-yellow-400 font-semibold">WARN</span> (0.5), <span className="text-red-400 font-semibold">FAIL</span> (0.0), or <span className="text-gray-500 font-semibold">SKIP</span> (excluded).</p>
          </div>
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Category Score Formula</h5>
            <div className="bg-white/[0.03] rounded-lg p-3 font-mono text-[11px]">
              Category Score = (Sum of assessable parameter scores / Count of assessed parameters) &times; 100
            </div>
            <p className="mt-2">SKIP and PENDING parameters are excluded from the denominator, so categories aren't penalized for parameters the tool cannot assess.</p>
          </div>
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Overall Health Score Formula</h5>
            <div className="bg-white/[0.03] rounded-lg p-3 font-mono text-[11px]">
              Health Score = &Sigma; (Category Score &times; Category Weight) / 100
            </div>
          </div>
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Category Weights</h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {categoryDetails.length > 0 ? categoryDetails.map(c => (
                <div key={c.key} className="flex items-center justify-between bg-white/[0.02] rounded px-2 py-1">
                  <span className="text-gray-400 truncate text-[10px]">{c.label}</span>
                  <span className="text-accent-light font-bold text-[10px] ml-2">{c.weight}%</span>
                </div>
              )) : catData.map(c => (
                <div key={c.name} className="flex items-center justify-between bg-white/[0.02] rounded px-2 py-1">
                  <span className="text-gray-400 truncate text-[10px]">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Scoring Sources</h5>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong className="text-gray-300">Deterministic</strong> — Scored directly from collected data (SOQL, Tooling API, code analysis, metadata counts)</li>
              <li><strong className="text-gray-300">AI Inference</strong> — Scored by Gemini AI when objective thresholds aren't possible</li>
              <li><strong className="text-gray-300">Manual Review</strong> — Requires external tools or human review (excluded from scoring)</li>
            </ul>
          </div>
          <div className="pt-3 border-t border-white/[0.06]">
            <a
              href="https://www.pwc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-accent-light hover:text-accent text-[11px] font-semibold transition-colors"
            >
              Learn more about our methodology <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const navigate = useNavigate();
  const { toast } = useApp();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await api.getScan(Number(id));
      setScan(s);
    } catch (e: any) {
      toast('Failed to load scan: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (f: Finding) => {
    try {
      if (f.is_resolved) {
        await api.unresolveFinding(f.id);
        toast('Marked as unresolved', 'success');
      } else {
        await api.resolveFinding(f.id);
        toast('Marked as resolved', 'success');
      }
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleExport = () => {
    if (!scan) return;
    toast('Generating PDF report...', 'info');
    try {
      exportReport(scan, scan.findings || []);
      toast('PDF downloaded!', 'success');
    } catch (e: any) {
      toast('Failed to generate PDF: ' + e.message, 'error');
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-4">
          <SkeletonCard />
          <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
          <div className="grid grid-cols-3 gap-4"><SkeletonChart /><SkeletonChart /><SkeletonChart /></div>
        </div>
      </PageTransition>
    );
  }

  if (!scan) {
    return <PageTransition><div className="text-center py-12 text-gray-500">Scan not found.</div></PageTransition>;
  }

  if (scan.status === 'running') {
    return (
      <PageTransition>
        <button onClick={() => navigate('/scans')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-accent-light transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Scans
        </button>
        <GlassCard className="p-8 text-center">
          <div className="w-12 h-12 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-200">Health Scan In Progress</h3>
          <p className="text-sm text-gray-500 mt-2">Live updates are being processed. This page will refresh when complete.</p>
        </GlassCard>
      </PageTransition>
    );
  }

  const findings = scan.findings || [];
  const resolved = findings.filter(f => f.is_resolved).length;
  const hs = scan.health_score || 0;
  const resolutionRate = findings.length > 0 ? Math.round(resolved / findings.length * 100) : 0;

  const sevData = [
    { name: 'CRIT', label: 'Critical', value: scan.critical_count || 0 },
    { name: 'HIGH', label: 'High', value: scan.high_count || 0 },
    { name: 'MED', label: 'Medium', value: scan.medium_count || 0 },
    { name: 'LOW', label: 'Low', value: scan.low_count || 0 },
    { name: 'INFO', label: 'Info', value: scan.info_count || 0 },
  ];

  let catScores: Record<string, number> = {};
  try { catScores = JSON.parse(scan.category_scores || '{}'); } catch { /* ignore */ }
  const catData = Object.entries(catScores).map(([name, value]) => ({ name, score: value }));
  const catBarData = [...catData].sort((a, b) => a.score - b.score);

  let paramCoverage: ParameterCoverage | null = null;
  try { paramCoverage = scan.parameter_coverage_json ? JSON.parse(scan.parameter_coverage_json) : null; } catch { /* ignore */ }

  let codeAnalysis: CodeAnalysisResult | null = null;
  try { codeAnalysis = scan.code_analysis_json ? JSON.parse(scan.code_analysis_json) : null; } catch { /* ignore */ }

  let limitsTrends: Record<string, any[]> | null = null;
  try { limitsTrends = scan.governor_limits_trends_json ? JSON.parse(scan.governor_limits_trends_json) : null; } catch { /* ignore */ }

  let paramResultsPayload: ParameterResultsPayload | null = null;
  try { paramResultsPayload = scan.parameter_results_json ? JSON.parse(scan.parameter_results_json) : null; } catch { /* ignore */ }
  const paramResults: ParameterResult[] = paramResultsPayload?.parameters || [];

  let reportJson: any = null;
  try { reportJson = scan.report_json ? JSON.parse(scan.report_json) : null; } catch { /* ignore */ }
  const categoryDetails: CategoryDetail[] = reportJson?.category_details || [];

  const paramsByCategory: Record<string, ParameterResult[]> = {};
  for (const p of paramResults) {
    (paramsByCategory[p.category] ??= []).push(p);
  }

  const toggleCat = (key: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const coveragePct = paramCoverage ? Math.round(paramCoverage.assessed / paramCoverage.total * 100) : null;

  const trendEntries = limitsTrends
    ? Object.entries(limitsTrends).filter(([, data]) => Array.isArray(data) && data.length > 0).slice(0, 6)
    : [];

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'findings', label: 'Findings', count: findings.length },
    ...(codeAnalysis && codeAnalysis.status === 'completed' ? [{ key: 'code_quality' as TabKey, label: 'Code Quality', count: codeAnalysis.issues_found }] : []),
    ...(paramCoverage ? [{ key: 'coverage' as TabKey, label: 'Coverage' }] : []),
  ];

  return (
    <PageTransition>
      {/* Scoring Methodology Modal */}
      <AnimatePresence>
        {methodologyOpen && (
          <ScoringMethodologyModal
            open={methodologyOpen}
            onClose={() => setMethodologyOpen(false)}
            categoryDetails={categoryDetails}
            catData={catData}
          />
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/scans')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-accent-light transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Scans
        </button>
        <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExport}>
          Export PDF
        </Button>
      </div>

      {/* Hero Header -- IBM structured style */}
      <div className="mb-6 pb-6 border-b-2 border-white/[0.06]">
        <div className="flex items-end gap-6 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter font-mono" style={{ color: scoreColor(hs) }}>
              {hs}
            </span>
            <span
              className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded"
              style={{
                color: scoreColor(hs),
                background: scoreColor(hs) + '15',
                border: `1px solid ${scoreColor(hs)}30`,
              }}
            >
              {scoreGrade(hs)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-100 tracking-tight mb-1">Org Health Report</h2>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              <span className="font-mono text-gray-400">{scan.org_alias}</span>
              <span className="text-white/10">|</span>
              <span>{fmtDate(scan.started_at)}</span>
              <span className="text-white/10">|</span>
              <span>{fmtNum(scan.total_components || 0)} components</span>
              {paramCoverage && (
                <>
                  <span className="text-white/10">|</span>
                  <span>{paramCoverage.assessed}/{paramCoverage.total} parameters</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Metric Strip -- 4 compact tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Total Findings</div>
              <div className="text-2xl font-black text-gray-100">{findings.length}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{findings.length - resolved} open</div>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-yellow-500/10">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Critical Issues</div>
              <div className="text-2xl font-black" style={{ color: (scan.critical_count || 0) > 0 ? '#EF4444' : '#10B981' }}>
                {scan.critical_count || 0}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: (scan.critical_count || 0) > 0 ? '#EF4444' : '#6B7280' }}>
                {(scan.critical_count || 0) > 0 ? 'Action required' : 'No critical issues'}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-500/10">
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Resolution Rate</div>
              <div className="text-2xl font-black text-emerald-400">{resolutionRate}%</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{resolved}/{findings.length} resolved</div>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Coverage</div>
              <div className="text-2xl font-black text-accent-light">{coveragePct ?? '—'}%</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {paramCoverage ? `${paramCoverage.assessed}/${paramCoverage.total} assessed` : 'N/A'}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent/10">
              <Shield className="w-4 h-4 text-accent-light" />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Charts Row -- 3 columns */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${trendEntries.length > 0 ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
        {/* Severity Distribution -- Horizontal bars */}
        <GlassCard className="p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Severity Distribution</h4>
          <p className="text-[9px] text-gray-600 mb-3">Click to filter findings</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sevData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11 }}
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 3, 3, 0]}
                  cursor="pointer"
                  onClick={(_entry, index) => {
                    const sev = sevData[index]?.label;
                    if (sev) {
                      setSevFilter(prev => prev === sev ? '' : sev);
                      setActiveTab('findings');
                    }
                  }}
                >
                  {sevData.map(d => (
                    <Cell key={d.name} fill={SEV_COLORS[d.name] + '60'} stroke={SEV_COLORS[d.name]} strokeWidth={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Category Scores -- Horizontal bars (replacing radar) */}
        <GlassCard className="p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Category Scores</h4>
          <p className="text-[9px] text-gray-600 mb-3">Sorted by risk (lowest first)</p>
          {catBarData.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {catBarData.map(cat => (
                <button
                  key={cat.name}
                  className="w-full flex items-center gap-2 text-[11px] group hover:bg-white/[0.02] rounded px-1 py-0.5 transition-colors"
                  onClick={() => {
                    setCatFilter(prev => prev === cat.name ? '' : cat.name);
                    setActiveTab('findings');
                  }}
                >
                  <span className="w-[100px] min-w-[80px] text-gray-400 truncate text-left text-[10px]" title={cat.name}>
                    {cat.name}
                  </span>
                  <div className="flex-1 h-[6px] rounded-sm bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-sm transition-all"
                      style={{ width: `${Math.min(cat.score, 100)}%`, background: catScoreColor(cat.score) }}
                    />
                  </div>
                  <span className="min-w-[32px] text-right font-mono font-bold text-[10px]" style={{ color: catScoreColor(cat.score) }}>
                    {cat.score.toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 text-xs">No category scores</div>
          )}
        </GlassCard>

        {/* Limit Trends Sparklines */}
        {trendEntries.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Limit Trends</h4>
              <span className="text-[9px] text-gray-600">7-day</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {trendEntries.map(([key, data]) => {
                const label = key.replace('trend_', '').replace('_7d', '').replace(/_/g, ' ');
                const chartData = data.map((d: any) => ({
                  date: d.CreatedDate ? new Date(d.CreatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                  pct: d.PercentOfLimit__c ?? 0,
                }));
                const latestPct = chartData.length > 0 ? chartData[chartData.length - 1].pct : 0;
                return (
                  <div key={key} className="flex flex-col">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-500 truncate" title={label}>
                        {label.length > 16 ? label.substring(0, 14) + '..' : label}
                      </span>
                      <span className="text-[9px] font-mono font-bold" style={{ color: latestPct >= 80 ? '#EF4444' : latestPct >= 60 ? '#EAB308' : '#22C55E' }}>
                        {latestPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-10">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <Line
                            type="monotone"
                            dataKey="pct"
                            stroke={latestPct >= 80 ? '#EF4444' : latestPct >= 60 ? '#EAB308' : '#22C55E'}
                            strokeWidth={1.5}
                            dot={false}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 9, padding: '4px 8px' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b-2 border-white/[0.06] mb-6">
        <div className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-5 py-3 text-xs font-semibold tracking-wide transition-colors ${
                activeTab === tab.key
                  ? 'text-accent-light'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  activeTab === tab.key ? 'bg-accent/15 text-accent-light' : 'bg-white/[0.04] text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <motion.div
            key="tab-overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Executive Summary */}
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Executive Summary</h4>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{scan.summary || 'No summary available.'}</p>
            </GlassCard>

            {/* Category Score Breakdown */}
            {catData.length > 0 && (
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-accent-light" />
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Category Score Breakdown</h4>
                  <button
                    onClick={() => setMethodologyOpen(true)}
                    className="ml-1 w-5 h-5 rounded-full border border-white/[0.1] flex items-center justify-center hover:border-accent/40 hover:bg-accent/5 transition-colors group"
                    title="View scoring methodology"
                  >
                    <Info className="w-3 h-3 text-gray-500 group-hover:text-accent-light transition-colors" />
                  </button>
                  <span className="text-[9px] text-gray-600 ml-1">Click to expand parameter details</span>
                </div>
                <div className="space-y-1">
                  {(categoryDetails.length > 0
                    ? categoryDetails
                    : catData.map(c => ({ key: c.name, label: c.name, weight: 0, params: 0, score: c.score, assessed: 0, passed: 0, warned: 0, failed: 0, skipped: 0, pending: 0 }))
                  ).sort((a, b) => a.score - b.score).map(cat => {
                    const key = cat.key;
                    const isOpen = expandedCats.has(key);
                    const catParams = paramsByCategory[key] || [];
                    return (
                      <div key={key} className="border border-white/[0.04] rounded-lg overflow-hidden">
                        <button onClick={() => toggleCat(key)} className="w-full flex items-center gap-3 text-[12px] px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                          <span className="w-[200px] min-w-[140px] text-gray-300 truncate text-left font-medium" title={cat.label}>{cat.label}</span>
                          {cat.weight > 0 && <span className="text-[9px] text-gray-600 shrink-0 font-mono">{cat.weight}%</span>}
                          <div className="flex-1 h-[6px] rounded-sm bg-white/[0.06] overflow-hidden">
                            <div className="h-full rounded-sm transition-all" style={{ width: `${Math.min(cat.score, 100)}%`, background: catScoreColor(cat.score) }} />
                          </div>
                          <span className="min-w-[40px] text-right font-mono font-bold text-[11px] shrink-0" style={{ color: catScoreColor(cat.score) }}>
                            {typeof cat.score === 'number' ? cat.score.toFixed(1) : cat.score}
                          </span>
                          {cat.assessed > 0 && (
                            <div className="flex gap-1.5 text-[9px] shrink-0 font-mono">
                              {cat.passed > 0 && <span className="text-green-400">{cat.passed}P</span>}
                              {cat.warned > 0 && <span className="text-yellow-400">{cat.warned}W</span>}
                              {cat.failed > 0 && <span className="text-red-400">{cat.failed}F</span>}
                            </div>
                          )}
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && catParams.length > 0 && (
                            <motion.div key={`cat-${key}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="px-3 pb-3 space-y-0.5">
                                <div className="grid grid-cols-[40px_1fr_60px_1fr_100px] gap-2 text-[9px] text-gray-600 uppercase tracking-wider font-bold py-1.5 border-b border-white/[0.06]">
                                  <span>ID</span><span>Parameter</span><span>Status</span><span>Reason</span><span>Data</span>
                                </div>
                                {catParams.map(p => (
                                  <div key={p.id} className="grid grid-cols-[40px_1fr_60px_1fr_100px] gap-2 text-[11px] py-1.5 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                                    <span className="text-gray-600 font-mono">{p.id}</span>
                                    <span className="text-gray-300 truncate" title={p.name}>{p.name}</span>
                                    <StatusBadge status={p.status} />
                                    <span className="text-gray-500 truncate" title={p.reason}>{p.reason}</span>
                                    <span className="text-gray-600 font-mono truncate" title={p.data_value}>{p.data_value || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                          {isOpen && catParams.length === 0 && (
                            <motion.div key={`cat-empty-${key}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="px-3 pb-3 text-[11px] text-gray-600 italic">No per-parameter details available for this scan.</div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}

        {/* ===== FINDINGS TAB ===== */}
        {activeTab === 'findings' && (
          <motion.div
            key="tab-findings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {/* Active Filters */}
            {(sevFilter || catFilter) && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Filters:</span>
                {sevFilter && (
                  <button onClick={() => setSevFilter('')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-colors">
                    {sevFilter} <X className="w-2.5 h-2.5 ml-0.5" />
                  </button>
                )}
                {catFilter && (
                  <button onClick={() => setCatFilter('')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-colors">
                    {catFilter} <X className="w-2.5 h-2.5 ml-0.5" />
                  </button>
                )}
              </div>
            )}
            <FindingsTable
              findings={findings}
              onResolve={handleResolve}
              initialSeverityFilter={sevFilter}
              initialCategoryFilter={catFilter}
            />
          </motion.div>
        )}

        {/* ===== CODE QUALITY TAB ===== */}
        {activeTab === 'code_quality' && codeAnalysis && codeAnalysis.status === 'completed' && (
          <motion.div
            key="tab-code-quality"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <GlassCard className="p-4 text-center">
                <div className="text-2xl font-black text-gray-100">{codeAnalysis.files_scanned}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">Files Scanned</div>
              </GlassCard>
              <GlassCard className="p-4 text-center">
                <div className="text-2xl font-black" style={{ color: codeAnalysis.issues_found > 0 ? '#EF4444' : '#10B981' }}>
                  {codeAnalysis.issues_found}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">Total Issues</div>
              </GlassCard>
              {Object.entries(codeAnalysis.severity_counts || {}).filter(([, count]) => count > 0).slice(0, 2).map(([sev, count]) => (
                <GlassCard key={sev} className="p-4 text-center">
                  <div className="text-2xl font-black" style={{ color: sev === 'Critical' ? '#EF4444' : sev === 'High' ? '#F97316' : sev === 'Medium' ? '#EAB308' : '#22C55E' }}>
                    {count}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">{sev}</div>
                </GlassCard>
              ))}
            </div>

            {/* Issues by Pattern */}
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-4 h-4 text-accent-light" />
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Issues by Anti-Pattern</h4>
              </div>
              <div className="space-y-2">
                {Object.entries(codeAnalysis.findings_by_pattern || {}).sort((a, b) => b[1] - a[1]).map(([pat, count]) => {
                  const maxCount = Math.max(...Object.values(codeAnalysis!.findings_by_pattern || {}));
                  return (
                    <div key={pat} className="flex items-center gap-3 text-[12px]">
                      <span className="w-[180px] min-w-[140px] text-gray-400">{CODE_PATTERN_LABELS[pat] || pat}</span>
                      <div className="flex-1 h-[6px] rounded-sm bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-red-500/50"
                          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="min-w-[28px] text-right font-mono font-bold text-gray-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Severity Breakdown */}
            {Object.entries(codeAnalysis.severity_counts || {}).some(([, count]) => count > 0) && (
              <GlassCard className="p-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Severity Breakdown</h4>
                <div className="flex gap-3">
                  {Object.entries(codeAnalysis.severity_counts || {}).map(([sev, count]) => (
                    count > 0 && (
                      <div
                        key={sev}
                        className="px-3 py-2 rounded text-[11px]"
                        style={{
                          background: sev === 'Critical' ? 'rgba(239,68,68,0.1)' : sev === 'High' ? 'rgba(249,115,22,0.1)' : sev === 'Medium' ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.1)',
                        }}
                      >
                        <span className="font-bold" style={{ color: sev === 'Critical' ? '#EF4444' : sev === 'High' ? '#F97316' : sev === 'Medium' ? '#EAB308' : '#22C55E' }}>
                          {count}
                        </span>
                        <span className="ml-1.5 text-gray-500">{sev}</span>
                      </div>
                    )
                  ))}
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}

        {/* ===== COVERAGE TAB ===== */}
        {activeTab === 'coverage' && paramCoverage && (
          <motion.div
            key="tab-coverage"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Coverage summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-green-400">{paramCoverage.assessed}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">Assessed</div>
              </GlassCard>
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-emerald-400">{paramCoverage.deterministic_count ?? '—'}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">Deterministic</div>
              </GlassCard>
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-blue-400">{paramCoverage.ai_inferred_count ?? '—'}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">AI Inferred</div>
              </GlassCard>
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-yellow-400">{paramCoverage.pending ?? '—'}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">Pending</div>
              </GlassCard>
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-gray-400">{paramCoverage.not_assessable}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">Manual Only</div>
              </GlassCard>
              <GlassCard className="p-3 text-center">
                <div className="text-xl font-black text-accent-light">{coveragePct}%</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">Coverage</div>
              </GlassCard>
            </div>

            {/* Stacked coverage bar */}
            <GlassCard className="p-5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Assessment Breakdown</h4>
              <div className="h-4 rounded bg-white/[0.06] overflow-hidden flex mb-2">
                {(paramCoverage.deterministic_count ?? 0) > 0 && (
                  <div className="h-full bg-emerald-500/60" style={{ width: `${(paramCoverage.deterministic_count ?? 0) / paramCoverage.total * 100}%` }} title={`Deterministic: ${paramCoverage.deterministic_count}`} />
                )}
                {(paramCoverage.ai_inferred_count ?? 0) > 0 && (
                  <div className="h-full bg-blue-500/60" style={{ width: `${(paramCoverage.ai_inferred_count ?? 0) / paramCoverage.total * 100}%` }} title={`AI Inferred: ${paramCoverage.ai_inferred_count}`} />
                )}
                {(paramCoverage.pending ?? 0) > 0 && (
                  <div className="h-full bg-yellow-500/30" style={{ width: `${(paramCoverage.pending ?? 0) / paramCoverage.total * 100}%` }} title={`Pending: ${paramCoverage.pending}`} />
                )}
              </div>
              <div className="flex gap-5 text-[9px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Deterministic</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/60" /> AI Inferred</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/30" /> Pending</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-500/30" /> Skipped / Manual</span>
              </div>
            </GlassCard>

            {/* Per-category coverage */}
            {categoryDetails.length > 0 && (
              <GlassCard className="p-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Coverage by Category</h4>
                <div className="space-y-1.5">
                  {categoryDetails.map(c => {
                    const catTotal = c.params || 1;
                    const catAssessed = c.assessed || 0;
                    const catPct = Math.round(catAssessed / catTotal * 100);
                    return (
                      <div key={c.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-[180px] min-w-[120px] text-gray-400 truncate">{c.label}</span>
                        <div className="flex-1 h-[6px] rounded-sm bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-sm bg-accent/60" style={{ width: `${catPct}%` }} />
                        </div>
                        <span className="min-w-[60px] text-right text-gray-500 font-mono text-[10px]">{catAssessed}/{catTotal}</span>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {/* Manual review params */}
            {paramCoverage.not_assessable_params?.length > 0 && (
              <GlassCard className="p-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Parameters Requiring Manual Review</h4>
                <div className="space-y-1">
                  {paramCoverage.not_assessable_params.map(p => (
                    <div key={p.id} className="flex items-start gap-3 text-[11px] py-1 border-b border-white/[0.02]">
                      <span className="text-gray-600 min-w-[36px] font-mono">{p.id}</span>
                      <span className="text-gray-400 min-w-[200px]">{p.name}</span>
                      <span className="text-gray-600 italic">{p.reason}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="text-center mt-10 pt-6 border-t border-white/[0.06]">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <div className="w-4 h-4 rounded accent-gradient flex items-center justify-center">
            <Activity className="w-2.5 h-2.5 text-white" />
          </div>
          <span className="font-bold text-[11px] text-gray-400 tracking-wide">PwC Org Health Analytics</span>
        </div>
        <p className="text-[9px] text-gray-600">&copy; 2026 PwC. All rights reserved.</p>
      </div>
    </PageTransition>
  );
}
