import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, Hexagon, Sparkles, Leaf, Radio, ChevronDown, Apple, Circle, Landmark, BookOpen, Zap, Square, Sun, Eclipse } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scans', icon: FileText, label: 'Scans & Reports' },
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
  const location = useLocation();
  const connected = !!state.selectedOrg;
  const orgLabel = state.selectedOrg
    ? (state.selectedOrg.username || state.selectedOrg.alias)
    : 'No org connected';

  const isDashboardRoute = location.pathname === '/' || location.pathname.startsWith('/dashboard/');
  const [variantsOpen, setVariantsOpen] = useState(isDashboardRoute);

  return (
    <aside className="w-[248px] min-w-[248px] h-screen bg-surface border-r border-white/[0.06] flex flex-col z-50">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
        <div className="w-9 h-9 rounded-lg accent-gradient flex items-center justify-center shadow-glow">
          <Hexagon className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="block font-extrabold text-sm text-gray-100 tracking-tight">Org Health Agent</span>
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest bg-accent-glow px-1.5 py-0.5 rounded">PwC</span>
        </div>
      </div>

      <nav className="flex-1 p-2.5 flex flex-col gap-0.5 overflow-y-auto">
        {mainNavItems.map(item => (
          <div key={item.to}>
            <div className="flex items-center">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 border-l-[2.5px] ${
                    isActive
                      ? 'bg-accent-glow text-accent-light font-semibold border-accent'
                      : 'text-gray-400 border-transparent hover:bg-white/[0.04] hover:text-gray-200'
                  }`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
              {item.to === '/' && (
                <button
                  onClick={() => setVariantsOpen(!variantsOpen)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all mr-1"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${variantsOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {item.to === '/' && variantsOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-2">
                {dashboardVariants.map(variant => (
                  <NavLink
                    key={variant.to}
                    to={variant.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] font-medium transition-all duration-150 ${
                        isActive
                          ? 'text-white font-semibold'
                          : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <variant.icon className="w-[14px] h-[14px] flex-shrink-0" style={{ color: isActive ? variant.color : undefined }} />
                        <span>{variant.label}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full ml-auto" style={{ backgroundColor: variant.color, boxShadow: `0 0 6px ${variant.color}80` }} />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="h-px bg-white/[0.06] my-2 mx-3" />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 border-l-[2.5px] ${
              isActive
                ? 'bg-accent-glow text-accent-light font-semibold border-accent'
                : 'text-gray-400 border-transparent hover:bg-white/[0.04] hover:text-gray-200'
            }`
          }
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0" />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-pulse-slow' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'}`} />
          <span className="truncate max-w-[120px] text-gray-400">{orgLabel}</span>
        </div>
        <span className="text-[10px] text-gray-600 font-medium">v2.0</span>
      </div>
    </aside>
  );
}
