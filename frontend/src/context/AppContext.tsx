import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { Org, SettingsData } from '@/api/types';

const SELECTED_ORG_KEY = 'selectedOrgUsername';

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
}

type Action =
  | { type: 'SET_SETTINGS'; payload: SettingsData }
  | { type: 'SET_ORGS'; payload: Org[] }
  | { type: 'SET_SELECTED_ORG'; payload: Org | null }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: number }
  | { type: 'SET_SCAN_RUNNING'; payload: boolean };

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    settings: null,
    orgs: [],
    selectedOrg: null,
    toasts: [],
    scanRunning: false,
  });

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
