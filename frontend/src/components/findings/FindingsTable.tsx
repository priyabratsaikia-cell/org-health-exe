import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Finding } from '@/api/types';
import SeverityBadge from '../ui/SeverityBadge';
import EffortTag from '../ui/EffortTag';
import FindingDetail from './FindingDetail';
import FindingsFilter from './FindingsFilter';
import { useColors } from '@/context/AppContext';

interface Props {
  findings: Finding[];
  onResolve: (f: Finding) => void;
  initialSeverityFilter?: string;
  initialCategoryFilter?: string;
  initialOpenFindingId?: number;
  scanId?: number;
}

const PER_PAGE = 10;

export default function FindingsTable({ findings, onResolve, initialSeverityFilter = '', initialCategoryFilter = '', initialOpenFindingId, scanId }: Props) {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState(initialSeverityFilter);
  const [category, setCategory] = useState(initialCategoryFilter);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(initialOpenFindingId ?? null);
  const scrollRef = useRef<HTMLTableRowElement>(null);
  const C = useColors();

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

  useEffect(() => {
    if (initialOpenFindingId == null) return;
    const idx = filtered.findIndex(f => f.id === initialOpenFindingId);
    if (idx >= 0) {
      setPage(Math.floor(idx / PER_PAGE) + 1);
      setOpenId(initialOpenFindingId);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [initialOpenFindingId, filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-lg font-bold" style={{ color: C.gray20 }}>Detailed Findings</h3>
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
            <tr style={{ borderBottom: `1px solid ${C.gray80}` }}>
              {['#', 'Finding', 'Severity', 'Category', 'Effort', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.gray50, background: C.gray90 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: C.gray50 }}>No findings match your filter.</td>
              </tr>
            ) : (
              pageItems.map(f => (
                <Fragment key={f.id}>
                  <tr
                    ref={f.id === initialOpenFindingId ? scrollRef : undefined}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: `1px solid ${C.gray80}40`, opacity: f.is_resolved ? 0.5 : 1 }}
                    onClick={() => setOpenId(openId === f.id ? null : f.id)}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.gray80}30`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-mono text-[11px]" style={{ color: C.gray50 }}>FND-{String(f.id).padStart(4, '0')}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: C.gray10 }}>{f.title}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.gray40 }}>{f.category}</td>
                    <td className="px-4 py-3">{f.effort ? <EffortTag effort={f.effort} /> : <span style={{ color: C.gray60 }}>—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: C.gray80 }}>
                          <div className={`h-full rounded-full ${f.is_resolved ? 'bg-emerald-500 w-full' : 'bg-yellow-500 w-2/5'}`} />
                        </div>
                        <span className={`text-[11px] font-medium ${f.is_resolved ? 'text-emerald-400' : ''}`} style={f.is_resolved ? {} : { color: C.gray50 }}>
                          {f.is_resolved ? 'Resolved' : 'Open'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronDown className={`w-4 h-4 transition-transform ${openId === f.id ? 'rotate-180' : ''}`} style={{ color: C.gray50 }} />
                    </td>
                  </tr>
                  <FindingDetail finding={f} open={openId === f.id} onResolve={onResolve} scanId={scanId} />
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: C.gray50 }}>
          <span>Showing {(currentPage - 1) * PER_PAGE + 1} to {Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${C.gray80}`, background: C.gray90 }}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2.5 py-1 rounded transition-colors ${p === currentPage ? 'accent-gradient text-white' : ''}`}
                style={p === currentPage
                  ? { border: `1px solid ${C.blue60}` }
                  : { border: `1px solid ${C.gray80}`, background: C.gray90 }
                }
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${C.gray80}`, background: C.gray90 }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
