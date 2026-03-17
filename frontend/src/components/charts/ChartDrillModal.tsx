import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Finding, DrillFilter } from '@/api/types';
import SeverityBadge from '../ui/SeverityBadge';
import { useColors } from '@/context/AppContext';

interface Props {
  filter: DrillFilter | null;
  findings: Finding[];
  scanId?: number;
  onClose: () => void;
  onFindingsChange?: () => void;
}

export default function ChartDrillModal({ filter, findings, onClose }: Props) {
  const navigate = useNavigate();
  const C = useColors();

  const EFFORT_REVERSE: Record<string, string[]> = {
    Low: ['Quick Fix', 'Low'],
    Medium: ['Medium'],
    High: ['Large', 'High'],
  };

  const filtered = filter
    ? findings.filter(f => {
        if (filter.type === 'open') return !f.is_resolved;
        if (filter.type === 'severity') return f.severity === filter.value && !f.is_resolved;
        if (filter.type === 'category') return f.category === filter.value;
        if (filter.type === 'effort') {
          const originals = EFFORT_REVERSE[filter.value];
          return originals ? originals.includes(f.effort) : f.effort === filter.value;
        }
        return true;
      })
    : [];

  const handleViewDetails = (f: Finding) => {
    if (filter) {
      sessionStorage.setItem('dashboard_drill_filter', JSON.stringify(filter));
    }
    navigate(`/scans/${f.scan_id}/findings/${f.id}`);
  };

  return (
    <AnimatePresence>
      {filter && (
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
            className="fixed right-0 top-[72px] bottom-[72px] w-[480px] max-w-[90vw] z-50 flex flex-col shadow-2xl overflow-hidden"
            style={{ background: C.gray90, borderLeft: `1px solid ${C.gray80}` }}
          >
            <div className="h-[3px] flex-shrink-0 accent-gradient" />
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
              <div>
                <h3 className="text-base font-bold" style={{ color: C.gray10 }}>{filter.label}</h3>
                <span className="text-xs" style={{ color: C.gray50 }}>{filtered.length} finding{filtered.length !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={onClose} className="p-1.5 transition-colors" style={{ color: C.gray40 }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: C.gray50 }}>No findings match this filter</div>
              ) : (
                filtered.map(f => (
                  <div key={f.id} className="p-4 space-y-2.5" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold leading-snug" style={{ color: C.gray10 }}>{f.title}</h4>
                      <SeverityBadge severity={f.severity} />
                    </div>
                    {f.category && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={{ background: `${C.supportSuccess}15`, color: C.green40, border: `1px solid ${C.supportSuccess}30` }}
                      >
                        {f.category}
                      </span>
                    )}
                    <p className="text-xs leading-relaxed line-clamp-3" style={{ color: C.gray40 }}>{f.description}</p>
                    {f.affected_components.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {f.affected_components.slice(0, 5).map((c, i) => (
                          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: `${C.gray80}`, color: C.gray30, border: `1px solid ${C.gray70}` }}>
                            {c}
                          </span>
                        ))}
                        {f.affected_components.length > 5 && (
                          <span className="text-[10px]" style={{ color: C.gray50 }}>+{f.affected_components.length - 5} more</span>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleViewDetails(f)}
                        className="flex items-center gap-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
                        style={{ color: C.blue40 }}
                      >
                        View Details <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
