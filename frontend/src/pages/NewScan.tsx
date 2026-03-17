import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Database, Activity, Bot, FileText, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Loader2, Server, Globe, Shield, Clock, Terminal,
  AlertTriangle, ExternalLink, X
} from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useApp } from '@/context/AppContext';
import { api } from '@/api/client';
import { getColors } from '@/utils/colors';
import { timeAgo } from '@/utils/formatters';
import type { WsMessage, Scan } from '@/api/types';

interface LogEntry {
  time: string;
  text: string;
  level: 'info' | 'success' | 'error';
}

const STEPS = [
  { icon: Database, label: 'Collect Metadata', desc: 'Gathering org configuration and component data' },
  { icon: Activity, label: 'Runtime Data', desc: 'Analyzing runtime performance metrics' },
  { icon: Bot, label: 'AI Analysis', desc: 'AI engine evaluating health patterns' },
  { icon: FileText, label: 'Generate Report', desc: 'Compiling findings and recommendations' },
];

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

export default function NewScan() {
  const { state, dispatch, toast } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatus, setStepStatus] = useState<('pending' | 'active' | 'done' | 'error')[]>(['pending', 'pending', 'pending', 'pending']);
  const [percent, setPercent] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scanComplete, setScanComplete] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState('');
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [runningScans, setRunningScans] = useState<Scan[]>([]);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [checkingPackage, setCheckingPackage] = useState(false);
  const limitsPackageRef = useRef<boolean>(false);
  const logRef = useRef<HTMLDivElement>(null);
  const orgPickerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const ws = useWebSocket();

  useEffect(() => {
    if (state.selectedOrg && !selectedAlias) {
      setSelectedAlias(state.selectedOrg.alias);
    }
  }, [state.selectedOrg, selectedAlias]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const d = await api.getRunningScans();
        if (active) setRunningScans(d.scans);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (orgPickerRef.current && !orgPickerRef.current.contains(e.target as Node)) {
        setOrgPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addLog = useCallback((text: string, level: LogEntry['level'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, text, level }]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'started':
        addLog('Health scan started', 'info');
        setStepStatus(['active', 'pending', 'pending', 'pending']);
        setCurrentStep(1);
        break;
      case 'progress': {
        const { step, percent: pct, message } = msg;
        if (step) {
          setCurrentStep(step);
          setStepStatus(prev => prev.map((s, i) => {
            if (i + 1 < step) return 'done';
            if (i + 1 === step) return 'active';
            return 'pending';
          }));
        }
        setPercent(pct);
        addLog(message, 'info');
        break;
      }
      case 'complete':
        setStepStatus(['done', 'done', 'done', 'done']);
        setPercent(100);
        addLog('Health scan complete!', 'success');
        setScanComplete(true);
        toast('Org health scan complete!', 'success');
        setTimeout(() => navigate(`/scans/${msg.scan_id}`), 1500);
        break;
      case 'error':
        addLog(msg.message, 'error');
        toast(msg.message, 'error');
        setStepStatus(prev => prev.map((s, i) => i + 1 === currentStep ? 'error' : s));
        setRunning(false);
        break;
    }
  }, [addLog, currentStep, navigate, toast]);

  const launchScan = useCallback(async (hasLimitsPackage: boolean) => {
    setRunning(true);
    setScanComplete(false);
    setPercent(0);
    setLogs([]);
    setStepStatus(['pending', 'pending', 'pending', 'pending']);
    setCurrentStep(0);
    addLog(`Connecting to health scan engine for ${selectedAlias}...`, 'info');
    try {
      await ws.connect(handleMessage);
      ws.send({ action: 'run_scan', org_alias: selectedAlias, has_limits_package: hasLimitsPackage });
    } catch (e: any) {
      toast('Failed: ' + e.message, 'error');
      setRunning(false);
    }
  }, [selectedAlias, addLog, ws, handleMessage, toast]);

  const startScan = async () => {
    if (!selectedAlias) {
      toast('Select an org to scan', 'error');
      return;
    }
    setCheckingPackage(true);
    try {
      const result = await api.checkLimitsPackage(selectedAlias);
      limitsPackageRef.current = result.installed;
      if (!result.installed) {
        setShowLimitsModal(true);
        return;
      }
      await launchScan(true);
    } catch {
      limitsPackageRef.current = false;
      setShowLimitsModal(true);
    } finally {
      setCheckingPackage(false);
    }
  };

  const handleProceedWithoutPackage = async () => {
    setShowLimitsModal(false);
    await launchScan(false);
  };

  const selectedOrg = state.orgs.find(o => o.alias === selectedAlias);

  return (
    <PageTransition>
      <div>
        {/* Running Scans Banner */}
        <AnimatePresence>
          {runningScans.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 py-3 flex items-center gap-3" style={{ background: `${C.supportInfo}15`, borderBottom: `1px solid ${C.supportInfo}40` }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.supportInfo }} />
                <span className="text-[13px] font-normal" style={{ color: C.blue40 }}>
                  {runningScans.length} scan{runningScans.length > 1 ? 's' : ''} currently running
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  {runningScans.map(s => (
                    <CarbonTag key={s.id} text={s.org_alias} color={C.supportInfo} type="outline" />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {/* Left Panel - Configuration */}
          <div className="lg:col-span-2" style={{ borderRight: `1px solid ${C.gray80}` }}>
            {/* Org Selection Section */}
            <div className="p-6" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-4 h-4" style={{ color: C.blue40 }} />
                <h3 className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Target Organization</h3>
              </div>

              {state.orgs.length === 0 ? (
                <div className="p-4" style={{ background: C.gray80, borderLeft: `3px solid ${C.supportWarning}` }}>
                  <p className="text-[13px]" style={{ color: C.gray30 }}>
                    No organizations connected. Go to{' '}
                    <button onClick={() => navigate('/settings')} className="underline" style={{ color: C.blue40 }}>Settings</button>{' '}
                    to connect a Salesforce org.
                  </p>
                </div>
              ) : (
                <>
                  <label className="block text-[12px] font-normal mb-2" style={{ color: C.gray50 }}>
                    Select organization
                  </label>
                  <div className="relative" ref={orgPickerRef}>
                    <button
                      onClick={() => !running && setOrgPickerOpen(prev => !prev)}
                      disabled={running}
                      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors disabled:opacity-50"
                      style={{
                        background: C.gray80,
                        borderBottom: `2px solid ${orgPickerOpen ? C.blue60 : C.gray70}`,
                        color: selectedOrg ? C.gray10 : C.gray50,
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedOrg ? (
                          <>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: C.supportSuccess }} />
                            <div className="min-w-0">
                              <span className="text-[14px] font-normal block" style={{ color: C.gray10 }}>
                                {selectedOrg.alias}
                              </span>
                              {selectedOrg.username && (
                                <span className="text-[12px] block truncate" style={{ color: C.gray50 }}>
                                  {selectedOrg.username}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-[14px]">Choose an organization...</span>
                        )}
                      </div>
                      <ChevronDown
                        className="w-4 h-4 flex-shrink-0 transition-transform"
                        style={{ color: C.gray50, transform: orgPickerOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                      />
                    </button>

                    <AnimatePresence>
                      {orgPickerOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 right-0 top-full z-50 max-h-[280px] overflow-y-auto"
                          style={{ background: C.gray80, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: `1px solid ${C.gray70}`, borderTop: 'none' }}
                        >
                          {state.orgs.map(org => {
                            const isSelected = selectedAlias === org.alias;
                            return (
                              <button
                                key={org.id}
                                onClick={() => {
                                  setSelectedAlias(org.alias);
                                  setOrgPickerOpen(false);
                                }}
                                className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                                style={{
                                  background: isSelected ? `${C.blue60}20` : 'transparent',
                                  borderBottom: `1px solid ${C.gray70}`,
                                }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget.style.background = C.gray70); }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
                              >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: org.is_active ? C.supportSuccess : C.gray60 }} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[14px] font-normal" style={{ color: C.gray10 }}>{org.alias}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {org.username && (
                                      <span className="text-[12px] truncate" style={{ color: C.gray50 }}>{org.username}</span>
                                    )}
                                    {org.is_sandbox && (
                                      <CarbonTag text="Sandbox" color={C.yellow30} />
                                    )}
                                  </div>
                                </div>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: C.blue40 }} />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>

            {/* Selected Org Details */}
            {selectedOrg && (
              <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                {[
                  { icon: Globe, label: 'Instance', value: selectedOrg.instance_url ? new URL(selectedOrg.instance_url).hostname : 'N/A' },
                  { icon: Shield, label: 'Type', value: selectedOrg.is_sandbox ? 'Sandbox' : 'Production' },
                  { icon: Server, label: 'Status', value: selectedOrg.is_active ? 'Active' : 'Inactive' },
                  { icon: Clock, label: 'Connected', value: selectedOrg.connected_at ? timeAgo(selectedOrg.connected_at) : 'N/A' },
                ].map((detail, i) => (
                  <div
                    key={detail.label}
                    className="px-5 py-4"
                    style={{
                      background: C.gray90,
                      borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined,
                      borderBottom: `1px solid ${C.gray80}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <detail.icon className="w-3 h-3" style={{ color: C.gray50 }} />
                      <span className="text-[11px] font-normal uppercase tracking-wider" style={{ color: C.gray50 }}>{detail.label}</span>
                    </div>
                    <span className="text-[13px] font-normal" style={{ color: C.gray10 }}>{detail.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Start Scan Action */}
            <div className="p-6" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
              <div className="flex items-center gap-4">
                <button
                  onClick={startScan}
                  disabled={running || checkingPackage || !selectedAlias}
                  className="flex items-center gap-2 px-5 py-3 text-[14px] font-normal transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: running || checkingPackage ? C.gray70 : C.blue60, color: C.white }}
                  onMouseEnter={e => { if (!running && !checkingPackage && selectedAlias) e.currentTarget.style.background = C.blue60h; }}
                  onMouseLeave={e => { if (!running && !checkingPackage && selectedAlias) e.currentTarget.style.background = C.blue60; }}
                >
                  {running || checkingPackage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {checkingPackage ? 'Checking org...' : running ? 'Scan in progress...' : 'Start health scan'}
                </button>

                {running && !scanComplete && (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 h-1" style={{ background: C.gray80 }}>
                      <motion.div
                        className="h-full"
                        style={{ background: C.blue60 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-[14px] font-semibold min-w-[44px] text-right" style={{ color: C.blue40 }}>{percent}%</span>
                  </div>
                )}

                {scanComplete && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" style={{ color: C.supportSuccess }} />
                    <span className="text-[13px]" style={{ color: C.supportSuccess }}>Scan completed successfully</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pipeline Steps */}
            <AnimatePresence>
              {(running || logs.length > 0) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <div className="px-6 py-3 flex items-center gap-2" style={{ background: C.gray80 }}>
                      <Terminal className="w-3.5 h-3.5" style={{ color: C.gray30 }} />
                      <span className="text-[13px] font-semibold" style={{ color: C.gray10 }}>Scan Pipeline</span>
                    </div>

                    <div className="grid grid-cols-4">
                      {STEPS.map((step, i) => {
                        const status = stepStatus[i];
                        const Icon = step.icon;
                        const isDone = status === 'done';
                        const isActive = status === 'active';
                        const isError = status === 'error';
                        const borderColor = isDone ? C.supportSuccess : isActive ? C.blue60 : isError ? C.supportError : C.gray80;
                        return (
                          <div
                            key={i}
                            className="px-4 py-4"
                            style={{
                              borderTop: `3px solid ${borderColor}`,
                              borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined,
                              background: isActive ? `${C.blue60}08` : 'transparent',
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              {isDone ? (
                                <CheckCircle className="w-4 h-4" style={{ color: C.supportSuccess }} />
                              ) : isError ? (
                                <XCircle className="w-4 h-4" style={{ color: C.supportError }} />
                              ) : isActive ? (
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.blue40 }} />
                              ) : (
                                <Icon className="w-4 h-4" style={{ color: C.gray60 }} />
                              )}
                              <span className="text-[13px] font-semibold" style={{
                                color: isDone ? C.supportSuccess : isActive ? C.gray10 : isError ? C.supportError : C.gray50
                              }}>
                                {step.label}
                              </span>
                            </div>
                            <p className="text-[11px]" style={{ color: C.gray50 }}>{step.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Panel - Log Output */}
          <div className="lg:col-span-1 flex flex-col" style={{ background: C.gray100 }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}` }}>
              <div className="w-2 h-2 rounded-full" style={{ background: running ? C.supportSuccess : logs.length > 0 ? C.gray50 : C.gray60 }} />
              <span className="text-[13px] font-semibold" style={{ color: C.gray10 }}>Output Console</span>
              {logs.length > 0 && (
                <span className="ml-auto text-[11px]" style={{ color: C.gray50 }}>{logs.length} entries</span>
              )}
            </div>
            <div
              ref={logRef}
              className="flex-1 p-4 overflow-y-auto font-mono text-[12px] leading-relaxed min-h-[320px] max-h-[520px]"
              style={{ background: C.gray100 }}
            >
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: C.gray60 }}>
                  <Terminal className="w-8 h-8" />
                  <span className="text-[12px]">Waiting for scan to start...</span>
                </div>
              ) : (
                logs.map((log, i) => {
                  const color = log.level === 'success' ? C.supportSuccess : log.level === 'error' ? C.supportError : C.gray40;
                  return (
                    <div key={i} className="py-0.5 flex gap-2">
                      <span style={{ color: C.gray60 }}>[{log.time}]</span>
                      <span style={{ color }}>{log.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Model Info Bar */}
        {state.settings && (
          <div className="px-6 py-2.5 flex items-center gap-4" style={{ background: C.gray80, borderTop: `1px solid ${C.gray70}` }}>
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" style={{ color: C.purple40 }} />
              <span className="text-[12px]" style={{ color: C.gray50 }}>AI Model:</span>
              <span className="text-[12px] font-normal" style={{ color: C.purple40 }}>{state.settings.model}</span>
            </div>
            <div className="w-px h-3" style={{ background: C.gray70 }} />
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" style={{ color: C.gray50 }} />
              <span className="text-[12px]" style={{ color: C.gray50 }}>
                API Key: {state.settings.api_key_set ? 'Configured' : 'Not set'}
              </span>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="ml-auto flex items-center gap-1 text-[12px] transition-colors"
              style={{ color: C.blue40 }}
              onMouseEnter={e => (e.currentTarget.style.color = C.blue20)}
              onMouseLeave={e => (e.currentTarget.style.color = C.blue40)}
            >
              Configure <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Limits Package Not Installed Modal */}
      <AnimatePresence>
        {showLimitsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={() => setShowLimitsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg mx-4"
              style={{ background: C.gray90, border: `1px solid ${C.gray70}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center" style={{ background: `${C.supportWarning}20` }}>
                    <AlertTriangle className="w-4 h-4" style={{ color: C.supportWarning }} />
                  </div>
                  <h3 className="text-[16px] font-semibold" style={{ color: C.gray10 }}>
                    Limits Package Not Installed
                  </h3>
                </div>
                <button
                  onClick={() => setShowLimitsModal(false)}
                  className="p-1 transition-colors"
                  style={{ color: C.gray50 }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.gray10)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.gray50)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5">
                <p className="text-[14px] leading-relaxed" style={{ color: C.gray30 }}>
                  The Salesforce Limits Monitor package is not installed in this org.
                  Install it to capture comprehensive governor limit data and get periodic
                  reminders about your org's governor limit thresholds.
                </p>
                <p className="text-[13px] mt-3" style={{ color: C.gray50 }}>
                  You can still proceed with the scan. Standard governor limit data from the
                  Salesforce API will be used for the health analysis, but detailed limit
                  snapshots will not be available in the report.
                </p>
              </div>

              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ background: C.gray80, borderTop: `1px solid ${C.gray70}` }}
              >
                <a
                  href="https://www.pwc.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[13px] transition-colors"
                  style={{ color: C.blue40 }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.blue20)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.blue40)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Learn how to install
                </a>
                <button
                  onClick={handleProceedWithoutPackage}
                  className="flex items-center gap-2 px-4 py-2 text-[14px] font-normal transition-colors"
                  style={{ background: C.blue60, color: C.white }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
                >
                  Proceed without package
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
