import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown } from 'lucide-react';
import AgentPulse from '../ui/AgentPulse';
import { api } from '@/api/client';
import { useApp, useColors } from '@/context/AppContext';
import { fmtDate } from '@/utils/formatters';
import type { Scan } from '@/api/types';

interface CategoryDiff {
  name: string;
  prev: number;
  cur: number;
  delta: number;
}

interface Props {
  scan: Scan | null;
  prevScan: Scan | null;
  onClose: () => void;
}

export default function ScanCompareModal({ scan, prevScan, onClose }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const { toast } = useApp();
  const C = useColors();

  const open = !!(scan && prevScan);

  useEffect(() => {
    if (open) {
      document.body.dataset.modalOpen = 'true';
      return () => { delete document.body.dataset.modalOpen; };
    }
  }, [open]);

  const diffs: CategoryDiff[] = [];
  let scoreDelta = 0;
  if (scan && prevScan) {
    scoreDelta = (scan.health_score || 0) - (prevScan.health_score || 0);
    try {
      const curCats: Record<string, number> = JSON.parse(scan.category_scores || '{}');
      const prevCats: Record<string, number> = JSON.parse(prevScan.category_scores || '{}');
      const allKeys = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);
      [...allKeys].sort().forEach(k => {
        const cur = Math.round(curCats[k] ?? 0);
        const prev = Math.round(prevCats[k] ?? 0);
        diffs.push({ name: k, prev, cur, delta: cur - prev });
      });
      diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    } catch { /* ignore */ }
  }

  const improved = diffs.filter(d => d.delta > 0);
  const degraded = diffs.filter(d => d.delta < 0);
  const unchanged = diffs.filter(d => d.delta === 0);

  useEffect(() => {
    if (!scan || !prevScan) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    api.compareScansAnalysis(scan.id, prevScan.id)
      .then(r => setAnalysis(r.analysis))
      .catch(e => {
        setAnalysisError(e.message || 'Analysis failed');
        toast('Failed to load AI analysis', 'error');
      })
      .finally(() => setAnalysisLoading(false));
  }, [scan?.id, prevScan?.id, toast]);

  const DeltaIcon = ({ delta }: { delta: number }) => {
    if (delta > 0) return <ArrowUp className="w-3 h-3" />;
    if (delta < 0) return <ArrowDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const deltaColor = (d: number) => d > 0 ? '#10B981' : d < 0 ? '#EF4444' : C.gray50;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-sm z-50"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-[72px] bottom-[72px] w-[520px] max-w-[90vw] z-50 flex flex-col shadow-2xl overflow-hidden"
            style={{ background: C.gray90, borderLeft: `1px solid ${C.gray80}` }}
          >
            <div className="h-[3px] flex-shrink-0 accent-gradient" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
              <div>
                <h3 className="text-base font-bold" style={{ color: C.gray10 }}>Scan Comparison</h3>
                <span className="text-[11px]" style={{ color: C.gray50 }}>
                  {fmtDate(prevScan!.started_at)} → {fmtDate(scan!.started_at)}
                </span>
              </div>
              <button onClick={onClose} className="p-1.5 transition-colors" style={{ color: C.gray40 }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Score Summary */}
              <div className="px-5 py-4 flex items-center gap-5" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: C.gray50 }}>Previous</span>
                  <span className="text-2xl font-extrabold" style={{ color: C.gray30 }}>{prevScan!.health_score || 0}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 flex items-center justify-center"
                    style={{ background: `${deltaColor(scoreDelta)}15`, border: `1px solid ${deltaColor(scoreDelta)}30` }}
                  >
                    {scoreDelta > 0 ? <TrendingUp className="w-5 h-5" style={{ color: '#10B981' }} />
                      : scoreDelta < 0 ? <TrendingDown className="w-5 h-5" style={{ color: '#EF4444' }} />
                      : <Minus className="w-5 h-5" style={{ color: C.gray50 }} />}
                  </div>
                  <span className="text-xs font-bold" style={{ color: deltaColor(scoreDelta) }}>
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                  </span>
                </div>
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: C.gray50 }}>Current</span>
                  <span className="text-2xl font-extrabold" style={{ color: C.gray10 }}>{scan!.health_score || 0}</span>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.gray50 }}>Category Breakdown</h4>
                <div className="space-y-2">
                  {diffs.map(d => (
                    <div key={d.name} className="flex items-center gap-3 py-1.5 px-3" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}40` }}>
                      <span className="flex-1 text-[12px] font-medium" style={{ color: C.gray20 }}>{d.name}</span>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: C.gray50 }}>{d.prev}</span>
                      <span className="text-[10px]" style={{ color: C.gray60 }}>→</span>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: C.gray20 }}>{d.cur}</span>
                      <span
                        className="flex items-center gap-0.5 text-[11px] font-semibold w-14 justify-end"
                        style={{ color: deltaColor(d.delta) }}
                      >
                        <DeltaIcon delta={d.delta} />
                        {d.delta > 0 ? '+' : ''}{d.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Stats */}
              <div className="px-5 py-3 flex gap-3" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                {improved.length > 0 && (
                  <span className="text-[11px] font-medium px-2 py-1" style={{ background: '#10B98115', color: '#10B981', border: '1px solid #10B98130' }}>
                    {improved.length} improved
                  </span>
                )}
                {degraded.length > 0 && (
                  <span className="text-[11px] font-medium px-2 py-1" style={{ background: '#EF444415', color: '#EF4444', border: '1px solid #EF444430' }}>
                    {degraded.length} degraded
                  </span>
                )}
                {unchanged.length > 0 && (
                  <span className="text-[11px] font-medium px-2 py-1" style={{ background: `${C.gray80}`, color: C.gray40, border: `1px solid ${C.gray70}` }}>
                    {unchanged.length} unchanged
                  </span>
                )}
              </div>

              {/* AI Analysis */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <AgentPulse size="sm" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gradient">AI Analysis</span>
                </div>

                {analysisLoading && (
                  <div className="space-y-3 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.blue40} transparent ${C.blue40} ${C.blue40}` }} />
                      <span className="text-sm" style={{ color: C.gray40 }}>Generating analysis...</span>
                    </div>
                    <div className="space-y-2">
                      {[85, 100, 70, 90, 60].map((w, i) => (
                        <div
                          key={i}
                          className="h-3 rounded animate-pulse"
                          style={{ width: `${w}%`, background: C.gray80 }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {analysisError && !analysisLoading && (
                  <div className="py-4 text-sm" style={{ color: C.gray50 }}>
                    Could not generate analysis. {analysisError}
                  </div>
                )}

                {analysis && !analysisLoading && (
                  <div className="text-[13px] leading-relaxed" style={{ color: C.gray30 }}>
                    {analysis.split('\n').filter(Boolean).map((line, i) => {
                      const trimmed = line.trim();

                      if (trimmed.startsWith('##') || trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.startsWith('- ')) {
                        const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
                        return (
                          <div key={i} className="flex items-center gap-2 mt-4 mb-2 pt-3 first:mt-0 first:pt-0" style={{ borderTop: i > 0 ? `1px solid ${C.gray80}` : undefined }}>
                            <div className="w-1 h-4 flex-shrink-0" style={{ background: C.blue40 }} />
                            <h5 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gray10 }}>{text}</h5>
                          </div>
                        );
                      }

                      if (/^[-*•]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
                        const content = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
                        const parts = content.split(/(\*\*[^*]+\*\*)/g);
                        return (
                          <div key={i} className="flex gap-2.5 pl-1 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: C.blue40 }} />
                            <span className="flex-1">
                              {parts.map((part, pi) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={pi} style={{ color: C.gray10, fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
                                }
                                return <span key={pi}>{part}</span>;
                              })}
                            </span>
                          </div>
                        );
                      }

                      if (trimmed.length === 0) return null;

                      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
                      return (
                        <p key={i} className="py-1">
                          {parts.map((part, pi) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={pi} style={{ color: C.gray10, fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
                            }
                            return <span key={pi}>{part}</span>;
                          })}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
