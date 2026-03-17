import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, CheckCircle2, XCircle, RefreshCw,
  Loader2, UserCheck, AlertTriangle, Cpu, ChevronRight,
} from 'lucide-react';
import { api } from '@/api/client';
import { getColors } from '@/utils/colors';
import type { Finding, VerificationResult } from '@/api/types';

type Phase = 'scanning' | 'passed' | 'failed' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  finding: Finding;
  C: ReturnType<typeof getColors>;
  onResolved: () => void;
}

const SCAN_STEPS = [
  'Connecting to Salesforce org...',
  'Retrieving affected components...',
  'Analyzing current component state...',
  'Running AI verification scan...',
  'Generating verification report...',
];

export default function ResolutionVerificationModal({ open, onClose, finding, C, onResolved }: Props) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [scanStep, setScanStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const runVerification = useCallback(async () => {
    setPhase('scanning');
    setResult(null);
    setScanStep(0);
    setErrorMsg('');

    const interval = setInterval(() => {
      setScanStep(prev => Math.min(prev + 1, SCAN_STEPS.length - 1));
    }, 2200);

    try {
      const res = await api.verifyResolution(finding.id);
      clearInterval(interval);
      setScanStep(SCAN_STEPS.length - 1);
      setResult(res);

      await new Promise(r => setTimeout(r, 600));

      if (res.verified) {
        setPhase('passed');
        onResolved();
      } else {
        setPhase('failed');
      }
    } catch (e: any) {
      clearInterval(interval);
      setErrorMsg(e.message || 'Verification failed unexpectedly');
      setPhase('error');
    }
  }, [finding.id, onResolved]);

  useEffect(() => {
    if (open) {
      document.body.dataset.modalOpen = 'true';
      runVerification();
    }
    return () => {
      delete document.body.dataset.modalOpen;
      setPhase('scanning');
      setResult(null);
      setScanStep(0);
    };
  }, [open, runVerification]);

  if (!open) return null;

  const confidenceColor = (c: string) => {
    if (c === 'high') return C.supportSuccess;
    if (c === 'medium') return C.supportWarning;
    return C.supportError;
  };

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
            onClick={phase !== 'scanning' ? onClose : undefined}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-[72px] bottom-[72px] w-[520px] max-w-[90vw] z-50 flex flex-col shadow-2xl overflow-hidden"
            style={{ background: C.gray90, borderLeft: `1px solid ${C.gray80}` }}
          >
            {/* Top accent bar */}
            <div
              className="h-[3px] flex-shrink-0"
              style={{
                background: phase === 'scanning' ? C.blue60
                  : phase === 'passed' ? C.supportSuccess
                  : phase === 'failed' ? C.supportError
                  : C.supportWarning,
              }}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: phase === 'scanning' ? `${C.blue60}20`
                      : phase === 'passed' ? `${C.supportSuccess}20`
                      : `${C.supportError}20`,
                  }}
                >
                  {phase === 'scanning' ? (
                    <Cpu className="w-4 h-4 animate-pulse" style={{ color: C.blue40 }} />
                  ) : phase === 'passed' ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: C.supportSuccess }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: C.supportError }} />
                  )}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold" style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}>
                    {phase === 'scanning' ? 'AI Verification In Progress'
                      : phase === 'passed' ? 'Verification Passed'
                      : phase === 'failed' ? 'Verification Failed'
                      : 'Verification Error'}
                  </h3>
                  <span className="text-[12px]" style={{ color: C.gray50 }}>
                    FND-{String(finding.id).padStart(4, '0')} &middot; {finding.severity}
                  </span>
                </div>
              </div>
              <button
                onClick={phase !== 'scanning' ? onClose : undefined}
                className="p-1.5 transition-colors"
                style={{ color: phase === 'scanning' ? C.gray70 : C.gray40, cursor: phase === 'scanning' ? 'not-allowed' : 'pointer' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Finding context */}
              <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: C.gray50 }}>
                  Finding Under Verification
                </span>
                <p className="text-[14px] font-semibold" style={{ color: C.gray10 }}>{finding.title}</p>
                <p className="text-[12px] mt-1 line-clamp-2" style={{ color: C.gray40 }}>{finding.description}</p>
                {finding.affected_components.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {finding.affected_components.slice(0, 6).map((comp, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-1.5 py-0.5"
                        style={{ background: `${C.purple40}12`, color: C.purple40, border: `1px solid ${C.purple40}20` }}
                      >
                        {comp}
                      </span>
                    ))}
                    {finding.affected_components.length > 6 && (
                      <span className="text-[10px] px-1.5 py-0.5" style={{ color: C.gray50 }}>
                        +{finding.affected_components.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Scanning phase */}
              {phase === 'scanning' && (
                <div className="px-5 py-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.blue40 }} />
                    <div>
                      <span className="text-[14px] font-semibold block" style={{ color: C.gray10 }}>
                        Verifying Resolution
                      </span>
                      <span className="text-[12px]" style={{ color: C.gray50 }}>
                        Scanning your Salesforce org to confirm the fix is applied
                      </span>
                    </div>
                  </div>

                  {/* Scan steps */}
                  <div className="space-y-0">
                    {SCAN_STEPS.map((step, i) => {
                      const isActive = i === scanStep;
                      const isDone = i < scanStep;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.15 }}
                          className="flex items-center gap-3 py-3"
                          style={{ borderBottom: i < SCAN_STEPS.length - 1 ? `1px solid ${C.gray80}40` : undefined }}
                        >
                          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4" style={{ color: C.supportSuccess }} />
                            ) : isActive ? (
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.blue40 }} />
                            ) : (
                              <div className="w-2 h-2 rounded-full" style={{ background: C.gray70 }} />
                            )}
                          </div>
                          <span
                            className="text-[13px]"
                            style={{ color: isDone ? C.supportSuccess : isActive ? C.gray10 : C.gray60 }}
                          >
                            {step}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-6">
                    <div className="h-1 overflow-hidden" style={{ background: C.gray80 }}>
                      <motion.div
                        className="h-full"
                        style={{ background: C.blue60 }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-[11px]" style={{ color: C.gray50 }}>
                        Step {scanStep + 1} of {SCAN_STEPS.length}
                      </span>
                      <span className="text-[11px]" style={{ color: C.gray50 }}>
                        {finding.affected_components.length} component{finding.affected_components.length !== 1 ? 's' : ''} to check
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Passed / Failed result */}
              {(phase === 'passed' || phase === 'failed') && result && (
                <div className="px-5 py-5">
                  {/* Status banner */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-4 p-4 mb-5"
                    style={{
                      background: phase === 'passed' ? `${C.supportSuccess}10` : `${C.supportError}10`,
                      borderLeft: `3px solid ${phase === 'passed' ? C.supportSuccess : C.supportError}`,
                    }}
                  >
                    {phase === 'passed' ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.supportSuccess }} />
                    ) : (
                      <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.supportError }} />
                    )}
                    <div>
                      <span className="text-[14px] font-semibold block" style={{ color: phase === 'passed' ? C.supportSuccess : C.supportError }}>
                        {phase === 'passed'
                          ? 'Resolution Verified Successfully'
                          : 'Resolution Could Not Be Verified'}
                      </span>
                      <span className="text-[12px] block mt-1" style={{ color: C.gray40 }}>
                        {phase === 'passed'
                          ? 'The AI scan has confirmed that the fix has been properly applied. This finding has been marked as resolved.'
                          : 'The AI scan could not confirm that the reported fix has been applied. The finding remains open.'}
                      </span>
                    </div>
                  </motion.div>

                  {/* Confidence badge */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray50 }}>Confidence</span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase"
                      style={{ background: `${confidenceColor(result.confidence)}20`, color: confidenceColor(result.confidence) }}
                    >
                      {result.confidence}
                    </span>
                    <span className="text-[11px]" style={{ color: C.gray50 }}>
                      &middot; {result.components_checked} component{result.components_checked !== 1 ? 's' : ''} checked
                    </span>
                  </div>

                  {/* AI Summary */}
                  <div className="mb-5" style={{ borderBottom: `1px solid ${C.gray80}`, paddingBottom: 20 }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 flex items-center justify-center" style={{ background: C.purple60 }}>
                        <span className="text-[9px] font-bold text-white">AI</span>
                      </div>
                      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.purple40 }}>
                        Verification Summary
                      </span>
                    </div>
                    <p className="text-[13px] leading-[1.7]" style={{ color: C.gray30 }}>
                      {result.summary}
                    </p>
                  </div>

                  {/* Detailed findings */}
                  {result.details && result.details.length > 0 && (
                    <div className="mb-5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider block mb-3" style={{ color: C.gray50 }}>
                        Detailed Findings
                      </span>
                      <div className="space-y-0">
                        {result.details.map((detail, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-start gap-3 py-2.5"
                            style={{ borderBottom: i < result.details.length - 1 ? `1px solid ${C.gray80}40` : undefined }}
                          >
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: phase === 'passed' ? C.supportSuccess : C.supportError }} />
                            <span className="text-[13px] leading-relaxed" style={{ color: C.gray30 }}>{detail}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error state */}
              {phase === 'error' && (
                <div className="px-5 py-6">
                  <div
                    className="flex items-start gap-4 p-4"
                    style={{ background: `${C.supportWarning}10`, borderLeft: `3px solid ${C.supportWarning}` }}
                  >
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: C.supportWarning }} />
                    <div>
                      <span className="text-[14px] font-semibold block" style={{ color: C.supportWarning }}>
                        Verification Error
                      </span>
                      <span className="text-[12px] block mt-1" style={{ color: C.gray40 }}>
                        {errorMsg || 'An unexpected error occurred during verification.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            {phase !== 'scanning' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-shrink-0 px-5 py-4 flex items-center gap-3"
                style={{ borderTop: `1px solid ${C.gray80}`, background: C.gray100 }}
              >
                {phase === 'passed' && (
                  <button
                    onClick={onClose}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-colors"
                    style={{ background: C.supportSuccess, color: '#FFFFFF' }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </button>
                )}

                {(phase === 'failed' || phase === 'error') && (
                  <>
                    <button
                      onClick={() => runVerification()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-all"
                      style={{ background: C.blue60, color: '#FFFFFF' }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
                      onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Rescan
                    </button>
                    <button
                      onClick={() => {
                        /* Trigger approval flow — backend logic TBD */
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-all"
                      style={{ border: `1px solid ${C.gray70}`, background: 'transparent', color: C.gray20 }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.gray80}50`)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <UserCheck className="w-4 h-4" />
                      Trigger Approval Flow
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* Approval flow hint (shown only on failure) */}
            {phase === 'failed' && (
              <div className="flex-shrink-0 px-5 py-3" style={{ background: C.gray100, borderTop: `1px solid ${C.gray80}40` }}>
                <div className="flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: C.gray50 }} />
                  <span className="text-[11px] leading-relaxed" style={{ color: C.gray50 }}>
                    <strong style={{ color: C.gray40 }}>Trigger Approval Flow</strong> will route this finding to your
                    reporting manager or senior for manual verification and sign-off when AI verification is inconclusive.
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
