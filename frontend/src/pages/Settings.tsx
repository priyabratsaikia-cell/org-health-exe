import { useState, useEffect, useCallback } from 'react';
import {
  Key, Trash2, Loader2, Check, RefreshCw, Search,
  ChevronDown, ChevronRight, Server, Globe, Shield, Clock,
  Plus, X, Bot, AlertTriangle, ExternalLink, Settings2, Database,
  CheckCircle, XCircle, ChevronRight as Arrow, Palette, Sun, Moon, Monitor
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';
import { fmtDate, timeAgo } from '@/utils/formatters';
import type { Org, SettingsData, ParameterChecklist } from '@/api/types';

type SectionKey = 'orgs' | 'ai' | 'params' | 'theme';

function CarbonTag({ text, color, type = 'default' }: { text: string; color: string; type?: 'default' | 'outline' }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[12px] font-normal"
      style={type === 'outline'
        ? { border: `1px solid ${color}`, color, background: 'transparent' }
        : { background: `${color}30`, color }
      }
    >
      {text}
    </span>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.1-pro-preview');
  const [orgAlias, setOrgAlias] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checklist, setChecklist] = useState<ParameterChecklist | null>(null);
  const [checklistSearch, setChecklistSearch] = useState('');
  const [expandedChecklistCats, setExpandedChecklistCats] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<SectionKey>('orgs');
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [confirmRemoveOrg, setConfirmRemoveOrg] = useState<number | null>(null);
  const { state, toast, dispatch } = useApp();
  const C = getColors(state.accentColor);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      setModel(s.model);
      dispatch({ type: 'SET_SETTINGS', payload: s });
    } catch {}
  }, [dispatch]);

  const loadOrgs = useCallback(async () => {
    try {
      const o = await api.getOrgs();
      setOrgs(o.orgs);
      dispatch({ type: 'SET_ORGS', payload: o.orgs });
    } catch {}
  }, [dispatch]);

  const loadChecklist = useCallback(async () => {
    try {
      const c = await api.getParameterChecklist();
      setChecklist(c);
    } catch {}
  }, []);

  useEffect(() => { loadSettings(); loadOrgs(); loadChecklist(); }, [loadSettings, loadOrgs, loadChecklist]);

  const saveKey = async () => {
    if (!apiKey.trim()) { toast('Enter an API key', 'error'); return; }
    setSavingKey(true);
    try {
      await api.saveApiKey(apiKey.trim(), model);
      toast('API key saved', 'success');
      setApiKey('');
      loadSettings();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const removeKey = async () => {
    try {
      await api.removeApiKey();
      toast('API key removed', 'info');
      loadSettings();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    try {
      await api.updateModel(newModel);
      toast('Model updated', 'success');
      loadSettings();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const syncFromCli = async () => {
    setSyncing(true);
    try {
      const result = await api.syncOrgs();
      setOrgs(result.orgs);
      dispatch({ type: 'SET_ORGS', payload: result.orgs });
      toast(`Synced ${result.synced} org(s) from Salesforce CLI`, 'success');
    } catch (e: any) {
      toast('Sync failed: ' + e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const connectOrg = async () => {
    if (!orgAlias.trim()) { toast('Enter an alias for the org', 'error'); return; }
    setConnecting(true);
    toast('Opening Salesforce login in your browser...', 'info');
    try {
      await api.connectOrg(orgAlias.trim(), sandbox);
      toast('Org connected!', 'success');
      setOrgAlias('');
      setShowConnectForm(false);
      loadOrgs();
    } catch (e: any) {
      toast('Connection failed: ' + e.message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const removeOrg = async (id: number) => {
    try {
      await api.removeOrg(id);
      toast('Org removed', 'info');
      setConfirmRemoveOrg(null);
      loadOrgs();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const sections: { key: SectionKey; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: 'orgs', label: 'Organizations', icon: <Server className="w-4 h-4" />, desc: `${orgs.length} connected` },
    { key: 'ai', label: 'AI Configuration', icon: <Bot className="w-4 h-4" />, desc: 'API key & model' },
    { key: 'params', label: 'Parameter Registry', icon: <Database className="w-4 h-4" />, desc: checklist ? `${checklist.total} params` : 'Loading...' },
    { key: 'theme', label: 'Theme', icon: <Palette className="w-4 h-4" />, desc: state.accentColor === 'orange' ? 'PwC Orange' : 'Default Blue' },
  ];

  return (
    <PageTransition>
      <div className="-m-6 flex flex-col" style={{ minHeight: 'calc(100vh - 72px)' }}>
        {/* Horizontal Tab Navigation */}
        <div className="flex" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
          {sections.map(sec => {
            const isActive = activeSection === sec.key;
            return (
              <button
                key={sec.key}
                onClick={() => setActiveSection(sec.key)}
                className="flex items-center gap-2 px-5 py-3 text-[14px] font-normal transition-colors relative"
                style={{ color: isActive ? C.white : C.gray50 }}
              >
                <span style={{ color: isActive ? C.blue40 : C.gray50 }}>{sec.icon}</span>
                <span>{sec.label}</span>
                <span className="text-[12px] px-1.5 py-0.5" style={{
                  background: isActive ? `${C.blue60}30` : C.gray80,
                  color: isActive ? C.blue40 : C.gray50,
                }}>
                  {sec.desc}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="settingsTab"
                    className="absolute bottom-0 left-0 right-0 h-[3px]"
                    style={{ background: C.blue60 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1" style={{ background: C.gray100 }}>
          <AnimatePresence mode="wait">
              {/* ===== AI CONFIGURATION ===== */}
              {activeSection === 'ai' && (
                <motion.div
                  key="ai"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* API Key Row */}
                  <div className="px-6 py-5 flex items-center justify-between" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <div className="flex items-center gap-4">
                      <Key className="w-4 h-4 flex-shrink-0" style={{ color: settings?.api_key_set ? C.supportSuccess : C.gray50 }} />
                      <div>
                        <span className="text-[14px] block" style={{ color: C.gray10 }}>Gemini API Key</span>
                        <span className="text-[12px]" style={{ color: settings?.api_key_set ? C.supportSuccess : C.gray50 }}>
                          {settings?.api_key_set ? settings.api_key_masked : 'Not configured'}
                        </span>
                      </div>
                    </div>
                    {settings?.api_key_set && (
                      <button
                        onClick={removeKey}
                        className="flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors"
                        style={{ color: C.red40, border: `1px solid ${C.red60}40` }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${C.supportError}15`)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  {/* New / Update Key Input */}
                  <div className="px-6 py-4" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <label className="text-[12px] block mb-1.5" style={{ color: C.gray50 }}>
                      {settings?.api_key_set ? 'Replace API key' : 'Enter API key'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder={settings?.api_key_set ? 'Paste a new key to replace the current one' : 'Paste your Gemini API key'}
                        className="flex-1 px-4 py-2.5 text-[14px] focus:outline-none"
                        style={{ background: C.gray80, borderBottom: `2px solid ${apiKey ? C.blue60 : C.gray70}`, color: C.gray10 }}
                        onFocus={e => (e.currentTarget.style.borderBottomColor = C.blue60)}
                        onBlur={e => { if (!apiKey) e.currentTarget.style.borderBottomColor = C.gray70; }}
                        autoComplete="off"
                      />
                      <button
                        onClick={saveKey}
                        disabled={savingKey || !apiKey.trim()}
                        className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-normal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: C.blue60, color: C.white }}
                        onMouseEnter={e => { if (!savingKey && apiKey.trim()) e.currentTarget.style.background = C.blue60h; }}
                        onMouseLeave={e => { if (!savingKey && apiKey.trim()) e.currentTarget.style.background = C.blue60; }}
                      >
                        {savingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {savingKey ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] mt-2 transition-colors"
                      style={{ color: C.blue40 }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.blue20)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.blue40)}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Get a key from Google AI Studio
                    </a>
                  </div>

                  {/* Model Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-3">
                    {[
                      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', badge: 'Latest', desc: 'Advanced reasoning', badgeColor: C.supportSuccess },
                      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', badge: 'Stable', desc: 'Production-ready', badgeColor: C.blue40 },
                      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Legacy', desc: 'General analysis', badgeColor: C.gray50 },
                    ].map((m, i) => {
                      const isSelected = model === m.value;
                      return (
                        <button
                          key={m.value}
                          onClick={() => handleModelChange(m.value)}
                          className="text-left px-5 py-4 transition-colors"
                          style={{
                            background: isSelected ? `${C.blue60}12` : C.gray90,
                            borderBottom: `1px solid ${C.gray80}`,
                            borderRight: i < 2 ? `1px solid ${C.gray80}` : undefined,
                            borderTop: isSelected ? `3px solid ${C.blue60}` : '3px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray80; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = C.gray90; }}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[14px] font-semibold" style={{ color: isSelected ? C.gray10 : C.gray30 }}>{m.label}</span>
                            <CarbonTag text={m.badge} color={m.badgeColor} />
                            {isSelected && <Check className="w-4 h-4 ml-auto" style={{ color: C.blue40 }} />}
                          </div>
                          <p className="text-[12px]" style={{ color: C.gray50 }}>{m.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ===== ORGANIZATIONS ===== */}
              {activeSection === 'orgs' && (
                <motion.div
                  key="orgs"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Toolbar */}
                  <div className="px-6 py-3 flex items-center justify-end gap-2" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <button
                      onClick={syncFromCli}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 text-[13px] transition-colors disabled:opacity-50"
                      style={{ color: C.blue40, border: `1px solid ${C.blue60}40`, background: 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.blue60}15`)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync from CLI'}
                    </button>
                    <button
                      onClick={() => setShowConnectForm(prev => !prev)}
                      className="flex items-center gap-2 px-4 py-2 text-[13px] font-normal transition-colors"
                      style={{ background: C.blue60, color: C.white }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
                      onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Connect org
                    </button>
                  </div>

                  {/* Connect New Org Form */}
                  <AnimatePresence>
                    {showConnectForm && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 py-5" style={{ background: `${C.blue60}08`, borderBottom: `1px solid ${C.blue60}30` }}>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Connect New Organization</h4>
                            <button onClick={() => setShowConnectForm(false)} className="p-1" style={{ color: C.gray50 }}>
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-[13px] mb-4" style={{ color: C.gray40 }}>
                            Opens Salesforce login in your browser. After authenticating, the org will be added to your configuration.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                            <div>
                              <label className="text-[12px] block mb-1.5" style={{ color: C.gray50 }}>Org Alias</label>
                              <input
                                type="text"
                                value={orgAlias}
                                onChange={e => setOrgAlias(e.target.value)}
                                placeholder="e.g. my-dev-org"
                                className="w-full px-4 py-3 text-[14px] focus:outline-none"
                                style={{
                                  background: C.gray80,
                                  borderBottom: `2px solid ${orgAlias ? C.blue60 : C.gray70}`,
                                  color: C.gray10,
                                }}
                                onFocus={e => (e.currentTarget.style.borderBottomColor = C.blue60)}
                                onBlur={e => { if (!orgAlias) e.currentTarget.style.borderBottomColor = C.gray70; }}
                              />
                            </div>
                            <label
                              className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors"
                              style={{ background: C.gray80, color: C.gray30 }}
                            >
                              <div
                                className="w-5 h-5 flex items-center justify-center transition-colors"
                                style={{
                                  border: `2px solid ${sandbox ? C.blue60 : C.gray60}`,
                                  background: sandbox ? C.blue60 : 'transparent',
                                }}
                              >
                                {sandbox && <Check className="w-3 h-3" style={{ color: C.white }} />}
                              </div>
                              <span className="text-[14px]">Sandbox</span>
                              <input
                                type="checkbox"
                                checked={sandbox}
                                onChange={e => setSandbox(e.target.checked)}
                                className="sr-only"
                              />
                            </label>
                            <button
                              onClick={connectOrg}
                              disabled={connecting || !orgAlias.trim()}
                              className="flex items-center gap-2 px-5 py-3 text-[14px] font-normal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: C.blue60, color: C.white }}
                              onMouseEnter={e => { if (!connecting && orgAlias.trim()) e.currentTarget.style.background = C.blue60h; }}
                              onMouseLeave={e => { if (!connecting && orgAlias.trim()) e.currentTarget.style.background = C.blue60; }}
                            >
                              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              {connecting ? 'Connecting...' : 'Connect'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Org Table */}
                  {orgs.length === 0 ? (
                    <div className="px-6 py-16 text-center" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                      <Server className="w-10 h-10 mx-auto mb-4" style={{ color: C.gray60 }} />
                      <p className="text-[16px] mb-1" style={{ color: C.gray30 }}>No organizations connected</p>
                      <p className="text-[13px] mb-4" style={{ color: C.gray50 }}>
                        Click "Sync from CLI" to discover orgs already authenticated, or connect a new org via browser login.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* Table Header */}
                      <div className="grid grid-cols-[1fr_140px_100px_72px_48px] gap-2 px-5 py-2.5" style={{ background: C.gray80, borderBottom: `1px solid ${C.gray70}` }}>
                        {['Organization', 'Instance', 'Type', 'Active', ''].map(h => (
                          <span key={h} className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.gray30 }}>{h}</span>
                        ))}
                      </div>

                      {/* Table Rows */}
                      {orgs.map(org => {
                        const isSelected = state.selectedOrg?.username === org.username;
                        return (
                          <div key={org.id}>
                            <div
                              className="grid grid-cols-[1fr_140px_100px_72px_48px] gap-2 items-center px-5 py-3 transition-colors"
                              style={{
                                background: isSelected ? `${C.blue60}12` : C.gray90,
                                borderBottom: `1px solid ${C.gray80}`,
                                borderLeft: isSelected ? `3px solid ${C.blue60}` : '3px solid transparent',
                              }}
                              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#353535'; }}
                              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${C.blue60}12` : C.gray90; }}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px] font-normal truncate" style={{ color: C.gray10 }}>{org.alias}</span>
                                  {org.is_sandbox && <CarbonTag text="Sandbox" color={C.yellow30} />}
                                </div>
                                <div className="mt-0.5">
                                  <span className="text-[12px] truncate block" style={{ color: C.gray50 }}>{org.username}</span>
                                </div>
                              </div>
                              <span className="text-[13px] truncate" style={{ color: C.gray40 }}>
                                {org.instance_url ? new URL(org.instance_url).hostname.split('.')[0] : '—'}
                              </span>
                              <span className="text-[13px]" style={{ color: C.gray40 }}>
                                {org.is_sandbox ? 'Sandbox' : 'Production'}
                              </span>
                              {/* Toggle Switch */}
                              <div className="flex justify-center">
                                <button
                                  onClick={() => dispatch({ type: 'SET_SELECTED_ORG', payload: isSelected ? null : org })}
                                  className="relative w-10 h-[22px] transition-colors"
                                  style={{
                                    background: isSelected ? C.blue60 : C.gray70,
                                    borderRadius: 11,
                                  }}
                                  aria-label={isSelected ? `Deselect ${org.alias}` : `Select ${org.alias}`}
                                >
                                  <span
                                    className="absolute top-[3px] w-4 h-4 rounded-full transition-all duration-200"
                                    style={{
                                      background: C.white,
                                      left: isSelected ? 21 : 3,
                                    }}
                                  />
                                </button>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  onClick={() => setConfirmRemoveOrg(org.id)}
                                  className="p-1.5 transition-colors"
                                  style={{ color: C.gray50 }}
                                  onMouseEnter={e => { e.currentTarget.style.color = C.red40; e.currentTarget.style.background = `${C.red60}15`; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = C.gray50; e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Confirm Remove */}
                            <AnimatePresence>
                              {confirmRemoveOrg === org.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-5 py-3 flex items-center gap-3" style={{ background: `${C.supportError}10`, borderBottom: `1px solid ${C.red60}30` }}>
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: C.supportError }} />
                                    <span className="text-[13px]" style={{ color: C.red40 }}>
                                      Remove <strong>{org.alias}</strong>? This will disconnect the org from the agent.
                                    </span>
                                    <div className="flex items-center gap-2 ml-auto">
                                      <button
                                        onClick={() => setConfirmRemoveOrg(null)}
                                        className="px-3 py-1.5 text-[13px] transition-colors"
                                        style={{ color: C.gray30, border: `1px solid ${C.gray70}` }}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => removeOrg(org.id)}
                                        className="px-3 py-1.5 text-[13px] transition-colors"
                                        style={{ background: C.red60, color: C.white }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#B81922')}
                                        onMouseLeave={e => (e.currentTarget.style.background = C.red60)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Info Bar */}
                  <div className="px-6 py-3 flex items-center gap-2" style={{ background: C.gray100, borderBottom: `1px solid ${C.gray80}` }}>
                    <Settings2 className="w-3.5 h-3.5" style={{ color: C.gray50 }} />
                    <span className="text-[12px]" style={{ color: C.gray50 }}>
                      Toggle an org to set it as the active target for scans and dashboard.
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ===== PARAMETER REGISTRY ===== */}
              {activeSection === 'params' && (
                <motion.div
                  key="params"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Search Toolbar */}
                  <div className="px-6 py-3 flex items-center justify-end" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <div className="relative w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.gray50 }} />
                      <input
                        type="text"
                        value={checklistSearch}
                        onChange={e => setChecklistSearch(e.target.value)}
                        placeholder="Search parameters..."
                        className="w-full pl-10 pr-4 py-2 text-[13px] focus:outline-none"
                        style={{
                          background: C.gray80,
                          borderBottom: `2px solid ${checklistSearch ? C.blue60 : C.gray70}`,
                          color: C.gray10,
                        }}
                        onFocus={e => (e.currentTarget.style.borderBottomColor = C.blue60)}
                        onBlur={e => { if (!checklistSearch) e.currentTarget.style.borderBottomColor = C.gray70; }}
                      />
                      {checklistSearch && (
                        <button
                          onClick={() => setChecklistSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                          style={{ color: C.gray50 }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Coverage Summary Strip */}
                  {checklist && (
                    <div className="grid grid-cols-4" style={{ borderBottom: `1px solid ${C.gray80}` }}>
                      {[
                        { label: 'Total Parameters', value: checklist.total, color: C.gray10 },
                        { label: 'Categories', value: Object.keys(checklist.categories).length, color: C.teal40 },
                        { label: 'Auto-Assessable', value: checklist.registry.filter(p => p.assessable).length, color: C.supportSuccess },
                        { label: 'Manual Review', value: checklist.registry.filter(p => !p.assessable).length, color: C.gray50 },
                      ].map((kpi, i) => (
                        <div key={kpi.label} className="px-5 py-4" style={{ background: C.gray90, borderRight: i < 3 ? `1px solid ${C.gray80}` : undefined }}>
                          <span className="text-[12px] block mb-1" style={{ color: C.gray50 }}>{kpi.label}</span>
                          <span className="text-[28px] font-light tracking-tight" style={{ color: kpi.color }}>{kpi.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Category Accordion */}
                  {checklist ? (
                    <div>
                      {Object.entries(checklist.categories).map(([catKey, catData]) => {
                        const isOpen = expandedChecklistCats.has(catKey);
                        const searchLower = checklistSearch.toLowerCase();
                        const filteredParams = searchLower
                          ? catData.parameters.filter(p =>
                              p.id.toLowerCase().includes(searchLower) ||
                              p.name.toLowerCase().includes(searchLower) ||
                              p.description.toLowerCase().includes(searchLower) ||
                              p.sf_cli_cmd.toLowerCase().includes(searchLower)
                            )
                          : catData.parameters;

                        if (searchLower && filteredParams.length === 0) return null;

                        const assessable = filteredParams.filter(p => p.assessable).length;

                        return (
                          <div key={catKey}>
                            <button
                              onClick={() => setExpandedChecklistCats(prev => {
                                const next = new Set(prev);
                                next.has(catKey) ? next.delete(catKey) : next.add(catKey);
                                return next;
                              })}
                              className="w-full flex items-center gap-3 px-5 py-3 transition-colors"
                              style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#353535')}
                              onMouseLeave={e => (e.currentTarget.style.background = C.gray90)}
                            >
                              {isOpen
                                ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: C.gray50 }} />
                                : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: C.gray50 }} />
                              }
                              <span className="text-[14px] text-left flex-1" style={{ color: C.gray10 }}>{catData.label}</span>
                              <CarbonTag text={`${catData.weight}% weight`} color={C.blue40} type="outline" />
                              <div className="flex items-center gap-1 ml-2">
                                <span className="text-[12px]" style={{ color: C.supportSuccess }}>{assessable}</span>
                                <span className="text-[12px]" style={{ color: C.gray60 }}>/</span>
                                <span className="text-[12px]" style={{ color: C.gray40 }}>{filteredParams.length}</span>
                                <span className="text-[12px] ml-1" style={{ color: C.gray50 }}>auto</span>
                              </div>
                            </button>

                            <AnimatePresence initial={false}>
                              {(isOpen || (searchLower && filteredParams.length > 0)) && (
                                <motion.div
                                  key={`cl-${catKey}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div style={{ background: C.gray100 }}>
                                    {/* Param Table Header */}
                                    <div className="grid grid-cols-[50px_1fr_110px_1fr_70px] gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray50, borderBottom: `1px solid ${C.gray80}` }}>
                                      <span>ID</span><span>Parameter</span><span>Data Source</span><span>SF CLI Command</span><span>Auto</span>
                                    </div>
                                    {filteredParams.map(p => (
                                      <div key={p.id} className="grid grid-cols-[50px_1fr_110px_1fr_70px] gap-2 px-5 py-2 items-start transition-colors hover:bg-[#1c1c1c]" style={{ borderBottom: `1px solid ${C.gray80}20` }}>
                                        <span className="text-[12px] font-mono" style={{ color: C.gray60 }}>{p.id}</span>
                                        <div className="min-w-0">
                                          <span className="text-[13px] block truncate" style={{ color: C.gray20 }} title={p.name}>{p.name}</span>
                                          <span className="text-[11px] block truncate" style={{ color: C.gray50 }} title={p.description}>{p.description}</span>
                                        </div>
                                        <div className="min-w-0">
                                          <span className="text-[12px] block truncate" style={{ color: C.gray40 }} title={p.data_source}>
                                            {p.data_source.replace('_', ' ')}
                                          </span>
                                          {p.package && (
                                            <CarbonTag text={p.package} color={C.purple40} />
                                          )}
                                        </div>
                                        <span className="text-[11px] font-mono truncate" style={{ color: C.gray50 }} title={p.sf_cli_cmd}>{p.sf_cli_cmd}</span>
                                        <div>
                                          {p.assessable ? (
                                            <CarbonTag text="Auto" color={C.supportSuccess} />
                                          ) : (
                                            <CarbonTag text="Manual" color={C.gray50} type="outline" />
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-6 py-16 text-center" style={{ background: C.gray90 }}>
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: C.gray50 }} />
                      <p className="text-[14px]" style={{ color: C.gray50 }}>Loading parameter registry...</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ===== THEME ===== */}
              {activeSection === 'theme' && (
                <motion.div
                  key="theme"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Accent Color */}
                  <div className="px-6 py-5" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}` }}>
                    <h4 className="text-[14px] font-semibold mb-1" style={{ color: C.gray10 }}>Accent Color</h4>
                    <p className="text-[12px] mb-5" style={{ color: C.gray50 }}>
                      Choose the primary color used across buttons, links, and active states.
                    </p>
                    <div className="flex gap-3">
                      {([
                        { key: 'blue' as const, label: 'Default Blue', hex: '#0F62FE' },
                        { key: 'orange' as const, label: 'PwC Orange', hex: '#E04E17' },
                      ]).map(opt => {
                        const isActive = state.accentColor === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => dispatch({ type: 'SET_ACCENT_COLOR', payload: opt.key })}
                            className="flex items-center gap-3 px-5 py-3.5 transition-colors"
                            style={{
                              background: isActive ? `${opt.hex}12` : C.gray80,
                              border: isActive ? `2px solid ${opt.hex}` : `2px solid ${C.gray70}`,
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = opt.hex; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = C.gray70; }}
                          >
                            <span
                              className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                              style={{ background: opt.hex }}
                            >
                              {isActive && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                            </span>
                            <div className="text-left">
                              <span className="text-[14px] block" style={{ color: isActive ? C.gray10 : C.gray30 }}>{opt.label}</span>
                              <span className="text-[11px] font-mono" style={{ color: C.gray50 }}>{opt.hex}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Appearance Mode — Disabled */}
                  <div className="px-6 py-5" style={{ background: C.gray90, borderBottom: `1px solid ${C.gray80}`, opacity: 0.45 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-[14px] font-semibold" style={{ color: C.gray10 }}>Appearance</h4>
                      <CarbonTag text="Coming soon" color={C.gray50} type="outline" />
                    </div>
                    <p className="text-[12px] mb-5" style={{ color: C.gray50 }}>
                      Switch between light and dark modes, or follow your system preference.
                    </p>
                    <div className="flex gap-3">
                      {[
                        { icon: <Sun className="w-4 h-4" />, label: 'Light' },
                        { icon: <Moon className="w-4 h-4" />, label: 'Dark' },
                        { icon: <Monitor className="w-4 h-4" />, label: 'System' },
                      ].map((opt, i) => (
                        <div
                          key={opt.label}
                          className="flex items-center gap-2.5 px-5 py-3.5 cursor-not-allowed"
                          style={{
                            background: i === 1 ? `${C.gray60}15` : C.gray80,
                            border: i === 1 ? `2px solid ${C.gray60}` : `2px solid ${C.gray70}`,
                          }}
                        >
                          <span style={{ color: C.gray50 }}>{opt.icon}</span>
                          <span className="text-[14px]" style={{ color: C.gray40 }}>{opt.label}</span>
                          {i === 1 && <Check className="w-3.5 h-3.5 ml-1" style={{ color: C.gray50 }} />}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        {/* Footer — pinned to bottom of viewport */}
        <div className="mt-auto px-6 py-3 flex items-center justify-between" style={{ background: C.gray80, borderTop: `1px solid ${C.gray70}` }}>
          <div className="flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5" style={{ color: C.gray50 }} />
            <span className="text-[12px]" style={{ color: C.gray40 }}>PwC Org Health Agent</span>
          </div>
          <span className="text-[11px]" style={{ color: C.gray50 }}>&copy; 2026 PwC. All rights reserved.</span>
        </div>
      </div>
    </PageTransition>
  );
}
