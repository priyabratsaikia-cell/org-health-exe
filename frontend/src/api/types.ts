export interface Org {
  id: number;
  alias: string;
  username: string;
  instance_url: string;
  org_name: string;
  is_sandbox: boolean;
  is_active: boolean;
  connected_at: string;
}

export interface Finding {
  id: number;
  scan_id: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  category: string;
  title: string;
  description: string;
  affected_components: string[];
  recommendation: string;
  effort: string;
  is_resolved: boolean;
  resolved_at: string | null;
}

export interface Scan {
  id: number;
  org_alias: string;
  org_username: string;
  scan_type: string;
  status: 'running' | 'completed' | 'failed';
  health_score: number;
  category_scores: string;
  total_components: number;
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  summary: string;
  report_json: string;
  governor_limits_json: string | null;
  code_analysis_json: string | null;
  parameter_coverage_json: string | null;
  governor_limits_trends_json: string | null;
  parameter_results_json: string | null;
  resolved_count?: number;
  started_at: string;
  completed_at: string | null;
  findings?: Finding[];
}

export interface GovernorLimit {
  Name: string;
  LimitKey__c: string;
  LastSnapshotValue__c: number;
  LastPercentOfLimit__c: number;
  AlertThreshold__c: number;
  LastRetrieveTime__c: string;
}

export interface CodeAnalysisResult {
  status: string;
  files_scanned: number;
  issues_found: number;
  severity_counts: Record<string, number>;
  findings_by_pattern: Record<string, number>;
}

export interface ParameterResult {
  id: string;
  name: string;
  category: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'PENDING';
  score: number;
  reason: string;
  data_value: string;
  source: string;
  confidence: string;
}

export interface ParameterResultsPayload {
  parameters: ParameterResult[];
  scoring_method: string;
  deterministic_count: number;
  ai_inferred_count: number;
  pending_count: number;
  not_assessable_count: number;
}

export interface ParameterCoverage {
  total: number;
  assessed: number;
  deterministic_count: number;
  ai_inferred_count: number;
  not_assessable: number;
  pending: number;
  not_assessable_params: { id: string; name: string; reason: string }[];
}

export interface CategoryDetail {
  key: string;
  label: string;
  weight: number;
  params: number;
  score: number;
  assessed: number;
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
  pending: number;
}

export interface ParameterRegistryEntry {
  id: string;
  name: string;
  category: string;
  data_source: string;
  sf_cli_cmd: string;
  package: string | null;
  description: string;
  threshold: string;
  assessable: boolean;
  scoring_key: string;
}

export interface ParameterChecklist {
  total: number;
  categories: Record<string, {
    label: string;
    weight: number;
    total_params: number;
    parameters: ParameterRegistryEntry[];
  }>;
  registry: ParameterRegistryEntry[];
}

export interface LimitsPackageStatus {
  installed: boolean;
  objects_exist: boolean;
  classes_active: boolean;
  jobs_running: boolean;
  status: string;
}

export interface DashboardStats {
  total_scans: number;
  completed_scans: number;
  total_findings: number;
  resolved_findings: number;
  critical_unresolved: number;
  connected_orgs: number;
  latest_health_score: number | null;
}

export interface DashboardExtended {
  scan_history: Scan[];
  avg_score_last_5: number | null;
  latest_category_scores: Record<string, number>;
  severity_totals: Record<string, number>;
  top_risk_categories: { category: string; cnt: number }[];
  effort_distribution: { effort: string; cnt: number }[];
}

export interface DashboardData {
  stats: DashboardStats;
  extended: DashboardExtended;
  recent_scans: Scan[];
  has_governor_limits: boolean;
}

export interface SettingsData {
  api_key_set: boolean;
  api_key_masked: string;
  model: string;
}

export interface Category {
  key: string;
  label: string;
  weight: number;
}

export type WsMessage =
  | { type: 'started'; scan_id: number; org_alias?: string }
  | { type: 'progress'; step: number; total_steps: number; message: string; percent: number }
  | { type: 'complete'; scan_id: number }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export interface DrillFilter {
  type: 'severity' | 'category' | 'effort' | 'open';
  value: string;
  label: string;
}
