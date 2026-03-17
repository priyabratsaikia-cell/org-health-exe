import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, AlertTriangle, ShieldAlert, ChevronDown, ChevronRight,
  Code2, BarChart3, Info, X, ExternalLink, CheckCircle, Activity,
  Loader2, ArrowLeft
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import FindingsTable from '@/components/findings/FindingsTable';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';
import { fmtDate, fmtNum } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import { exportReport } from '@/utils/pdfExport';
import type { Scan, Finding, CodeAnalysisResult, ParameterCoverage, CategoryDetail, ParameterResult, ParameterResultsPayload } from '@/api/types';

const SEV_IBM: Record<string, { color: string; label: string }> = {
  CRIT: { color: '#FF8389', label: 'Critical' },
  HIGH: { color: '#FF832B', label: 'High' },
  MED: { color: '#F1C21B', label: 'Medium' },
  LOW: { color: '#42BE65', label: 'Low' },
  INFO: { color: '#4589FF', label: 'Info' },
};

const CODE_PATTERN_LABELS: Record<string, string> = {
  soql_in_loops: 'SOQL in Loops', dml_in_loops: 'DML in Loops', hardcoded_ids: 'Hardcoded IDs',
  empty_catch_blocks: 'Empty Catch Blocks', soql_injection: 'SOQL Injection', missing_sharing: 'Missing Sharing',
  see_all_data: 'SeeAllData=true', missing_asserts: 'Missing Asserts', system_debug_overuse: 'Debug Overuse',
  describe_in_loops: 'Describe in Loops', csrf_dml_constructor: 'CSRF Risk',
};

type TabKey = 'overview' | 'findings' | 'code_quality' | 'coverage';

function scoreColor(s: number): string {
  if (s >= 75) return '#42BE65';
  if (s >= 50) return '#F1C21B';
  return '#FA4D56';
}

function catScoreColor(score: number): string {
  if (score >= 75) return '#42BE65';
  if (score >= 50) return '#F1C21B';
  return '#FF8389';
}

const STATUS_IBM: Record<string, { bg: string; color: string; label: string }> = {
  PASS: { bg: '#42BE6520', color: '#42BE65', label: 'PASS' },
  WARN: { bg: '#F1C21B20', color: '#F1C21B', label: 'WARN' },
  FAIL: { bg: '#FA4D5620', color: '#FA4D56', label: 'FAIL' },
  SKIP: { bg: '#6F6F6F20', color: '#8D8D8D', label: 'SKIP' },
  PENDING: { bg: '#4589FF20', color: '#4589FF', label: 'PENDING' },
};

function CarbonTile({ children, className = '', style, C }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; C: ReturnType<typeof getColors> }) {
  return (
    <div
      className={className}
      style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}`, ...style }}
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

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_IBM[status] || STATUS_IBM.PENDING;
  return <CarbonTag text={s.label} color={s.color} />;
}

function ScoringMethodologyModal({ open, onClose, categoryDetails, catData, C }: {
  open: boolean;
  onClose: () => void;
  categoryDetails: CategoryDetail[];
  catData: { name: string; score: number }[];
  C: ReturnType<typeof getColors>;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4"
        style={{ background: C.gray90, border: `1px solid ${C.gray70}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
          <h3 className="text-[16px] font-semibold" style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}>Scoring Methodology</h3>
          <button onClick={onClose} className="p-1 transition-colors" style={{ color: C.gray50 }}
            onMouseEnter={e => (e.currentTarget.style.color = C.gray10)}
            onMouseLeave={e => (e.currentTarget.style.color = C.gray50)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <h5 className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray50 }}>How We Score</h5>
            <p className="text-[14px] leading-relaxed" style={{ color: C.gray30 }}>
              Each of the <strong style={{ color: C.gray10 }}>294 parameters</strong> is individually assessed as{' '}
              <span style={{ color: C.supportSuccess }}>PASS</span> (1.0),{' '}
              <span style={{ color: C.supportWarning }}>WARN</span> (0.5),{' '}
              <span style={{ color: C.supportError }}>FAIL</span> (0.0), or{' '}
              <span style={{ color: C.gray50 }}>SKIP</span> (excluded).
            </p>
          </div>
          <div>
            <h5 className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray50 }}>Category Score Formula</h5>
            <div className="p-3 font-mono text-[12px]" style={{ background: C.gray80, color: C.gray20 }}>
              Category Score = (Sum of assessable parameter scores / Count of assessed parameters) &times; 100
            </div>
            <p className="mt-2 text-[13px]" style={{ color: C.gray40 }}>
              SKIP and PENDING parameters are excluded from the denominator, so categories aren't penalized for parameters the tool cannot assess.
            </p>
          </div>
          <div>
            <h5 className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray50 }}>Overall Health Score Formula</h5>
            <div className="p-3 font-mono text-[12px]" style={{ background: C.gray80, color: C.gray20 }}>
              Health Score = &Sigma; (Category Score &times; Category Weight) / 100
            </div>
          </div>
          <div>
            <h5 className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray50 }}>Category Weights</h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-0">
              {categoryDetails.length > 0 ? categoryDetails.map(c => (
                <div key={c.key} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${C.gray80}`, borderRight: `1px solid ${C.gray80}` }}>
                  <span className="text-[12px] truncate" style={{ color: C.gray30 }}>{c.label}</span>
                  <span className="text-[12px] font-semibold ml-2" style={{ color: C.blue40 }}>{c.weight}%</span>
                </div>
              )) : catData.map(c => (
                <div key={c.name} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${C.gray80}`, borderRight: `1px solid ${C.gray80}` }}>
                  <span className="text-[12px] truncate" style={{ color: C.gray30 }}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h5 className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray50 }}>Scoring Sources</h5>
            <div className="space-y-0">
              {[
                { label: 'Deterministic', desc: 'Scored directly from collected data (SOQL, Tooling API, code analysis, metadata counts)', color: C.supportSuccess },
                { label: 'AI Inference', desc: 'Scored by Gemini AI when objective thresholds aren\'t possible', color: C.purple40 },
                { label: 'Manual Review', desc: 'Requires external tools or human review (excluded from scoring)', color: C.gray50 },
              ].map(src => (
                <div key={src.label} className="flex gap-3 px-3 py-2.5" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                  <div className="w-1 flex-shrink-0 mt-0.5" style={{ background: src.color, height: 14 }} />
                  <div>
                    <span className="text-[13px] font-semibold block" style={{ color: C.gray10 }}>{src.label}</span>
                    <span className="text-[12px]" style={{ color: C.gray40 }}>{src.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
            <a
              href="https://www.pwc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] transition-colors"
              style={{ color: C.blue40 }}
              onMouseEnter={e => (e.currentTarget.style.color = C.blue20)}
              onMouseLeave={e => (e.currentTarget.style.color = C.blue40)}
            >
              Learn more about our methodology <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qTab = searchParams.get('tab') as TabKey | null;
  const qFinding = searchParams.get('finding');
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [coverageDrillType, setCoverageDrillType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(qTab || 'findings');
  const navigate = useNavigate();
  const { state, toast } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const hoverBg = state.resolvedTheme === 'light' ? '#EBEBEB' : '#353535';

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
        <div>
          <div className="animate-pulse" style={{ background: C.gray90, height: 80, borderBottom: `1px solid ${C.gray80}` }} />
          <div className="grid grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse p-5" style={{ background: C.gray90, height: 100, borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined, borderBottom: `1px solid ${C.gray80}` }} />
            ))}
          </div>
          <div className="grid grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="animate-pulse p-5" style={{ background: C.gray90, height: 240, borderRight: i < 1 ? `1px solid ${C.gray80}` : undefined, borderBottom: `1px solid ${C.gray80}` }} />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!scan) {
    return (
      <PageTransition>
        <div className="px-6 pt-5 pb-4" style={{ background: C.gray100 }}>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => navigate('/scans')} className="text-[12px] transition-colors" style={{ color: C.blue40 }}>Scans</button>
            <span style={{ color: C.gray50 }}>/</span>
            <span className="text-[12px]" style={{ color: C.gray10 }}>Not Found</span>
          </div>
        </div>
        <div className="py-16 text-center text-[14px]" style={{ color: C.gray50 }}>Scan not found.</div>
      </PageTransition>
    );
  }

  if (scan.status === 'running') {
    return (
      <PageTransition>
        <div className="px-6 pt-5 pb-4" style={{ background: C.gray100 }}>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => navigate('/scans')} className="text-[12px] transition-colors" style={{ color: C.blue40 }}>Scans</button>
            <span style={{ color: C.gray50 }}>/</span>
            <span className="text-[12px]" style={{ color: C.gray10 }}>In Progress</span>
          </div>
          <h1 className="text-[28px] font-light tracking-tight mt-2" style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}>
            Health Scan In Progress
          </h1>
        </div>
        <CarbonTile C={C} className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: C.blue40 }} />
          <p className="text-[14px]" style={{ color: C.gray30 }}>Live updates are being processed. This page will refresh when complete.</p>
        </CarbonTile>
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
    { key: 'findings', label: 'Findings', count: findings.length },
    { key: 'overview', label: 'Overview' },
    ...(codeAnalysis && codeAnalysis.status === 'completed' ? [{ key: 'code_quality' as TabKey, label: 'Code Quality', count: codeAnalysis.issues_found }] : []),
    ...(paramCoverage ? [{ key: 'coverage' as TabKey, label: 'Coverage' }] : []),
  ];

  return (
    <PageTransition>
      <AnimatePresence>
        {methodologyOpen && (
          <ScoringMethodologyModal
            open={methodologyOpen}
            onClose={() => setMethodologyOpen(false)}
            categoryDetails={categoryDetails}
            catData={catData}
            C={C}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {coverageDrillType && (() => {
          let drillParams: { id: string; name: string; category: string; status?: string; score?: number; reason?: string; source?: string }[] = [];
          if (coverageDrillType === 'Manual Only') {
            drillParams = (paramCoverage?.not_assessable_params || []).map(p => ({
              id: p.id, name: p.name, category: '', status: 'SKIP', reason: p.reason,
            }));
          } else {
            drillParams = paramResults.filter(p => {
              if (coverageDrillType === 'Assessed') return p.status !== 'PENDING' && p.status !== 'SKIP';
              if (coverageDrillType === 'Deterministic') return p.source?.toLowerCase() === 'deterministic';
              if (coverageDrillType === 'AI Inferred') return p.source?.toLowerCase() === 'ai_inferred' || p.source?.toLowerCase() === 'ai' || p.source?.toLowerCase() === 'llm';
              if (coverageDrillType === 'Pending') return p.status === 'PENDING';
              return false;
            });
          }

          const grouped: Record<string, typeof drillParams> = {};
          for (const p of drillParams) {
            const cat = p.category || 'Uncategorized';
            (grouped[cat] ??= []).push(p);
          }
          const sortedCategories = Object.keys(grouped).sort();
          const totalCount = drillParams.length;

          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 backdrop-blur-sm z-50"
                style={{ background: 'rgba(0,0,0,0.4)' }}
                onClick={() => setCoverageDrillType(null)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed right-0 top-[72px] bottom-[72px] w-[520px] max-w-[90vw] z-50 flex flex-col shadow-2xl overflow-hidden"
                style={{ background: C.gray90, borderLeft: `1px solid ${C.gray80}` }}
              >
                <div className="h-[3px] flex-shrink-0" style={{ background: coverageDrillType === 'Assessed' ? C.supportSuccess : coverageDrillType === 'Deterministic' ? C.teal40 : coverageDrillType === 'AI Inferred' ? C.blue40 : coverageDrillType === 'Pending' ? C.supportWarning : C.gray50 }} />
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: C.gray10 }}>{coverageDrillType} Parameters</h3>
                    <span className="text-xs" style={{ color: C.gray50 }}>{totalCount} parameter{totalCount !== 1 ? 's' : ''} &middot; {sortedCategories.length} categor{sortedCategories.length !== 1 ? 'ies' : 'y'}</span>
                  </div>
                  <button onClick={() => setCoverageDrillType(null)} className="p-1.5 transition-colors" style={{ color: C.gray40 }}>
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {totalCount === 0 ? (
                    <div className="text-center py-12 text-sm" style={{ color: C.gray50 }}>No parameters match this filter</div>
                  ) : (
                    sortedCategories.map(cat => (
                      <div key={cat}>
                        <div className="sticky top-[-1px] z-10 px-5 py-2.5 flex items-center justify-between" style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}`, marginTop: 0 }}>
                          <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.gray30 }}>{cat}</span>
                          <span className="text-[11px] font-mono" style={{ color: C.gray50 }}>{grouped[cat].length}</span>
                        </div>
                        {grouped[cat].map((p, pi) => {
                          const statusInfo = STATUS_IBM[p.status || 'PENDING'] || STATUS_IBM.PENDING;
                          return (
                            <div
                              key={p.id}
                              className="px-5 py-3 space-y-1.5"
                              style={{ background: C.gray90, borderBottom: pi < grouped[cat].length - 1 ? `1px solid ${C.gray80}40` : `1px solid ${C.gray80}` }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <span className="text-[13px] font-semibold block" style={{ color: C.gray10 }}>{p.name}</span>
                                  <span className="text-[11px] font-mono" style={{ color: C.gray60 }}>{p.id}</span>
                                </div>
                                <CarbonTag text={statusInfo.label} color={statusInfo.color} />
                              </div>
                              {p.reason && (
                                <p className="text-[12px] leading-relaxed" style={{ color: C.gray40 }}>{p.reason}</p>
                              )}
                              {p.score != null && p.status !== 'SKIP' && p.status !== 'PENDING' && (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1" style={{ background: C.gray80 }}>
                                    <div className="h-full transition-all" style={{ width: `${Math.min(p.score, 100)}%`, background: p.score >= 75 ? '#42BE65' : p.score >= 50 ? '#F1C21B' : '#FA4D56' }} />
                                  </div>
                                  <span className="text-[11px] font-mono min-w-[28px] text-right" style={{ color: C.gray50 }}>{p.score}</span>
                                </div>
                              )}
                              {p.source && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium mt-0.5"
                                  style={{ background: `${C.blue40}15`, color: C.blue40, border: `1px solid ${C.blue40}30` }}
                                >
                                  {p.source}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      <div>
        {/* Page Header */}
        <div className="px-6 py-3 flex items-center justify-between" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-80 mr-1"
              style={{ color: C.blue40 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span style={{ color: C.gray70 }}>|</span>
            <span className="text-[13px]" style={{ color: C.gray50 }}>{scan.org_alias}</span>
            <span style={{ color: C.gray70 }}>|</span>
            <span className="text-[13px]" style={{ color: C.gray50 }}>{fmtDate(scan.started_at)}</span>
            <span style={{ color: C.gray70 }}>|</span>
            <span className="text-[13px]" style={{ color: C.gray50 }}>{fmtNum(scan.total_components || 0)} components</span>
            {paramCoverage && (
              <>
                <span style={{ color: C.gray70 }}>|</span>
                <span className="text-[13px]" style={{ color: C.gray50 }}>{paramCoverage.assessed}/{paramCoverage.total} parameters assessed</span>
              </>
            )}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-normal transition-colors"
            style={{ background: C.blue60, color: C.white }}
            onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
            onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>

        {/* Health Score Hero Strip */}
        <div className="grid grid-cols-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
          <div className="px-5 py-5" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>Health Score</span>
            <div className="flex items-baseline gap-3">
              <span className="text-[42px] font-light tracking-tight" style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}>
                {hs}
              </span>
              <CarbonTag text={scoreGrade(hs)} color={scoreColor(hs)} />
            </div>
            <div className="mt-2 h-1" style={{ background: C.gray80 }}>
              <div className="h-full transition-all" style={{ width: `${Math.min(hs, 100)}%`, background: scoreColor(hs) }} />
            </div>
          </div>

          <div className="px-5 py-5" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>Total Findings</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[36px] font-light tracking-tight" style={{ color: C.gray10 }}>{findings.length}</span>
            </div>
            <span className="text-[12px]" style={{ color: C.gray50 }}>{findings.length - resolved} open</span>
          </div>

          <div className="px-5 py-5" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>Critical Issues</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[36px] font-light tracking-tight" style={{ color: (scan.critical_count || 0) > 0 ? C.supportError : C.gray10 }}>
                {scan.critical_count || 0}
              </span>
              {(scan.critical_count || 0) > 0 && <CarbonTag text="Action required" color={C.supportError} type="outline" />}
            </div>
            <span className="text-[12px]" style={{ color: (scan.critical_count || 0) > 0 ? C.supportError : C.gray50 }}>
              {(scan.critical_count || 0) > 0 ? 'Immediate attention needed' : 'No critical issues'}
            </span>
          </div>

          <div className="px-5 py-5" style={{ background: C.gray90 }}>
            <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>Resolution Rate</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[36px] font-light tracking-tight" style={{ color: C.gray10 }}>{resolutionRate}%</span>
            </div>
            <span className="text-[12px]" style={{ color: C.gray50 }}>{resolved}/{findings.length} resolved</span>
          </div>
        </div>

        {/* Charts Row */}
        <div className={`grid ${trendEntries.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {/* Severity Distribution */}
          <CarbonTile C={C} className="p-5" style={{ borderRight: `1px solid ${C.gray80}` }}>
            <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Severity Distribution</h4>
            <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Click bars to filter findings</p>
            <div className="space-y-3">
              {sevData.filter(d => d.value > 0).map(d => {
                const info = SEV_IBM[d.name];
                const maxVal = Math.max(...sevData.map(s => s.value), 1);
                const pct = (d.value / maxVal) * 100;
                return (
                  <button
                    key={d.name}
                    onClick={() => {
                      setSevFilter(prev => prev === d.label ? '' : d.label);
                      setActiveTab('findings');
                    }}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <CarbonTag text={info.label} color={info.color} />
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
              {sevData.every(d => d.value === 0) && (
                <div className="py-6 text-center text-[14px]" style={{ color: C.gray50 }}>No findings</div>
              )}
            </div>
          </CarbonTile>

          {/* Category Scores */}
          <CarbonTile C={C} className="p-5" style={{ borderRight: trendEntries.length > 0 ? `1px solid ${C.gray80}` : undefined }}>
            <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Category Scores</h4>
            <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>Sorted by risk (lowest first)</p>
            {catBarData.length > 0 ? (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                {catBarData.map(cat => {
                  const barColor = catScoreColor(cat.score);
                  return (
                    <button
                      key={cat.name}
                      onClick={() => {
                        setCatFilter(prev => prev === cat.name ? '' : cat.name);
                        setActiveTab('findings');
                      }}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] group-hover:text-white transition-colors truncate" style={{ color: C.gray30 }}>{cat.name}</span>
                        <span className="text-[13px] font-normal ml-2" style={{ color: barColor }}>{cat.score.toFixed(0)}/100</span>
                      </div>
                      <div className="h-1" style={{ background: C.gray80 }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(cat.score, 100)}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full"
                          style={{ background: barColor }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-[14px]" style={{ color: C.gray50 }}>No category scores</div>
            )}
          </CarbonTile>

          {/* Limit Trends */}
          {trendEntries.length > 0 && (
            <CarbonTile C={C} className="p-5">
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Governor Limit Trends</h4>
              <p className="text-[12px] mb-4" style={{ color: C.gray50 }}>7-day snapshot</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {trendEntries.map(([key, data]) => {
                  const label = key.replace('trend_', '').replace('_7d', '').replace(/_/g, ' ');
                  const chartData = data.map((d: any) => ({
                    date: d.CreatedDate ? new Date(d.CreatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                    pct: d.PercentOfLimit__c ?? 0,
                  }));
                  const latestPct = chartData.length > 0 ? chartData[chartData.length - 1].pct : 0;
                  const sparkColor = latestPct >= 80 ? C.supportError : latestPct >= 60 ? C.supportWarning : C.supportSuccess;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: C.gray50 }} title={label}>
                          {label.length > 16 ? label.substring(0, 14) + '..' : label}
                        </span>
                        <span className="text-[12px] font-semibold" style={{ color: sparkColor }}>{latestPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-10">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <Line type="monotone" dataKey="pct" stroke={sparkColor} strokeWidth={1.5} dot={false} />
                            <Tooltip contentStyle={{ backgroundColor: C.gray90, border: `1px solid ${C.gray70}`, borderRadius: 0, fontSize: 11, padding: '4px 8px' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CarbonTile>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-5 py-3 text-[14px] font-normal transition-colors relative"
              style={{ color: activeTab === tab.key ? C.gray10 : C.gray50 }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="ml-1.5 text-[12px] px-1.5 py-0.5"
                  style={{
                    background: activeTab === tab.key ? `${C.blue60}30` : `${C.gray70}`,
                    color: activeTab === tab.key ? C.blue40 : C.gray40,
                  }}
                >
                  {tab.count}
                </span>
              )}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-[3px]"
                  style={{ background: C.blue60 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
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
            >
              {/* Executive Summary */}
              <CarbonTile C={C} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: C.purple60 }}>
                    <span className="text-[10px] font-bold text-white">AI</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-[12px] font-semibold block mb-1" style={{ color: C.purple40 }}>AI-Generated Summary</span>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: C.gray30 }}>
                      {scan.summary || 'No summary available for this scan.'}
                    </p>
                  </div>
                </div>
              </CarbonTile>

              {/* Category Score Breakdown */}
              {catData.length > 0 && (
                <CarbonTile C={C} className="p-0">
                  <div className="flex items-center justify-between px-5 py-3" style={{ background: C.gray80 }}>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" style={{ color: C.blue40 }} />
                      <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Category Score Breakdown</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px]" style={{ color: C.gray50 }}>Click rows to expand parameter details</span>
                      <button
                        onClick={() => setMethodologyOpen(true)}
                        className="flex items-center gap-1.5 text-[12px] transition-colors"
                        style={{ color: C.blue40 }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.blue20)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.blue40)}
                      >
                        <Info className="w-3.5 h-3.5" />
                        Methodology
                      </button>
                    </div>
                  </div>

                  {/* Category Table Header */}
                  <div className="grid grid-cols-[28px_1fr_60px_1fr_50px] gap-2 px-5 py-2 text-[12px] font-semibold uppercase tracking-wider" style={{ background: C.gray80, color: C.gray30, borderBottom: `1px solid ${C.gray70}` }}>
                    <span></span>
                    <span>Category</span>
                    <span>Weight</span>
                    <span>Score</span>
                    <span className="text-right">Value</span>
                  </div>

                  {(categoryDetails.length > 0
                    ? categoryDetails
                    : catData.map(c => ({ key: c.name, label: c.name, weight: 0, params: 0, score: c.score, assessed: 0, passed: 0, warned: 0, failed: 0, skipped: 0, pending: 0 }))
                  ).sort((a, b) => a.score - b.score).map(cat => {
                    const key = cat.key;
                    const isOpen = expandedCats.has(key);
                    const catParams = paramsByCategory[key] || [];
                    const barColor = catScoreColor(cat.score);
                    return (
                      <div key={key}>
                        <button
                          onClick={() => toggleCat(key)}
                          className="w-full grid grid-cols-[28px_1fr_60px_1fr_50px] gap-2 items-center px-5 py-3 text-left transition-colors"
                          style={{ borderBottom: `1px solid ${C.gray80}` }}
                        >
                          {isOpen
                            ? <ChevronDown className="w-4 h-4" style={{ color: C.gray50 }} />
                            : <ChevronRight className="w-4 h-4" style={{ color: C.gray50 }} />
                          }
                          <span className="text-[13px] truncate" style={{ color: C.gray10 }} title={cat.label}>{cat.label}</span>
                          <span className="text-[12px] font-normal" style={{ color: C.gray50 }}>{cat.weight > 0 ? `${cat.weight}%` : '—'}</span>
                          <div className="h-1" style={{ background: C.gray80 }}>
                            <div className="h-full transition-all" style={{ width: `${Math.min(cat.score, 100)}%`, background: barColor }} />
                          </div>
                          <span className="text-[13px] font-semibold text-right" style={{ color: barColor }}>
                            {typeof cat.score === 'number' ? cat.score.toFixed(1) : cat.score}
                          </span>
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen && catParams.length > 0 && (
                            <motion.div key={`cat-${key}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div style={{ background: C.gray100 }}>
                                <div className="grid grid-cols-[50px_1fr_70px_1fr_120px] gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray50, borderBottom: `1px solid ${C.gray80}` }}>
                                  <span>ID</span><span>Parameter</span><span>Status</span><span>Reason</span><span>Data</span>
                                </div>
                                {catParams.map(p => (
                                  <div key={p.id} className="grid grid-cols-[50px_1fr_70px_1fr_120px] gap-2 px-5 py-2 items-center transition-colors" style={{ borderBottom: `1px solid ${C.gray80}20` }}>
                                    <span className="text-[12px] font-mono" style={{ color: C.gray60 }}>{p.id}</span>
                                    <span className="text-[12px] truncate" style={{ color: C.gray20 }} title={p.name}>{p.name}</span>
                                    <StatusBadge status={p.status} />
                                    <span className="text-[12px] truncate" style={{ color: C.gray40 }} title={p.reason}>{p.reason}</span>
                                    <span className="text-[12px] font-mono truncate" style={{ color: C.gray50 }} title={p.data_value}>{p.data_value || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                          {isOpen && catParams.length === 0 && (
                            <motion.div key={`cat-empty-${key}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="px-5 py-4 text-[13px]" style={{ background: C.gray100, color: C.gray50, borderBottom: `1px solid ${C.gray80}` }}>
                                No per-parameter details available for this scan.
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </CarbonTile>
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
              <CarbonTile C={C} className="p-5">
                {/* Active Filters */}
                {(sevFilter || catFilter) && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[12px] font-semibold" style={{ color: C.gray50 }}>Active filters:</span>
                    {sevFilter && (
                      <button
                        onClick={() => setSevFilter('')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] transition-colors"
                        style={{ border: `1px solid ${C.blue40}`, color: C.blue40, background: `${C.blue60}15` }}
                      >
                        {sevFilter} <X className="w-3 h-3" />
                      </button>
                    )}
                    {catFilter && (
                      <button
                        onClick={() => setCatFilter('')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] transition-colors"
                        style={{ border: `1px solid ${C.blue40}`, color: C.blue40, background: `${C.blue60}15` }}
                      >
                        {catFilter} <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <FindingsTable
                  findings={findings}
                  onResolve={handleResolve}
                  initialSeverityFilter={sevFilter}
                  initialCategoryFilter={catFilter}
                  initialOpenFindingId={qFinding ? Number(qFinding) : undefined}
                  scanId={scan.id}
                />
              </CarbonTile>
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
            >
              {/* Summary KPIs */}
              <div className="grid grid-cols-4">
                {[
                  { label: 'Files Scanned', value: codeAnalysis.files_scanned, color: C.gray10 },
                  { label: 'Total Issues', value: codeAnalysis.issues_found, color: codeAnalysis.issues_found > 0 ? C.supportError : C.supportSuccess },
                  ...Object.entries(codeAnalysis.severity_counts || {}).filter(([, count]) => count > 0).slice(0, 2).map(([sev, count]) => ({
                    label: sev,
                    value: count,
                    color: sev === 'Critical' ? C.red40 : sev === 'High' ? C.orange40 : sev === 'Medium' ? C.yellow30 : C.green40,
                  })),
                ].map((kpi, i, arr) => (
                  <CarbonTile C={C} key={kpi.label} className="px-5 py-4" style={{ borderRight: i < arr.length - 1 ? `1px solid ${C.gray80}` : undefined }}>
                    <span className="text-[12px] font-normal block mb-1" style={{ color: C.gray50 }}>{kpi.label}</span>
                    <span className="text-[32px] font-light tracking-tight" style={{ color: kpi.color }}>{kpi.value}</span>
                  </CarbonTile>
                ))}
              </div>

              {/* Issues by Anti-Pattern */}
              <CarbonTile C={C} className="p-0">
                <div className="flex items-center gap-2 px-5 py-3" style={{ background: C.gray80 }}>
                  <Code2 className="w-4 h-4" style={{ color: C.blue40 }} />
                  <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Issues by Anti-Pattern</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {Object.entries(codeAnalysis.findings_by_pattern || {}).sort((a, b) => b[1] - a[1]).map(([pat, count]) => {
                    const maxCount = Math.max(...Object.values(codeAnalysis!.findings_by_pattern || {}), 1);
                    const pct = (count / maxCount) * 100;
                    return (
                      <div key={pat} className="flex items-center gap-3">
                        <span className="w-[180px] min-w-[140px] text-[13px] truncate" style={{ color: C.gray30 }}>{CODE_PATTERN_LABELS[pat] || pat}</span>
                        <div className="flex-1 h-1" style={{ background: C.gray80 }}>
                          <div className="h-full" style={{ width: `${pct}%`, background: C.red40 }} />
                        </div>
                        <span className="min-w-[28px] text-right text-[13px] font-semibold" style={{ color: C.gray10 }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CarbonTile>

              {/* Severity Breakdown */}
              {Object.entries(codeAnalysis.severity_counts || {}).some(([, count]) => count > 0) && (
                <CarbonTile C={C} className="p-5">
                  <h4 className="text-[14px] font-semibold mb-3" style={{ color: C.gray10 }}>Severity Breakdown</h4>
                  <div className="grid grid-cols-4 gap-0">
                    {Object.entries(codeAnalysis.severity_counts || {}).map(([sev, count]) => {
                      if (count === 0) return null;
                      const sevColor = sev === 'Critical' ? C.red40 : sev === 'High' ? C.orange40 : sev === 'Medium' ? C.yellow30 : C.green40;
                      return (
                        <div key={sev} className="p-4" style={{ borderLeft: `3px solid ${sevColor}`, background: C.gray80 }}>
                          <span className="text-[28px] font-light block" style={{ color: C.gray10 }}>{count}</span>
                          <span className="text-[12px]" style={{ color: C.gray50 }}>{sev}</span>
                        </div>
                      );
                    })}
                  </div>
                </CarbonTile>
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
            >
              {/* Coverage KPIs */}
              <div className="grid grid-cols-6">
                {[
                  { label: 'Assessed', value: paramCoverage.assessed, color: C.supportSuccess, drillable: true },
                  { label: 'Deterministic', value: paramCoverage.deterministic_count ?? '—', color: C.teal40, drillable: true },
                  { label: 'AI Inferred', value: paramCoverage.ai_inferred_count ?? '—', color: C.blue40, drillable: true },
                  { label: 'Pending', value: paramCoverage.pending ?? '—', color: C.supportWarning, drillable: true },
                  { label: 'Manual Only', value: paramCoverage.not_assessable, color: C.gray50, drillable: true },
                  { label: 'Coverage', value: `${coveragePct}%`, color: C.blue40, drillable: false },
                ].map((kpi, i) => (
                  <CarbonTile C={C} key={kpi.label} className="px-4 py-4 text-center" style={{ borderRight: i < 5 ? `1px solid ${C.gray80}` : undefined }}>
                    {kpi.drillable && kpi.value !== '—' && kpi.value !== 0 ? (
                      <button
                        onClick={() => setCoverageDrillType(kpi.label)}
                        className="w-full text-center group"
                      >
                        <span className="text-[24px] font-light block transition-opacity group-hover:opacity-80 cursor-pointer" style={{ color: kpi.color }}>{kpi.value}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider transition-opacity group-hover:opacity-80" style={{ color: C.gray50 }}>{kpi.label}</span>
                      </button>
                    ) : (
                      <>
                        <span className="text-[24px] font-light block" style={{ color: kpi.color }}>{kpi.value}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray50 }}>{kpi.label}</span>
                      </>
                    )}
                  </CarbonTile>
                ))}
              </div>

              {/* Assessment Breakdown Bar */}
              <CarbonTile C={C} className="p-5">
                <h4 className="text-[14px] font-semibold mb-3" style={{ color: C.gray10 }}>Assessment Breakdown</h4>
                <div className="h-2 flex overflow-hidden" style={{ background: C.gray80 }}>
                  {(paramCoverage.deterministic_count ?? 0) > 0 && (
                    <div className="h-full" style={{ width: `${(paramCoverage.deterministic_count ?? 0) / paramCoverage.total * 100}%`, background: C.teal40 }} title={`Deterministic: ${paramCoverage.deterministic_count}`} />
                  )}
                  {(paramCoverage.ai_inferred_count ?? 0) > 0 && (
                    <div className="h-full" style={{ width: `${(paramCoverage.ai_inferred_count ?? 0) / paramCoverage.total * 100}%`, background: C.blue40 }} title={`AI Inferred: ${paramCoverage.ai_inferred_count}`} />
                  )}
                  {(paramCoverage.pending ?? 0) > 0 && (
                    <div className="h-full" style={{ width: `${(paramCoverage.pending ?? 0) / paramCoverage.total * 100}%`, background: `${C.supportWarning}60` }} title={`Pending: ${paramCoverage.pending}`} />
                  )}
                </div>
                <div className="flex gap-5 mt-3">
                  {[
                    { label: 'Deterministic', color: C.teal40 },
                    { label: 'AI Inferred', color: C.blue40 },
                    { label: 'Pending', color: `${C.supportWarning}60` },
                    { label: 'Skipped / Manual', color: C.gray60 },
                  ].map(leg => (
                    <span key={leg.label} className="flex items-center gap-1.5 text-[12px]" style={{ color: C.gray40 }}>
                      <span className="w-3 h-1" style={{ background: leg.color }} />
                      {leg.label}
                    </span>
                  ))}
                </div>
              </CarbonTile>

              {/* Per-category Coverage */}
              {categoryDetails.length > 0 && (
                <CarbonTile C={C} className="p-0">
                  <div className="px-5 py-3" style={{ background: C.gray80 }}>
                    <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Coverage by Category</span>
                  </div>
                  <div>
                    {categoryDetails.map((c, i) => {
                      const catTotal = c.params || 1;
                      const catAssessed = c.assessed || 0;
                      const catPct = Math.round(catAssessed / catTotal * 100);
                      return (
                        <div key={c.key} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: i < categoryDetails.length - 1 ? `1px solid ${C.gray80}` : undefined }}>
                          <span className="w-[180px] min-w-[120px] text-[13px] truncate" style={{ color: C.gray30 }}>{c.label}</span>
                          <div className="flex-1 h-1" style={{ background: C.gray80 }}>
                            <div className="h-full transition-all" style={{ width: `${catPct}%`, background: C.blue40 }} />
                          </div>
                          <span className="min-w-[60px] text-right text-[12px] font-mono" style={{ color: C.gray50 }}>{catAssessed}/{catTotal}</span>
                        </div>
                      );
                    })}
                  </div>
                </CarbonTile>
              )}

            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: C.gray80, borderTop: `1px solid ${C.gray70}` }}>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" style={{ color: C.blue40 }} />
            <span className="text-[12px] font-normal" style={{ color: C.gray40 }}>PwC Org Health Analytics</span>
          </div>
          <span className="text-[11px]" style={{ color: C.gray50 }}>&copy; 2026 PwC. All rights reserved.</span>
        </div>
      </div>
    </PageTransition>
  );
}
