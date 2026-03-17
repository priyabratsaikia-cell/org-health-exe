import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { Finding } from '@/api/types';
import { formatRemediation } from '@/utils/formatters';
import Button from '../ui/Button';
import { useColors } from '@/context/AppContext';

interface Props {
  finding: Finding;
  open: boolean;
  onResolve: (f: Finding) => void;
  scanId?: number;
}

export default function FindingDetail({ finding, open, onResolve, scanId }: Props) {
  const steps = formatRemediation(finding.recommendation);
  const C = useColors();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {open && (
        <motion.tr
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={{ background: C.gray90 }}
        >
          <td colSpan={7} className="p-0">
            <div className="px-6 py-4 mx-4 mb-3 rounded-b-lg" style={{ borderLeft: `2px solid ${C.blue60}`, background: C.gray100 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.blue40 }}>Description</h5>
                  <p className="text-xs leading-relaxed" style={{ color: C.gray40 }}>{finding.description || 'No details available.'}</p>
                  {finding.affected_components.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.blue40 }}>Affected Components</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {finding.affected_components.map((c, i) => (
                          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${C.blue60}10`, color: C.blue40, border: `1px solid ${C.blue60}20` }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.blue40 }}>Recommendation</h5>
                  <div className="glass-card p-3">
                    <ol className="list-none space-y-2 counter-reset-remed">
                      {steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed" style={{ color: C.gray40 }}>
                          <span className="w-5 h-5 rounded-full accent-gradient flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 flex items-center gap-3" style={{ borderTop: `1px solid ${C.gray80}` }}>
                <Button
                  variant="accent"
                  size="sm"
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    const sid = scanId || finding.scan_id;
                    navigate(`/scans/${sid}/findings/${finding.id}`);
                  }}
                >
                  View Details
                </Button>
                <span className="text-[11px]" style={{ color: C.gray50 }}>
                  {finding.is_resolved ? 'Resolved' : 'Open'} &middot; {finding.severity}
                </span>
              </div>
            </div>
          </td>
        </motion.tr>
      )}
    </AnimatePresence>
  );
}
