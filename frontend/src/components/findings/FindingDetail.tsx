import { motion, AnimatePresence } from 'framer-motion';
import type { Finding } from '@/api/types';
import { formatRemediation } from '@/utils/formatters';
import Button from '../ui/Button';

interface Props {
  finding: Finding;
  open: boolean;
  onResolve: (f: Finding) => void;
}

export default function FindingDetail({ finding, open, onResolve }: Props) {
  const steps = formatRemediation(finding.recommendation);

  return (
    <AnimatePresence>
      {open && (
        <motion.tr
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-surface/50"
        >
          <td colSpan={7} className="p-0">
            <div className="px-6 py-4 border-l-2 border-accent mx-4 mb-3 bg-base/50 rounded-b-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">Description</h5>
                  <p className="text-xs text-gray-400 leading-relaxed">{finding.description || 'No details available.'}</p>
                  {finding.affected_components.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">Affected Components</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {finding.affected_components.map((c, i) => (
                          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent-light border border-accent/20">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">Recommendation</h5>
                  <div className="glass-card p-3">
                    <ol className="list-none space-y-2 counter-reset-remed">
                      {steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-gray-400 leading-relaxed">
                          <span className="w-5 h-5 rounded-full accent-gradient flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <Button
                  variant={finding.is_resolved ? 'accent' : 'secondary'}
                  size="sm"
                  onClick={() => onResolve(finding)}
                >
                  {finding.is_resolved ? 'Resolved' : 'Mark as Resolved'}
                </Button>
              </div>
            </div>
          </td>
        </motion.tr>
      )}
    </AnimatePresence>
  );
}
