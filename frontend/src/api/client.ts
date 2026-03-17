import type { DashboardData, Finding, Org, Scan, SettingsData, Category, LimitsPackageStatus, ParameterChecklist, VerificationResult } from './types';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail || err.message || 'Request failed');
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getDashboard: (orgAlias?: string) =>
    request<DashboardData>('GET', `/api/dashboard${orgAlias ? `?org_alias=${encodeURIComponent(orgAlias)}` : ''}`),
  getScans: (orgAlias?: string) =>
    request<{ scans: Scan[] }>('GET', `/api/scans${orgAlias ? `?org_alias=${encodeURIComponent(orgAlias)}` : ''}`),
  getRunningScans: () => request<{ scans: Scan[] }>('GET', '/api/scans/running'),
  getScan: (id: number) => request<Scan>('GET', `/api/scans/${id}`),
  deleteScan: (id: number) => request<{ ok: boolean }>('DELETE', `/api/scans/${id}`),
  getSettings: () => request<SettingsData>('GET', '/api/settings'),
  saveApiKey: (api_key: string, model: string) =>
    request<{ ok: boolean; model: string }>('POST', '/api/settings/apikey', { api_key, model }),
  removeApiKey: () => request<{ ok: boolean }>('DELETE', '/api/settings/apikey'),
  updateModel: (model: string) =>
    request<{ ok: boolean; model: string }>('PUT', '/api/settings/model', { model }),
  getOrgs: () => request<{ orgs: Org[] }>('GET', '/api/orgs'),
  syncOrgs: () => request<{ ok: boolean; synced: number; orgs: Org[] }>('POST', '/api/orgs/sync'),
  connectOrg: (alias: string, sandbox: boolean) =>
    request<{ ok: boolean; username: string; instance_url: string; alias: string }>(
      'POST', '/api/orgs/connect',
      { alias, instance_url: 'https://login.salesforce.com', sandbox },
    ),
  removeOrg: (id: number) => request<{ ok: boolean }>('DELETE', `/api/orgs/${id}`),
  checkLimitsPackage: (orgAlias: string) =>
    request<LimitsPackageStatus>('GET', `/api/orgs/${encodeURIComponent(orgAlias)}/check-limits-package`),
  getCategories: () => request<{ categories: Category[] }>('GET', '/api/categories'),
  getParameterChecklist: () => request<ParameterChecklist>('GET', '/api/parameter-checklist'),
  getAllFindings: (orgAlias?: string) =>
    request<{ findings: Finding[] }>('GET', `/api/findings${orgAlias ? `?org_alias=${encodeURIComponent(orgAlias)}` : ''}`),
  compareScansAnalysis: (scanId: number, prevScanId: number) =>
    request<{ analysis: string }>('POST', '/api/scans/compare-analysis', { scan_id: scanId, prev_scan_id: prevScanId }),
  resolveFinding: (id: number) => request<{ ok: boolean }>('POST', `/api/findings/${id}/resolve`),
  unresolveFinding: (id: number) => request<{ ok: boolean }>('POST', `/api/findings/${id}/unresolve`),
  verifyResolution: (id: number) => request<VerificationResult>('POST', `/api/findings/${id}/verify-resolution`),
};
