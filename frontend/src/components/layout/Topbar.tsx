import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, ChevronDown, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/scans': 'Scans & Reports',
  '/scans/new': 'Run Health Scan',
  '/settings': 'Settings',
};

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
};

export default function Topbar() {
  const location = useLocation();
  const { state, dispatch } = useApp();
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isScanDetail = location.pathname.startsWith('/scans/') && location.pathname !== '/scans/new';
  const title = isScanDetail ? 'Org Health Report' : (titles[location.pathname] || 'Org Health Agent');
  const modelLabel = state.settings
    ? (state.settings.api_key_set ? (MODEL_LABELS[state.settings.model] || state.settings.model) : 'No API Key')
    : '...';
  const connected = state.orgs.length > 0;
  const orgLabel = state.selectedOrg
    ? (state.selectedOrg.alias || state.selectedOrg.username)
    : 'Not connected';

  return (
    <header className="h-14 min-h-[56px] flex items-center justify-between px-6 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06] z-40">
      <h2 className="text-[15px] font-bold text-gray-100 tracking-tight">{title}</h2>
      <div className="flex gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-gray-400">
          <Bot className="w-3.5 h-3.5 text-accent" />
          <span>{modelLabel}</span>
        </span>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => connected && setOrgDropdownOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:bg-white/[0.07] transition-colors cursor-pointer"
          >
            <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="max-w-[160px] truncate">{orgLabel}</span>
            {connected && state.orgs.length > 1 && (
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${orgDropdownOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          {orgDropdownOpen && state.orgs.length > 0 && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg bg-elevated border border-white/[0.08] shadow-xl py-1 z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Switch Org
              </div>
              {state.orgs.map(org => {
                const isSelected = state.selectedOrg?.username === org.username;
                return (
                  <button
                    key={org.id}
                    onClick={() => {
                      dispatch({ type: 'SET_SELECTED_ORG', payload: org });
                      setOrgDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.04] transition-colors ${isSelected ? 'bg-accent/[0.06]' : ''}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-gray-200 truncate">{org.alias}</div>
                      {org.username && (
                        <div className="text-[10px] text-gray-500 truncate">{org.username}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
