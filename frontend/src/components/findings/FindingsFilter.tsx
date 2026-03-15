import { Search } from 'lucide-react';

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
  const selectClass = 'bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-gray-300 px-2.5 py-1.5 focus:outline-none focus:border-accent/50 transition-colors';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search findings..."
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-gray-300 pl-8 pr-3 py-1.5 w-52 focus:outline-none focus:border-accent/50 placeholder:text-gray-600 transition-colors"
        />
      </div>
      <select value={severity} onChange={e => onSeverityChange(e.target.value)} className={selectClass}>
        <option value="">All Severities</option>
        <option>Critical</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
        <option>Info</option>
      </select>
      <select value={category} onChange={e => onCategoryChange(e.target.value)} className={selectClass}>
        <option value="">All Categories</option>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
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
