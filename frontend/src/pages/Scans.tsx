import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, FileText, ChevronRight, AlertTriangle, Loader2, Search, X } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';
import { fmtDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { Scan } from '@/api/types';

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

function scoreColor(s: number): string {
  if (s >= 75) return '#42BE65';
  if (s >= 50) return '#F1C21B';
  return '#FA4D56';
}

export default function Scans() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { state, toast } = useApp();
  const C = getColors(state.accentColor);

  const load = useCallback(async () => {
    try {
      const d = await api.getScans(state.selectedOrg?.alias);
      setScans(d.scans);
    } catch (e: any) {
      toast('Failed to load scans: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await api.deleteScan(id);
      toast('Scan deleted', 'info');
      setConfirmDeleteId(null);
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = searchQuery.trim()
    ? scans.filter(s =>
        s.org_alias?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.org_username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.status?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : scans;

  const completed = scans.filter(s => s.status === 'completed').length;
  const running = scans.filter(s => s.status === 'running').length;
  const failed = scans.filter(s => s.status === 'failed').length;

  if (loading) {
    return (
      <PageTransition>
        <div className="-m-6">
          <div className="animate-pulse" style={{ background: C.gray80, height: 48, borderBottom: `1px solid ${C.gray70}` }} />
          <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${C.gray80}` }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse p-5" style={{ background: C.gray90, height: 80, borderRight: i < 2 ? `1px solid ${C.gray80}` : undefined }} />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse" style={{ background: C.gray90, height: 64, borderBottom: `1px solid ${C.gray80}` }} />
          ))}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="-m-6">
        {/* Toolbar */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}` }}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: C.blue40 }} />
            <span className="text-[14px] font-semibold" style={{ color: C.gray10 }}>All Scans</span>
            <CarbonTag text={`${scans.length} total`} color={C.blue40} />
            <span className="w-px h-4 mx-1" style={{ background: C.gray70 }} />
            {[
              { label: 'Completed', value: completed, color: C.supportSuccess },
              { label: 'Running', value: running, color: C.supportInfo },
              { label: 'Failed', value: failed, color: C.supportError },
            ].map(kpi => (
              <span key={kpi.label} className="flex items-center gap-1.5 text-[12px]" style={{ color: C.gray40 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: kpi.value > 0 ? kpi.color : C.gray60 }} />
                {kpi.label}
                <span className="font-semibold" style={{ color: kpi.value > 0 ? kpi.color : C.gray50 }}>{kpi.value}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.gray50 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search scans..."
                className="pl-9 pr-3 py-2 text-[13px] w-56 focus:outline-none"
                style={{
                  background: C.gray90,
                  borderBottom: `2px solid ${searchQuery ? C.blue60 : C.gray70}`,
                  color: C.gray10,
                }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = C.blue60)}
                onBlur={e => { if (!searchQuery) e.currentTarget.style.borderBottomColor = C.gray70; }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: C.gray50 }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => navigate('/scans/new')}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-normal transition-colors"
              style={{ background: C.blue60, color: C.white }}
              onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
              onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
            >
              <Plus className="w-3.5 h-3.5" />
              New scan
            </button>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="px-6 py-20 text-center" style={{ background: C.gray90 }}>
            <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: C.gray60 }} />
            <p className="text-[16px] mb-1" style={{ color: C.gray30 }}>
              {scans.length === 0 ? 'No scans found' : 'No scans match your search'}
            </p>
            <p className="text-[13px] mb-5" style={{ color: C.gray50 }}>
              {scans.length === 0 ? 'Run your first health scan to get started.' : 'Try a different search term.'}
            </p>
            {scans.length === 0 && (
              <button
                onClick={() => navigate('/scans/new')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-[14px] font-normal transition-colors"
                style={{ background: C.blue60, color: C.white }}
                onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
                onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
              >
                <Plus className="w-4 h-4" />
                Run first scan
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div
              className="grid grid-cols-[1fr_80px_100px_90px_140px_48px] gap-2 px-5 py-2.5"
              style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}` }}
            >
              {['Organization', 'Score', 'Status', 'Findings', 'Date', ''].map(h => (
                <span key={h} className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.gray30 }}>{h}</span>
              ))}
            </div>

            {/* Table Rows */}
            {filtered.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
              >
                <div
                  className="grid grid-cols-[1fr_80px_100px_90px_140px_48px] gap-2 items-center px-5 py-3 cursor-pointer transition-colors"
                  style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}
                  onClick={() => navigate(`/scans/${s.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#353535')}
                  onMouseLeave={e => (e.currentTarget.style.background = C.gray90)}
                >
                  {/* Org */}
                  <div className="min-w-0">
                    <span className="text-[14px] font-normal block truncate" style={{ color: C.gray10 }}>{s.org_alias}</span>
                    <span className="text-[12px] block truncate" style={{ color: C.gray50 }}>
                      {s.org_username || '—'}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold" style={{ color: s.health_score ? scoreColor(s.health_score) : C.gray50 }}>
                      {s.health_score || '—'}
                    </span>
                    {s.health_score != null && s.health_score > 0 && (
                      <span className="text-[10px] font-semibold" style={{ color: scoreColor(s.health_score) }}>
                        {scoreGrade(s.health_score)}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <CarbonTag
                      text={s.status === 'completed' ? 'Completed' : s.status === 'running' ? 'Running' : 'Failed'}
                      color={s.status === 'completed' ? C.supportSuccess : s.status === 'running' ? C.supportInfo : C.supportError}
                      type="outline"
                    />
                  </div>

                  {/* Findings */}
                  <span className="text-[14px]" style={{ color: (s.total_findings || 0) > 0 ? C.gray10 : C.gray50 }}>
                    {s.total_findings || 0}
                  </span>

                  {/* Date */}
                  <div className="min-w-0">
                    <span className="text-[13px] block" style={{ color: C.gray30 }}>{fmtDate(s.started_at)}</span>
                    <span className="text-[11px]" style={{ color: C.gray50 }}>{timeAgo(s.started_at)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                      disabled={deletingId === s.id}
                      className="p-1.5 transition-colors disabled:opacity-30"
                      style={{ color: C.gray50 }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.red40; e.currentTarget.style.background = `${C.red60}15`; }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.gray50; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Confirm Delete */}
                <AnimatePresence>
                  {confirmDeleteId === s.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 py-3 flex items-center gap-3" style={{ background: `${C.supportError}10`, borderBottom: `1px solid ${C.red60}30` }}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: C.supportError }} />
                        <span className="text-[13px]" style={{ color: C.red40 }}>
                          Delete scan for <strong>{s.org_alias}</strong>? This action cannot be undone.
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="px-3 py-1.5 text-[13px] transition-colors"
                            style={{ color: C.gray30, border: `1px solid ${C.gray70}` }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                            className="px-3 py-1.5 text-[13px] transition-colors flex items-center gap-2"
                            style={{ background: C.red60, color: C.white }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#B81922')}
                            onMouseLeave={e => (e.currentTarget.style.background = C.red60)}
                          >
                            {deletingId === s.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
