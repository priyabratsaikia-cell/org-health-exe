import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import type { Org, SettingsData } from '@/api/types';
import { type AccentColor, type ThemeMode, resolveTheme, getColors } from '@/utils/colors';

const SELECTED_ORG_KEY = 'selectedOrgUsername';
const ACCENT_KEY = 'accentColor';
const THEME_KEY = 'themeMode';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppState {
  settings: SettingsData | null;
  orgs: Org[];
  selectedOrg: Org | null;
  toasts: Toast[];
  scanRunning: boolean;
  accentColor: AccentColor;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
}

type Action =
  | { type: 'SET_SETTINGS'; payload: SettingsData }
  | { type: 'SET_ORGS'; payload: Org[] }
  | { type: 'SET_SELECTED_ORG'; payload: Org | null }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: number }
  | { type: 'SET_SCAN_RUNNING'; payload: boolean }
  | { type: 'SET_ACCENT_COLOR'; payload: AccentColor }
  | { type: 'SET_THEME_MODE'; payload: ThemeMode }
  | { type: 'SET_RESOLVED_THEME'; payload: 'light' | 'dark' };

let toastId = 0;

function pickSelectedOrg(orgs: Org[], current: Org | null): Org | null {
  if (orgs.length === 0) return null;
  if (current && orgs.find(o => o.username === current.username)) {
    return orgs.find(o => o.username === current.username)!;
  }
  const saved = localStorage.getItem(SELECTED_ORG_KEY);
  if (saved) {
    const match = orgs.find(o => o.username === saved);
    if (match) return match;
  }
  return orgs[0];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    case 'SET_ORGS': {
      const orgs = action.payload;
      const selectedOrg = pickSelectedOrg(orgs, state.selectedOrg);
      if (selectedOrg) localStorage.setItem(SELECTED_ORG_KEY, selectedOrg.username);
      return { ...state, orgs, selectedOrg };
    }
    case 'SET_SELECTED_ORG': {
      if (action.payload) localStorage.setItem(SELECTED_ORG_KEY, action.payload.username);
      else localStorage.removeItem(SELECTED_ORG_KEY);
      return { ...state, selectedOrg: action.payload };
    }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { ...action.payload, id: ++toastId }] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_SCAN_RUNNING':
      return { ...state, scanRunning: action.payload };
    case 'SET_ACCENT_COLOR':
      localStorage.setItem(ACCENT_KEY, action.payload);
      return { ...state, accentColor: action.payload };
    case 'SET_THEME_MODE': {
      localStorage.setItem(THEME_KEY, action.payload);
      return { ...state, themeMode: action.payload, resolvedTheme: resolveTheme(action.payload) };
    }
    case 'SET_RESOLVED_THEME':
      return { ...state, resolvedTheme: action.payload };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const savedThemeMode = (localStorage.getItem(THEME_KEY) as ThemeMode) || 'dark';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    settings: null,
    orgs: [],
    selectedOrg: null,
    toasts: [],
    scanRunning: false,
    accentColor: (localStorage.getItem(ACCENT_KEY) as AccentColor) || 'blue',
    themeMode: savedThemeMode,
    resolvedTheme: resolveTheme(savedThemeMode),
  });

  // Apply accent color CSS variables
  useEffect(() => {
    const root = document.documentElement;
    if (state.accentColor === 'orange') {
      root.style.setProperty('--accent', '#D04A02');
      root.style.setProperty('--accent-light', '#F97316');
      root.style.setProperty('--accent-rgb', '208 74 2');
      root.style.setProperty('--accent-light-rgb', '249 115 22');
      root.style.setProperty('--accent-dark-rgb', '138 56 0');
    } else {
      root.style.setProperty('--accent', '#0F62FE');
      root.style.setProperty('--accent-light', '#78A9FF');
      root.style.setProperty('--accent-rgb', '15 98 254');
      root.style.setProperty('--accent-light-rgb', '120 169 255');
      root.style.setProperty('--accent-dark-rgb', '0 45 156');
    }
  }, [state.accentColor]);

  // Apply theme CSS variables + body attribute
  useEffect(() => {
    const root = document.documentElement;
    const isLight = state.resolvedTheme === 'light';

    root.setAttribute('data-theme', state.resolvedTheme);

    if (isLight) {
      root.style.setProperty('--bg-base', '#FFFFFF');
      root.style.setProperty('--bg-surface', '#F4F4F4');
      root.style.setProperty('--bg-elevated', '#E0E0E0');
      root.style.setProperty('--text-primary', '#161616');
      root.style.setProperty('--text-secondary', '#525252');
      root.style.setProperty('--border-subtle', '#E0E0E0');
      root.style.setProperty('--overlay-alpha', '0.08');
    } else {
      root.style.setProperty('--bg-base', '#161616');
      root.style.setProperty('--bg-surface', '#262626');
      root.style.setProperty('--bg-elevated', '#393939');
      root.style.setProperty('--text-primary', '#F4F4F4');
      root.style.setProperty('--text-secondary', '#A8A8A8');
      root.style.setProperty('--border-subtle', '#393939');
      root.style.setProperty('--overlay-alpha', '0.06');
    }
  }, [state.resolvedTheme]);

  // Listen for system theme changes when mode is 'system'
  useEffect(() => {
    if (state.themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      dispatch({ type: 'SET_RESOLVED_THEME', payload: e.matches ? 'dark' : 'light' });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [state.themeMode]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    dispatch({ type: 'ADD_TOAST', payload: { message, type } });
    const id = toastId;
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 8000);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, toast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

/** Convenience hook: returns the theme-aware color palette */
export function useColors() {
  const { state } = useApp();
  return getColors(state.accentColor, state.resolvedTheme);
}
