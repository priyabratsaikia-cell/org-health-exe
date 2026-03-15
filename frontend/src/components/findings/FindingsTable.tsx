import { useState, useMemo, useEffect, Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Finding } from '@/api/types';
import SeverityBadge from '../ui/SeverityBadge';
import EffortTag from '../ui/EffortTag';
import FindingDetail from './FindingDetail';
import FindingsFilter from './FindingsFilter';

interface Props {
  findings: Finding[];
  onResolve: (f: Finding) => void;
  initialSeverityFilter?: string;
  initialCategoryFilter?: string;
}

const PER_PAGE = 10;

export default function FindingsTable({ findings, onResolve, initialSeverityFilter = '', initialCategoryFilter = '' }: Props) {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState(initialSeverityFilter);
  const [category, setCategory] = useState(initialCategoryFilter);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { setSeverity(initialSeverityFilter); setPage(1); }, [initialSeverityFilter]);
  useEffect(() => { setCategory(initialCategoryFilter); setPage(1); }, [initialCategoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(findings.map(f => f.category).filter(Boolean));
    return [...set].sort();
  }, [findings]);

  const filtered = useMemo(() => {
    let list = [...findings];
    if (severity) list = list.filter(f => f.severity === severity);
    if (category) list = list.filter(f => f.category === category);
    if (unresolvedOnly) list = list.filter(f => !f.is_resolved);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.title?.toLowerCase().includes(q) ||
        f.category?.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.affected_components?.some(c => c.toLowerCase().includes(q))
      );
    }
    return list;
  }, [findings, severity, category, unresolvedOnly, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-lg font-bold text-gray-200">Detailed Findings</h3>
        <FindingsFilter
          search={search} onSearchChange={v => { setSearch(v); setPage(1); }}
          severity={severity} onSeverityChange={v => { setSeverity(v); setPage(1); }}
          category={category} onCategoryChange={v => { setCategory(v); setPage(1); }}
          unresolvedOnly={unresolvedOnly} onUnresolvedChange={v => { setUnresolvedOnly(v); setPage(1); }}
          categories={categories}
        />
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['#', 'Finding', 'Severity', 'Category', 'Effort', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white/[0.02]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">No findings match your filter.</td>
              </tr>
            ) : (
              pageItems.map(f => (
                <Fragment key={f.id}>
                  <tr
                    className={`border-b border-white/[0.04] cursor-pointer transition-colors hover:bg-white/[0.02] ${f.is_resolved ? 'opacity-50' : ''}`}
                    onClick={() => setOpenId(openId === f.id ? null : f.id)}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-500">FND-{String(f.id).padStart(4, '0')}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-200">{f.title}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{f.category}</td>
                    <td className="px-4 py-3">{f.effort ? <EffortTag effort={f.effort} /> : <span className="text-gray-600">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full ${f.is_resolved ? 'bg-emerald-500 w-full' : 'bg-yellow-500 w-2/5'}`} />
                        </div>
                        <span className={`text-[11px] font-medium ${f.is_resolved ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {f.is_resolved ? 'Resolved' : 'Open'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openId === f.id ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  <FindingDetail finding={f} open={openId === f.id} onResolve={onResolve} />
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>Showing {(currentPage - 1) * PER_PAGE + 1} to {Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded border border-white/[0.08] bg-white/[0.02] hover:border-accent/40 disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  p === currentPage
                    ? 'accent-gradient text-white border-accent'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-accent/40'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded border border-white/[0.08] bg-white/[0.02] hover:border-accent/40 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
