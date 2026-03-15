import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, FileText } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import GlassCard from '@/components/ui/GlassCard';
import ScoreBadge from '@/components/ui/ScoreBadge';
import StatusPill from '@/components/ui/StatusPill';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import HealthGauge from '@/components/charts/HealthGauge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtDate, timeAgo } from '@/utils/formatters';
import type { Scan } from '@/api/types';

export default function Scans() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { state, toast } = useApp();

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

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this scan?')) return;
    setDeletingId(id);
    try {
      await api.deleteScan(id);
      toast('Scan deleted', 'info');
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-gray-200">All Scans</h3>
        <Button variant="accent" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/scans/new')}>
          New Scan
        </Button>
      </div>

      {scans.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="No scans found"
          description="Run your first health scan to get started."
          action={<Button variant="accent" onClick={() => navigate('/scans/new')} icon={<Plus className="w-4 h-4" />}>Run First Scan</Button>}
        />
      ) : (
        <div className="space-y-3">
          {scans.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassCard
                hover
                onClick={() => navigate(`/scans/${s.id}`)}
                className="p-4"
              >
                <div className="flex items-center gap-5">
                  <div className="flex-shrink-0">
                    <HealthGauge score={s.health_score || 0} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-200">{s.org_alias}</span>
                      <StatusPill status={s.status} />
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.org_username && <span>{s.org_username} · </span>}
                      {fmtDate(s.started_at)}
                      <span className="ml-2 text-gray-600">({timeAgo(s.started_at)})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-gray-200">{s.total_findings || 0}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Findings</div>
                    </div>
                    <button
                      onClick={e => handleDelete(s.id, e)}
                      disabled={deletingId === s.id}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
