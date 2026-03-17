import { Search } from 'lucide-react';
import { useColors } from '@/context/AppContext';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  severity: string;
  onSeverityChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  unresolvedOnly: boolean;
  onUnresolvedChange: (v: boolean) => void;
  categories: string[];
}

export default function FindingsFilter({
  search, onSearchChange,
  severity, onSeverityChange,
  category, onCategoryChange,
  unresolvedOnly, onUnresolvedChange,
  categories,
}: Props) {
  const C = useColors();
  const selectStyle: React.CSSProperties = {
    background: C.gray90,
    border: `1px solid ${C.gray80}`,
    color: C.gray30,
    borderRadius: 8,
    fontSize: 12,
    padding: '6px 10px',
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: C.gray50 }} />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search findings..."
          className="rounded-lg text-xs pl-8 pr-3 py-1.5 w-52 focus:outline-none transition-colors"
          style={{ background: C.gray90, border: `1px solid ${C.gray80}`, color: C.gray30 }}
        />
      </div>
      <select value={severity} onChange={e => onSeverityChange(e.target.value)} style={selectStyle} className="focus:outline-none">
        <option value="">All Severities</option>
        <option>Critical</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
        <option>Info</option>
      </select>
      <select value={category} onChange={e => onCategoryChange(e.target.value)} style={selectStyle} className="focus:outline-none">
        <option value="">All Categories</option>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: C.gray40 }}>
        <input
          type="checkbox"
          checked={unresolvedOnly}
          onChange={e => onUnresolvedChange(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-accent"
        />
        <span>Unresolved only</span>
      </label>
    </div>
  );
}
