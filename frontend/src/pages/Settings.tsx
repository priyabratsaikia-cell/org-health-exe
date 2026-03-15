import { useState, useEffect, useCallback } from 'react';
import { Key, Building2, Trash2, Plus, Loader2, Check, RefreshCw, Search, ChevronDown, ChevronRight, List } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import PageTransition from '@/components/layout/PageTransition';
import GlassCard from '@/components/ui/GlassCard';
import Button from '@/components/ui/Button';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtDate } from '@/utils/formatters';
import type { Org, SettingsData, ParameterChecklist, ParameterRegistryEntry } from '@/api/types';

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
  const { state, toast, dispatch } = useApp();

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
      loadOrgs();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-accent/50 placeholder:text-gray-600 transition-colors';
  const selectClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-accent/50 transition-colors';

  return (
    <PageTransition>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        {/* API Key */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Key className="w-4 h-4 text-accent-light" />
            </div>
            <h3 className="text-sm font-bold text-gray-200">Gemini API Key</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API key"
                className={inputClass}
                autoComplete="off"
              />
              {settings && (
                <p className={`text-[11px] mt-1.5 ${settings.api_key_set ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {settings.api_key_set ? `Current key: ${settings.api_key_masked}` : 'No API key configured'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Model</label>
              <select value={model} onChange={e => handleModelChange(e.target.value)} className={selectClass}>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              </select>
            </div>

            <div className="flex gap-2">
              <Button variant="accent" size="sm" onClick={saveKey} loading={savingKey}>Save Key</Button>
              <Button variant="danger" size="sm" onClick={removeKey}>Remove Key</Button>
            </div>
          </div>
        </GlassCard>

        {/* Connected Orgs */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-accent-light" />
              </div>
              <h3 className="text-sm font-bold text-gray-200">Connected Orgs</h3>
              <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">{orgs.length}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />}
              onClick={syncFromCli}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Refresh from CLI'}
            </Button>
          </div>

          <div className="mb-4 space-y-2 max-h-[320px] overflow-y-auto">
            {orgs.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                No orgs connected. Click "Refresh from CLI" to discover orgs already authenticated in Salesforce CLI.
              </div>
            ) : (
              orgs.map(org => {
                const isSelected = state.selectedOrg?.username === org.username;
                return (
                  <div
                    key={org.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-accent/[0.06] border-accent/30'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
                    }`}
                    onClick={() => dispatch({ type: 'SET_SELECTED_ORG', payload: org })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                        <span className="text-sm font-semibold text-gray-200 truncate">{org.alias}</span>
                        {org.is_sandbox && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">Sandbox</span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                      </div>
                      <div className="text-[11px] text-gray-500 ml-4 truncate">
                        {org.username}
                      </div>
                      <div className="text-[10px] text-gray-600 ml-4 mt-0.5 truncate">
                        {org.org_name && <span>{org.org_name} · </span>}
                        {org.instance_url}
                      </div>
                      {org.connected_at && (
                        <div className="text-[10px] text-gray-600 ml-4 mt-0.5">
                          Connected {fmtDate(org.connected_at)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeOrg(org.id); }}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-white/[0.06] space-y-3">
            <p className="text-[11px] text-gray-500">
              Orgs already in Salesforce CLI are auto-detected. Use this to connect a new org via browser login.
            </p>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Org Alias</label>
              <input
                type="text"
                value={orgAlias}
                onChange={e => setOrgAlias(e.target.value)}
                placeholder="e.g. my-dev-org"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sandbox}
                onChange={e => setSandbox(e.target.checked)}
                className="w-4 h-4 rounded accent-accent"
              />
              <span>Sandbox</span>
            </label>
            <Button
              variant="accent"
              size="sm"
              icon={connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              onClick={connectOrg}
              disabled={connecting}
              className="w-full justify-center"
            >
              {connecting ? 'Connecting...' : 'Connect New Org'}
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* Parameter Checklist */}
      {checklist && (
        <GlassCard className="p-5 mt-5 max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <List className="w-4 h-4 text-accent-light" />
              </div>
              <h3 className="text-sm font-bold text-gray-200">Parameter Checklist</h3>
              <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                {checklist.total} parameters
              </span>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                value={checklistSearch}
                onChange={e => setChecklistSearch(e.target.value)}
                placeholder="Search parameters..."
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-gray-300 pl-8 pr-3 py-1.5 focus:outline-none focus:border-accent/50 placeholder:text-gray-600"
              />
            </div>
          </div>

          <div className="space-y-1">
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

              return (
                <div key={catKey} className="border border-white/[0.04] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedChecklistCats(prev => {
                      const next = new Set(prev);
                      next.has(catKey) ? next.delete(catKey) : next.add(catKey);
                      return next;
                    })}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors text-[12px]"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                    <span className="text-gray-300 font-medium text-left">{catData.label}</span>
                    <span className="text-[9px] text-gray-600">{catData.weight}% weight</span>
                    <span className="text-[9px] text-gray-600 ml-auto">{filteredParams.length}/{catData.total_params} params</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {(isOpen || (searchLower && filteredParams.length > 0)) && (
                      <motion.div key={`cl-${catKey}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="px-3 pb-3">
                          <div className="grid grid-cols-[40px_1fr_100px_1fr_60px] gap-2 text-[9px] text-gray-600 uppercase tracking-wider font-bold py-1 border-b border-white/[0.04]">
                            <span>ID</span><span>Parameter</span><span>Data Source</span><span>SF CLI Command</span><span>Auto</span>
                          </div>
                          {filteredParams.map(p => (
                            <div key={p.id} className="grid grid-cols-[40px_1fr_100px_1fr_60px] gap-2 text-[11px] py-1.5 border-b border-white/[0.02] hover:bg-white/[0.02]">
                              <span className="text-gray-600 font-mono">{p.id}</span>
                              <div>
                                <div className="text-gray-300 truncate" title={p.name}>{p.name}</div>
                                <div className="text-[9px] text-gray-600 truncate" title={p.description}>{p.description}</div>
                              </div>
                              <span className="text-gray-500 truncate" title={p.data_source}>
                                {p.data_source.replace('_', ' ')}
                                {p.package && <span className="text-accent-light text-[9px] block">{p.package}</span>}
                              </span>
                              <span className="text-gray-600 font-mono text-[9px] truncate" title={p.sf_cli_cmd}>{p.sf_cli_cmd}</span>
                              <span className={p.assessable ? 'text-green-400' : 'text-gray-600'}>
                                {p.assessable ? '✓ Yes' : '✗ No'}
                              </span>
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
        </GlassCard>
      )}
    </PageTransition>
  );
}
