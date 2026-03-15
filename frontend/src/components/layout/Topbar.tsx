import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, ChevronDown, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

const pages: Record<string, { title: string; desc: string }> = {
  '/': { title: 'Dashboard', desc: 'Monitor org health scores, findings, and scan history' },
  '/scans': { title: 'Scans & Reports', desc: 'View and manage all health scan results' },
  '/scans/new': { title: 'Run Health Scan', desc: 'Perform a comprehensive AI-powered health analysis' },
  '/settings': { title: 'Settings', desc: 'Manage AI configuration, connected Salesforce organizations, and health parameters' },
  '/compliance': { title: 'Compliance Corner', desc: 'Salesforce org compliance readiness scores and regulatory alignment' },
};

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
};

export default function Topbar() {
  const location = useLocation();
  const { state, dispatch } = useApp();
  const C = getColors(state.accentColor);
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
  const isDashboardVariant = location.pathname.startsWith('/dashboard/');

  let pageInfo: { title: string; desc: string };
  if (isScanDetail) {
    pageInfo = { title: 'Org Health Report', desc: 'Detailed scan results, findings, and recommendations' };
  } else if (isDashboardVariant) {
    pageInfo = pages['/'];
  } else {
    pageInfo = pages[location.pathname] || { title: 'Org Health Agent', desc: '' };
  }

  const modelLabel = state.settings
    ? (state.settings.api_key_set ? (MODEL_LABELS[state.settings.model] || state.settings.model) : 'No API Key')
    : '...';
  const connected = state.orgs.length > 0;
  const orgLabel = state.selectedOrg
    ? (state.selectedOrg.alias || state.selectedOrg.username)
    : 'Not connected';

  return (
    <header
      className="flex items-center justify-between px-6 z-40"
      style={{
        minHeight: 72,
        background: C.gray100,
        borderBottom: `1px solid ${C.gray80}`,
      }}
    >
      {/* Left: Title + Description */}
      <div className="py-3">
        <h2
          className="text-[18px] font-semibold tracking-tight leading-tight"
          style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          {pageInfo.title}
        </h2>
        {pageInfo.desc && (
          <p className="text-[12px] mt-0.5" style={{ color: C.gray50 }}>{pageInfo.desc}</p>
        )}
      </div>

      {/* Right: Status Indicators */}
      <div className="flex items-center gap-3">
        {/* Model Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[12px]"
          style={{ background: C.gray90, border: `1px solid ${C.gray80}`, color: C.gray40 }}
        >
          <Bot className="w-3.5 h-3.5" style={{ color: C.purple40 }} />
          <span style={{ color: C.purple40 }}>{modelLabel}</span>
        </div>

        {/* Org Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => connected && setOrgDropdownOpen(prev => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors"
            style={{
              background: C.gray90,
              border: `1px solid ${C.gray80}`,
              color: C.gray30,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.gray80)}
            onMouseLeave={e => (e.currentTarget.style.background = C.gray90)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: connected ? C.supportSuccess : C.supportError }}
            />
            <span className="max-w-[160px] truncate" style={{ color: C.gray10 }}>{orgLabel}</span>
            {connected && state.orgs.length > 1 && (
              <ChevronDown
                className="w-3 h-3 transition-transform duration-200"
                style={{ color: C.gray50, transform: orgDropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}
              />
            )}
          </button>

          {orgDropdownOpen && state.orgs.length > 0 && (
            <div
              className="absolute right-0 top-full mt-1 w-64 z-50"
              style={{ background: C.gray80, border: `1px solid ${C.gray70}`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray50, borderBottom: `1px solid ${C.gray70}` }}>
                Switch Organization
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
                    className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
                    style={{
                      background: isSelected ? `${C.blue60}20` : 'transparent',
                      borderBottom: `1px solid ${C.gray70}`,
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray70; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${C.blue60}20` : 'transparent'; }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: C.supportSuccess }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px]" style={{ color: C.gray10 }}>{org.alias}</div>
                      {org.username && (
                        <div className="text-[11px] truncate" style={{ color: C.gray50 }}>{org.username}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: C.blue40 }} />}
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
