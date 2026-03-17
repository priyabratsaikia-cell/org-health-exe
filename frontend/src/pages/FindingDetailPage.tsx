import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, AlertTriangle, Clock, CheckCircle2,
  ChevronRight, Tag, Layers, Wrench, Activity, CircleDot,
  FileWarning, Undo2, ExternalLink, FileCode, Box,
  Database, Zap, Settings, Globe, Lock, Code2,
} from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';
import { fmtDate, formatRemediation } from '@/utils/formatters';
import type { Scan, Finding } from '@/api/types';

const SEV_META: Record<string, { color: string; bg: string; icon: typeof AlertTriangle; label: string; description: string; order: number }> = {
  Critical: { color: '#FA4D56', bg: '#FA4D5615', icon: FileWarning, label: 'Critical', description: 'Requires immediate attention. This finding represents a significant risk to your Salesforce org.', order: 5 },
  High:     { color: '#FF832B', bg: '#FF832B15', icon: AlertTriangle, label: 'High', description: 'Should be addressed promptly. This finding could lead to performance or security issues.', order: 4 },
  Medium:   { color: '#F1C21B', bg: '#F1C21B15', icon: Shield, label: 'Medium', description: 'Plan to address in the near term. This finding represents a moderate concern.', order: 3 },
  Low:      { color: '#42BE65', bg: '#42BE6515', icon: CircleDot, label: 'Low', description: 'Address when convenient. This finding is a minor improvement opportunity.', order: 2 },
  Info:     { color: '#4589FF', bg: '#4589FF15', icon: CircleDot, label: 'Informational', description: 'For your awareness. No action is strictly required.', order: 1 },
};

const COMP_TYPE_ICONS: Record<string, typeof FileCode> = {
  ApexClass: Code2, ApexTrigger: Zap, VisualforcePage: Globe, LightningComponent: Box,
  FlowDefinition: Activity, CustomObject: Database, Profile: Lock, PermissionSet: Lock,
  CustomField: Settings, ValidationRule: Shield, WorkflowRule: Activity, ApexPage: Globe,
};

function inferComponentType(name: string): { type: string; icon: typeof FileCode } {
  const lower = name.toLowerCase();
  if (lower.endsWith('.cls') || lower.includes('class') || lower.includes('controller') || lower.includes('handler') || lower.includes('service') || lower.includes('helper'))
    return { type: 'Apex Class', icon: Code2 };
  if (lower.endsWith('.trigger') || lower.includes('trigger'))
    return { type: 'Apex Trigger', icon: Zap };
  if (lower.endsWith('.page') || lower.includes('visualforce'))
    return { type: 'Visualforce Page', icon: Globe };
  if (lower.includes('lwc') || lower.includes('lightning') || lower.includes('component') || lower.includes('cmp'))
    return { type: 'Lightning Component', icon: Box };
  if (lower.includes('flow'))
    return { type: 'Flow', icon: Activity };
  if (lower.includes('object') || lower.endsWith('__c'))
    return { type: 'Custom Object', icon: Database };
  if (lower.includes('profile'))
    return { type: 'Profile', icon: Lock };
  if (lower.includes('permission'))
    return { type: 'Permission Set', icon: Lock };
  if (lower.includes('field'))
    return { type: 'Custom Field', icon: Settings };
  if (lower.includes('validation'))
    return { type: 'Validation Rule', icon: Shield };
  if (lower.includes('workflow'))
    return { type: 'Workflow Rule', icon: Activity };
  return { type: 'Metadata', icon: FileCode };
}

function CarbonTile({ children, className = '', style, C }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; C: ReturnType<typeof getColors> }) {
  return (
    <div className={className} style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}`, ...style }}>
      {children}
    </div>
  );
}

export default function FindingDetailPage() {
  const { scanId, findingId } = useParams<{ scanId: string; findingId: string }>();
  const navigate = useNavigate();
  const { state, toast } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);

  const [scan, setScan] = useState<Scan | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      const s = await api.getScan(Number(scanId));
      setScan(s);
      const f = s.findings?.find(f => f.id === Number(findingId));
      if (f) setFinding(f);
    } catch (e: any) {
      toast('Failed to load finding: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [scanId, findingId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async () => {
    if (!finding) return;
    setResolving(true);
    try {
      if (finding.is_resolved) {
        await api.unresolveFinding(finding.id);
        toast('Marked as unresolved', 'success');
      } else {
        await api.resolveFinding(finding.id);
        toast('Marked as resolved', 'success');
      }
      await load();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div>
          <div className="animate-pulse" style={{ background: C.gray90, height: 56, borderBottom: `1px solid ${C.gray80}` }} />
          <div className="animate-pulse" style={{ background: C.gray90, height: 120, borderBottom: `1px solid ${C.gray80}` }} />
          <div className="grid grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse p-5" style={{ background: C.gray90, height: 80, borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined, borderBottom: `1px solid ${C.gray80}` }} />
            ))}
          </div>
          <div className="grid grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="animate-pulse p-5" style={{ background: C.gray90, height: 200, borderRight: i < 1 ? `1px solid ${C.gray80}` : undefined, borderBottom: `1px solid ${C.gray80}` }} />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!finding) {
    return (
      <PageTransition>
        <div className="px-6 pt-5 pb-4" style={{ background: C.gray100 }}>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => navigate(-1)} className="text-[12px] transition-colors" style={{ color: C.blue40 }}>Back</button>
            <span style={{ color: C.gray50 }}>/</span>
            <span className="text-[12px]" style={{ color: C.gray10 }}>Not Found</span>
          </div>
        </div>
        <div className="py-16 text-center text-[14px]" style={{ color: C.gray50 }}>Finding not found.</div>
      </PageTransition>
    );
  }

  const sev = SEV_META[finding.severity] || SEV_META.Info;
  const SevIcon = sev.icon;
  const steps = formatRemediation(finding.recommendation);
  const findingIndex = scan?.findings?.findIndex(f => f.id === finding.id) ?? -1;
  const totalFindings = scan?.findings?.length ?? 0;
  const prevFinding = findingIndex > 0 ? scan?.findings?.[findingIndex - 1] : null;
  const nextFinding = findingIndex >= 0 && findingIndex < totalFindings - 1 ? scan?.findings?.[findingIndex + 1] : null;

  const normalizeEffort = (e: string): string => {
    if (!e) return '—';
    const lower = e.toLowerCase();
    if (lower.includes('quick') || lower.includes('low') || lower.includes('easy') || lower.includes('minor'))
      return 'Low';
    if (lower.includes('large') || lower.includes('high') || lower.includes('significant') || lower.includes('major'))
      return 'High';
    return 'Medium';
  };

  const effortColor = (e: string) => {
    const norm = normalizeEffort(e);
    if (norm === 'Low') return C.supportSuccess;
    if (norm === 'High') return C.supportError;
    return C.supportWarning;
  };

  const componentsList = (finding.affected_components || []).map((comp, i) => {
    const { type, icon } = inferComponentType(comp);
    return { name: comp, type, icon, index: i };
  }).sort((a, b) => {
    const sevPriority: Record<string, number> = { 'Apex Trigger': 1, 'Apex Class': 2, 'Validation Rule': 3, 'Flow': 4, 'Lightning Component': 5, 'Custom Object': 6 };
    return (sevPriority[a.type] || 99) - (sevPriority[b.type] || 99);
  });

  return (
    <PageTransition>
      <div>
        {/* Breadcrumb header */}
        <div className="px-6 py-3 flex items-center justify-between" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: C.blue40 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span style={{ color: C.gray70 }}>|</span>
            <button
              onClick={() => navigate(`/scans/${scanId}`)}
              className="text-[13px] transition-colors hover:underline"
              style={{ color: C.blue40 }}
            >
              Scan Report
            </button>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: C.gray60 }} />
            <button
              onClick={() => navigate(`/scans/${scanId}?tab=findings`)}
              className="text-[13px] transition-colors hover:underline"
              style={{ color: C.blue40 }}
            >
              Findings
            </button>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: C.gray60 }} />
            <span className="text-[13px] font-mono" style={{ color: C.gray30 }}>FND-{String(finding.id).padStart(4, '0')}</span>
          </div>

          <div className="flex items-center gap-2">
            {findingIndex >= 0 && (
              <span className="text-[12px] mr-2" style={{ color: C.gray50 }}>{findingIndex + 1} of {totalFindings}</span>
            )}
            <button
              onClick={() => prevFinding && navigate(`/scans/${scanId}/findings/${prevFinding.id}`)}
              disabled={!prevFinding}
              className="px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${C.gray80}`, background: C.gray90, color: C.gray30 }}
            >
              Prev
            </button>
            <button
              onClick={() => nextFinding && navigate(`/scans/${scanId}/findings/${nextFinding.id}`)}
              disabled={!nextFinding}
              className="px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${C.gray80}`, background: C.gray90, color: C.gray30 }}
            >
              Next
            </button>
          </div>
        </div>

        {/* Hero section */}
        <div className="relative" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: sev.color }} />
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wider"
                    style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}30` }}
                  >
                    <SevIcon className="w-3.5 h-3.5" />
                    {sev.label}
                  </span>
                  <span className="text-[12px] font-mono" style={{ color: C.gray50 }}>FND-{String(finding.id).padStart(4, '0')}</span>
                  <span className="text-[11px] px-2 py-0.5" style={{ background: finding.is_resolved ? '#42BE6520' : `${C.supportWarning}20`, color: finding.is_resolved ? '#42BE65' : C.supportWarning }}>
                    {finding.is_resolved ? 'RESOLVED' : 'OPEN'}
                  </span>
                </div>
                <h1 className="text-[24px] font-semibold tracking-tight leading-tight" style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}>
                  {finding.title}
                </h1>
                <p className="text-[13px] mt-2 max-w-3xl" style={{ color: C.gray50 }}>
                  {sev.description}
                </p>
              </div>

              <div className="flex-shrink-0 flex flex-col items-end gap-2">
                <button
                  onClick={handleResolve}
                  disabled={resolving}
                  className="flex items-center gap-2 px-5 py-2.5 text-[14px] font-medium transition-all disabled:opacity-50"
                  style={finding.is_resolved
                    ? { background: `${C.gray80}`, color: C.gray30, border: `1px solid ${C.gray70}` }
                    : { background: C.blue60, color: '#FFFFFF' }
                  }
                  onMouseEnter={e => {
                    if (!finding.is_resolved) e.currentTarget.style.background = C.blue60h;
                  }}
                  onMouseLeave={e => {
                    if (!finding.is_resolved) e.currentTarget.style.background = C.blue60;
                  }}
                >
                  {resolving ? (
                    <span className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                  ) : finding.is_resolved ? (
                    <Undo2 className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {resolving ? 'Processing...' : finding.is_resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
                </button>
                {finding.resolved_at && (
                  <span className="text-[11px]" style={{ color: C.gray50 }}>
                    Resolved {fmtDate(finding.resolved_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata strip — with severity bar embedded in Severity box */}
        <div className="grid grid-cols-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
          <div className="px-5 py-4" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: `${sev.color}15` }}>
                <AlertTriangle className="w-4 h-4" style={{ color: sev.color }} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: C.gray50 }}>Severity</span>
                <span className="text-[14px] font-semibold" style={{ color: sev.color }}>{finding.severity}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex gap-0.5 h-[6px]">
                {['Info', 'Low', 'Medium', 'High', 'Critical'].map((level) => {
                  const levelMeta = SEV_META[level];
                  const currentOrder = sev.order;
                  const thisOrder = levelMeta.order;
                  const isActive = thisOrder <= currentOrder;
                  return (
                    <div
                      key={level}
                      className="flex-1 transition-all"
                      style={{ background: isActive ? levelMeta.color : `${C.gray80}` }}
                      title={level}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: C.gray60 }}>Info</span>
                <span className="text-[9px]" style={{ color: C.gray60 }}>Critical</span>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-3" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: `${C.blue40}15` }}>
              <Tag className="w-4 h-4" style={{ color: C.blue40 }} />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: C.gray50 }}>Category</span>
              <span className="text-[14px] font-medium" style={{ color: C.gray20 }}>{finding.category || '—'}</span>
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-3" style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}>
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: `${effortColor(finding.effort)}15` }}>
              <Clock className="w-4 h-4" style={{ color: effortColor(finding.effort) }} />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: C.gray50 }}>Effort</span>
              <span className="text-[14px] font-medium" style={{ color: effortColor(finding.effort) }}>{normalizeEffort(finding.effort)}</span>
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-3" style={{ background: C.gray90 }}>
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: `${C.purple40}15` }}>
              <Layers className="w-4 h-4" style={{ color: C.purple40 }} />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: C.gray50 }}>Components</span>
              <span className="text-[14px] font-medium" style={{ color: C.gray20 }}>{finding.affected_components?.length || 0} affected</span>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="grid grid-cols-5">
          {/* Left column — Description & Components (3 cols) */}
          <div className="col-span-3" style={{ borderRight: `1px solid ${C.gray80}` }}>
            {/* Description section */}
            <CarbonTile C={C} className="p-0">
              <div className="flex items-center gap-2 px-5 py-3" style={{ background: C.gray80 }}>
                <Shield className="w-4 h-4" style={{ color: C.blue40 }} />
                <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Finding Description</span>
              </div>
              <div className="px-5 py-5">
                <p className="text-[14px] leading-[1.7]" style={{ color: C.gray30 }}>
                  {finding.description || 'No detailed description available for this finding.'}
                </p>
              </div>
            </CarbonTile>

            {/* Affected Components — ordered list */}
            {finding.affected_components && finding.affected_components.length > 0 && (
              <CarbonTile C={C} className="p-0">
                <div className="flex items-center justify-between px-5 py-3" style={{ background: C.gray80 }}>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4" style={{ color: C.purple40 }} />
                    <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Affected Components</span>
                  </div>
                  <span className="text-[12px] font-mono" style={{ color: C.gray50 }}>{componentsList.length} item{componentsList.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Table header */}
                <div
                  className="grid grid-cols-[36px_1fr_140px_100px] gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: C.gray50, borderBottom: `1px solid ${C.gray70}`, background: C.gray80 }}
                >
                  <span>#</span>
                  <span>Component Name</span>
                  <span>Type</span>
                  <span>Severity</span>
                </div>

                <div>
                  {componentsList.map((comp, i) => {
                    const CompIcon = comp.icon;
                    return (
                      <motion.div
                        key={comp.index}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="grid grid-cols-[36px_1fr_140px_100px] gap-2 items-center px-5 py-2.5 transition-colors"
                        style={{ borderBottom: `1px solid ${C.gray80}40` }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${C.gray80}30`)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="text-[11px] font-mono" style={{ color: C.gray60 }}>{i + 1}</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <CompIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.blue40 }} />
                          <span className="text-[13px] font-mono truncate" style={{ color: C.gray20 }} title={comp.name}>{comp.name}</span>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium w-fit"
                          style={{ background: `${C.purple40}12`, color: C.purple40, border: `1px solid ${C.purple40}20` }}
                        >
                          {comp.type}
                        </span>
                        <span
                          className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium w-fit"
                          style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}20` }}
                        >
                          {finding.severity}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </CarbonTile>
            )}
          </div>

          {/* Right column — Remediation Steps (2 cols) */}
          <div className="col-span-2">
            <CarbonTile C={C} className="p-0" style={{ borderBottom: 'none' }}>
              <div className="flex items-center gap-2 px-5 py-3" style={{ background: C.gray80 }}>
                <Wrench className="w-4 h-4" style={{ color: C.supportSuccess }} />
                <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Remediation Steps</span>
              </div>
              <div className="px-5 py-5">
                <div className="space-y-0">
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-4 py-4"
                      style={{ borderBottom: i < steps.length - 1 ? `1px solid ${C.gray80}40` : undefined }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5"
                        style={{ background: C.blue60, color: '#FFFFFF' }}
                      >
                        {i + 1}
                      </div>
                      <p className="text-[13px] leading-[1.7] flex-1" style={{ color: C.gray30 }}>
                        {step}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </CarbonTile>

            {/* Scan context */}
            {scan && (
              <CarbonTile C={C} className="p-0">
                <div className="flex items-center gap-2 px-5 py-3" style={{ background: C.gray80 }}>
                  <ExternalLink className="w-4 h-4" style={{ color: C.gray50 }} />
                  <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Scan Context</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {[
                    { label: 'Org', value: scan.org_alias },
                    { label: 'Scan Date', value: fmtDate(scan.started_at) },
                    { label: 'Health Score', value: `${scan.health_score}/100` },
                    { label: 'Total Findings', value: `${scan.total_findings}` },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.gray80}30` }}>
                      <span className="text-[12px] py-2" style={{ color: C.gray50 }}>{row.label}</span>
                      <span className="text-[13px] font-medium py-2" style={{ color: C.gray20 }}>{row.value}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => navigate(`/scans/${scanId}`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors mt-2"
                    style={{ border: `1px solid ${C.gray70}`, color: C.blue40, background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.blue40}10`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    View Full Scan Report
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CarbonTile>
            )}
          </div>
        </div>

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
