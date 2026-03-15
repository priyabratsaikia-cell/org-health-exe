import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Finding, DrillFilter } from '@/api/types';
import SeverityBadge from '../ui/SeverityBadge';
import EffortTag from '../ui/EffortTag';
import Button from '../ui/Button';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';

interface Props {
  filter: DrillFilter | null;
  findings: Finding[];
  scanId?: number;
  onClose: () => void;
  onFindingsChange?: () => void;
}

export default function ChartDrillModal({ filter, findings, scanId, onClose, onFindingsChange }: Props) {
  const navigate = useNavigate();
  const { toast } = useApp();

  const filtered = filter
    ? findings.filter(f => {
        if (filter.type === 'severity') return f.severity === filter.value;
        if (filter.type === 'category') return f.category === filter.value;
        if (filter.type === 'effort') return f.effort === filter.value;
        return true;
      })
    : [];

  const handleResolve = async (f: Finding) => {
    try {
      if (f.is_resolved) {
        await api.unresolveFinding(f.id);
        toast('Marked as unresolved', 'success');
      } else {
        await api.resolveFinding(f.id);
        toast('Marked as resolved', 'success');
      }
      onFindingsChange?.();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <AnimatePresence>
      {filter && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-[480px] max-w-[90vw] bg-surface border-l border-white/[0.06] z-50 flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-gray-100">{filter.label}</h3>
                <span className="text-xs text-gray-500">{filtered.length} finding{filtered.length !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">No findings match this filter</div>
              ) : (
                filtered.map(f => (
                  <div key={f.id} className="glass-card p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-200 leading-snug">{f.title}</h4>
                      <SeverityBadge severity={f.severity} />
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{f.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {f.effort && <EffortTag effort={f.effort} />}
                      <span className="text-[10px] text-gray-500">{f.category}</span>
                    </div>
                    {f.affected_components.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {f.affected_components.slice(0, 5).map((c, i) => (
                          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">
                            {c}
                          </span>
                        ))}
                        {f.affected_components.length > 5 && (
                          <span className="text-[10px] text-gray-500">+{f.affected_components.length - 5} more</span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => handleResolve(f)}
                      className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                        f.is_resolved
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {f.is_resolved ? 'Resolved' : 'Mark as Resolved'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {scanId && (
              <div className="px-5 py-3 border-t border-white/[0.06]">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  onClick={() => { onClose(); navigate(`/scans/${scanId}`); }}
                  className="w-full justify-center"
                >
                  View Full Report
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
