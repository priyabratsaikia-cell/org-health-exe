import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, Hexagon, Sparkles, Leaf, Radio, ChevronDown, Apple, Circle, Landmark, BookOpen, Zap, Square, Sun, Eclipse, PlusCircle, Shield, HelpCircle, ExternalLink } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scans/new', icon: PlusCircle, label: 'New Scan' },
  { to: '/scans', icon: FileText, label: 'Scans & Reports' },
  { to: '/compliance', icon: Shield, label: 'Compliance Corner' },
];

const dashboardVariants = [
  { to: '/dashboard/neon', icon: Sparkles, label: 'Neon Pulse', color: '#00F0FF' },
  { to: '/dashboard/zen', icon: Leaf, label: 'Zen', color: '#6EE7B7' },
  { to: '/dashboard/command', icon: Radio, label: 'Command Center', color: '#22C55E' },
  { to: '/dashboard/apple', icon: Apple, label: 'Apple', color: '#F5F5F7' },
  { to: '/dashboard/google', icon: Circle, label: 'Google', color: '#A8C7FA' },
  { to: '/dashboard/ibm', icon: Landmark, label: 'IBM', color: '#78A9FF' },
  { to: '/dashboard/anthropic', icon: BookOpen, label: 'Anthropic', color: '#C17444' },
  { to: '/dashboard/openai', icon: Zap, label: 'OpenAI', color: '#10A37F' },
  { to: '/dashboard/microsoft', icon: Square, label: 'Microsoft', color: '#0078D4' },
  { to: '/dashboard/google-light', icon: Sun, label: 'Google Light', color: '#FBBC04' },
  { to: '/dashboard/aurora', icon: Eclipse, label: 'Aurora', color: '#2DD4BF' },
];

export default function Sidebar() {
  const { state } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  const location = useLocation();
  const connected = !!state.selectedOrg;
  const orgLabel = state.selectedOrg
    ? (state.selectedOrg.username || state.selectedOrg.alias)
    : 'No org connected';

  const isDashboardRoute = location.pathname === '/' || location.pathname.startsWith('/dashboard/');
  const [variantsOpen, setVariantsOpen] = useState(isDashboardRoute);

  return (
    <aside
      className="w-[248px] min-w-[248px] h-screen flex flex-col z-50"
      style={{ background: C.gray90, borderRight: `1px solid ${C.gray80}` }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5"
        style={{ minHeight: 72, borderBottom: `1px solid ${C.gray80}` }}
      >
        <div
          className="w-8 h-8 flex items-center justify-center"
          style={{ background: C.blue60 }}
        >
          <Hexagon className="w-4 h-4" style={{ color: C.white }} />
        </div>
        <span
          className="text-[14px] font-semibold"
          style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          Org Health Agent
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 flex flex-col overflow-y-auto">
        {mainNavItems.map(item => (
          <div key={item.to}>
            <div className="flex items-center">
              <NavLink
                to={item.to}
                end={item.to === '/' || item.to === '/scans'}
                className="flex-1"
              >
                {({ isActive }) => (
                  <div
                    className="flex items-center gap-3 px-5 py-2.5 text-[14px] font-normal transition-colors"
                    style={{
                      color: isActive ? C.gray10 : C.gray40,
                      background: isActive ? C.gray100 : 'transparent',
                      borderLeft: isActive ? `3px solid ${C.blue60}` : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.gray80; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? C.gray100 : 'transparent'; }}
                  >
                    <item.icon className="w-[16px] h-[16px] flex-shrink-0" style={{ color: isActive ? C.blue40 : C.gray50 }} />
                    <span>{item.label}</span>
                  </div>
                )}
              </NavLink>
              {item.to === '/' && (
                <button
                  onClick={() => setVariantsOpen(!variantsOpen)}
                  className="p-2 mr-2 transition-colors"
                  style={{ color: C.gray50 }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.gray10)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.gray50)}
                >
                  <ChevronDown
                    className="w-3.5 h-3.5 transition-transform duration-200"
                    style={{ transform: variantsOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                  />
                </button>
              )}
            </div>

            {item.to === '/' && variantsOpen && (
              <div style={{ borderLeft: `1px solid ${C.gray80}`, marginLeft: 28 }}>
                {dashboardVariants.map(variant => (
                  <NavLink
                    key={variant.to}
                    to={variant.to}
                  >
                    {({ isActive }) => (
                      <div
                        className="flex items-center gap-2.5 px-4 py-2 text-[12px] font-normal transition-colors"
                        style={{
                          color: isActive ? C.gray10 : C.gray50,
                          background: isActive ? `${C.blue60}15` : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.gray80; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${C.blue60}15` : 'transparent'; }}
                      >
                        <variant.icon
                          className="w-[14px] h-[14px] flex-shrink-0"
                          style={{ color: isActive ? variant.color : C.gray60 }}
                        />
                        <span>{variant.label}</span>
                        {isActive && (
                          <span
                            className="w-1.5 h-1.5 rounded-full ml-auto"
                            style={{ backgroundColor: variant.color }}
                          />
                        )}
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Spacer to push bottom items down */}
        <div className="flex-1" />

        {/* Divider */}
        <div className="mx-5 my-2" style={{ height: 1, background: C.gray80 }} />

        {/* Help & Documentation */}
        <a
          href="https://www.pwc.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-5 py-2.5 text-[14px] font-normal transition-colors"
          style={{ color: C.gray40, borderLeft: '3px solid transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.gray80)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <HelpCircle className="w-[16px] h-[16px] flex-shrink-0" style={{ color: C.gray50 }} />
          <span>Help & Docs</span>
          <ExternalLink className="w-3 h-3 ml-auto" style={{ color: C.gray60 }} />
        </a>

        {/* Settings */}
        <NavLink to="/settings">
          {({ isActive }) => (
            <div
              className="flex items-center gap-3 px-5 py-2.5 text-[14px] font-normal transition-colors"
              style={{
                color: isActive ? C.gray10 : C.gray40,
                background: isActive ? C.gray100 : 'transparent',
                borderLeft: isActive ? `3px solid ${C.blue60}` : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.gray80; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? C.gray100 : 'transparent'; }}
            >
              <Settings className="w-[16px] h-[16px] flex-shrink-0" style={{ color: isActive ? C.blue40 : C.gray50 }} />
              <span>Settings</span>
            </div>
          )}
        </NavLink>
      </nav>

      {/* Footer */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: `1px solid ${C.gray80}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: connected ? C.supportSuccess : C.supportError }}
          />
          <span className="text-[12px] truncate max-w-[140px]" style={{ color: C.gray40 }}>{orgLabel}</span>
        </div>
        <span className="text-[11px]" style={{ color: C.gray60 }}>v2.0</span>
      </div>
    </aside>
  );
}
