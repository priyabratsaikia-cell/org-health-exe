import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Shield, Target, Crosshair, Terminal, ChevronRight, Cpu, Wifi, AlertOctagon } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

const CMD = {
  navy: '#0A1628',
  panel: 'rgba(10, 22, 40, 0.9)',
  border: 'rgba(34, 197, 94, 0.12)',
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  text: '#94A3B8',
  bright: '#E2E8F0',
  headerBg: 'rgba(22, 163, 74, 0.08)',
};

const SEVERITY_CMD: Record<string, { color: string; code: string }> = {
  Critical: { color: CMD.red, code: 'CRIT' },
  High: { color: '#F97316', code: 'HIGH' },
  Medium: { color: CMD.amber, code: 'MED' },
  Low: { color: CMD.green, code: 'LOW' },
  Info: { color: CMD.cyan, code: 'INFO' },
};

function HUDScore({ score }: { score: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (score === null) return;
    const duration = 1000;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setAnimated(Math.round(p * score));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2, r1 = 58, r2 = 50, r3 = 42;

    [r1, r2, r3].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(34, 197, 94, ${0.08 + i * 0.03})`;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (animated > 0) {
      const pct = Math.min(animated, 100) / 100;
      const angle = -Math.PI / 2 + pct * Math.PI * 2;
      const color = animated >= 75 ? CMD.green : animated >= 50 ? CMD.amber : CMD.red;

      ctx.beginPath();
      ctx.arc(cx, cy, r1, -Math.PI / 2, angle);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r2, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2 * 0.8);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color + '50';
      ctx.stroke();

      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + Math.cos(a) * (r1 + 4);
        const y1 = cy + Math.sin(a) * (r1 + 4);
        const x2 = cx + Math.cos(a) * (r1 + 8);
        const y2 = cy + Math.sin(a) * (r1 + 8);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(34, 197, 94, 0.2)`;
        ctx.stroke();
      }
    }
  }, [animated]);

  const color = score !== null ? (score >= 75 ? CMD.green : score >= 50 ? CMD.amber : CMD.red) : CMD.text;

  return (
    <div className="relative flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: 140, height: 140 }} />
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-mono font-bold tracking-tighter" style={{ color }}>{score !== null ? animated : '--'}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: CMD.text }}>{score !== null ? scoreGrade(score) : 'N/A'}</span>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, className = '', headerColor }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string; headerColor?: string }) {
  return (
    <div className={`rounded-lg border overflow-hidden ${className}`} style={{ background: CMD.panel, borderColor: CMD.border }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: CMD.headerBg, borderColor: CMD.border }}>
        <span style={{ color: headerColor || CMD.green }}>{icon}</span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: headerColor || CMD.green }}>{title}</span>
        <div className="flex-1" />
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: CMD.green }} />
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatusRow({ label, value, status }: { label: string; value: string | number; status: 'ok' | 'warn' | 'crit' }) {
  const statusColor = status === 'ok' ? CMD.green : status === 'warn' ? CMD.amber : CMD.red;
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
      <span className="text-[11px] font-mono" style={{ color: CMD.text }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-bold" style={{ color: CMD.bright }}>{value}</span>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
      </div>
    </div>
  );
}

export default function DashboardCommand() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(null);
  const [drillFindings, setDrillFindings] = useState<Finding[]>([]);
  const [latestScanId, setLatestScanId] = useState<number | undefined>();
  const [clock, setClock] = useState(new Date());
  const navigate = useNavigate();
  const { state, toast } = useApp();

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard(state.selectedOrg?.alias);
      setData(d);
      if (d.recent_scans.length > 0) setLatestScanId(d.recent_scans[0].id);
    } catch (e: any) {
      toast('Failed to load dashboard: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleDrill = useCallback(async (filter: DrillFilter) => {
    try {
      const { findings } = await api.getAllFindings(state.selectedOrg?.alias);
      setDrillFindings(findings);
      setDrillFilter(filter);
    } catch (e: any) {
      toast('Failed to load findings: ' + e.message, 'error');
    }
  }, [state.selectedOrg?.alias, toast]);

  if (loading) {
    return (
      <PageTransition>
        <div className="grid grid-cols-4 gap-2 p-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-40 rounded-lg animate-pulse" style={{ background: CMD.panel }} />
          ))}
        </div>
      </PageTransition>
    );
  }

  const stats = data?.stats;
  const ext = data?.extended;
  const history = (ext?.scan_history || []).slice().reverse();
  const latestScore = stats?.latest_health_score ?? null;
  const openIssues = (stats?.total_findings || 0) - (stats?.resolved_findings || 0);
  const critOpen = stats?.critical_unresolved || 0;
  const resolved = stats?.resolved_findings || 0;
  const totalFindings = stats?.total_findings || 0;

  const trendData = history.map(s => ({
    date: fmtShortDate(s.started_at),
    score: s.health_score || 0,
    findings: s.total_findings || 0,
    critical: s.critical_count || 0,
  }));

  const categoryEntries = Object.entries(ext?.latest_category_scores || {});
  const radarData = categoryEntries.map(([name, score]) => ({
    category: name.length > 10 ? name.substring(0, 8) + '..' : name,
    fullName: name,
    score,
  }));

  const severityData = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(name => ({
    name: SEVERITY_CMD[name]?.code || name,
    fullName: name,
    value: ext?.severity_totals?.[name] || 0,
    color: SEVERITY_CMD[name]?.color || CMD.text,
  })).filter(d => d.value > 0);

  const riskData = (ext?.top_risk_categories || []).slice(0, 6);

  return (
    <PageTransition>
      <div className="space-y-2 p-1">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-md border" style={{ background: CMD.headerBg, borderColor: CMD.border }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" style={{ color: CMD.green }} />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: CMD.green }}>COMMAND CENTER</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3" style={{ color: CMD.green }} />
              <span className="text-[10px] font-mono" style={{ color: CMD.text }}>CONNECTED</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono" style={{ color: CMD.text }}>
              SCANS: {stats?.total_scans || 0}
            </span>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: CMD.green }}>
              {clock.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </div>

        {/* Top Row: 4 panels */}
        <div className="grid grid-cols-12 gap-2">
          {/* HUD Score */}
          <Panel title="Health Index" icon={<Target className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-3">
            <div className="flex flex-col items-center py-2">
              <HUDScore score={latestScore} />
            </div>
          </Panel>

          {/* System Status */}
          <Panel title="System Status" icon={<Cpu className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-3">
            <StatusRow label="ORG_HEALTH" value={latestScore !== null ? `${latestScore}/100` : 'N/A'} status={latestScore !== null ? (latestScore >= 75 ? 'ok' : latestScore >= 50 ? 'warn' : 'crit') : 'warn'} />
            <StatusRow label="OPEN_ISSUES" value={openIssues} status={openIssues === 0 ? 'ok' : openIssues > 10 ? 'crit' : 'warn'} />
            <StatusRow label="CRITICAL" value={critOpen} status={critOpen === 0 ? 'ok' : 'crit'} />
            <StatusRow label="RESOLVED" value={resolved} status="ok" />
            <StatusRow label="AVG_SCORE" value={ext?.avg_score_last_5 ?? 'N/A'} status={(ext?.avg_score_last_5 ?? 0) >= 75 ? 'ok' : (ext?.avg_score_last_5 ?? 0) >= 50 ? 'warn' : 'crit'} />
            <StatusRow label="TOTAL_SCANS" value={stats?.total_scans || 0} status="ok" />
          </Panel>

          {/* Threat Matrix - Severity */}
          <Panel title="Threat Matrix" icon={<AlertOctagon className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-3" headerColor={CMD.amber}>
            {severityData.length === 0 ? (
              <div className="text-center py-8 text-[11px] font-mono" style={{ color: CMD.text }}>NO THREATS DETECTED</div>
            ) : (
              <div className="space-y-2.5">
                {severityData.map(s => {
                  const maxVal = Math.max(...severityData.map(d => d.value));
                  const pct = (s.value / maxVal) * 100;
                  return (
                    <button
                      key={s.name}
                      onClick={() => handleDrill({ type: 'severity', value: s.fullName, label: `${s.fullName} Findings` })}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: s.color + '20', color: s.color }}>{s.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-bold" style={{ color: s.color }}>{s.value}</span>
                      </div>
                      <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6 }}
                          className="h-full rounded-sm"
                          style={{ backgroundColor: s.color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Risk Sectors */}
          <Panel title="Risk Sectors" icon={<Crosshair className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-3" headerColor={CMD.red}>
            {riskData.length === 0 ? (
              <div className="text-center py-8 text-[11px] font-mono" style={{ color: CMD.text }}>NO RISK DATA</div>
            ) : (
              <div className="space-y-1.5">
                {riskData.map((risk, i) => (
                  <button
                    key={risk.category}
                    onClick={() => handleDrill({ type: 'category', value: risk.category, label: `${risk.category} Findings` })}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded transition-colors group"
                    style={{ background: i === 0 ? `${CMD.red}08` : 'transparent' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold w-5 text-right" style={{ color: CMD.text }}>#{i + 1}</span>
                      <span className="text-[11px] font-mono truncate group-hover:text-white transition-colors" style={{ color: CMD.bright }}>{risk.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold" style={{ color: i === 0 ? CMD.red : CMD.amber }}>{risk.cnt}</span>
                      <ChevronRight className="w-3 h-3" style={{ color: CMD.text }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Middle Row: Charts */}
        <div className="grid grid-cols-12 gap-2">
          {/* Score Trend */}
          <Panel title="Score Telemetry" icon={<Radio className="w-3.5 h-3.5" />} className="col-span-12 xl:col-span-5">
            {trendData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-[11px] font-mono" style={{ color: CMD.text }}>AWAITING TELEMETRY DATA</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="2 6" stroke="rgba(34, 197, 94, 0.06)" />
                    <XAxis dataKey="date" tick={{ fill: CMD.text, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: CMD.text, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: CMD.navy, border: `1px solid ${CMD.border}`, borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}
                      labelStyle={{ color: CMD.green }}
                      itemStyle={{ color: CMD.green }}
                    />
                    <Line type="linear" dataKey="score" stroke={CMD.green} strokeWidth={2} dot={{ fill: CMD.green, strokeWidth: 0, r: 3 }} />
                    <Line type="linear" dataKey="critical" stroke={CMD.red} strokeWidth={1} strokeDasharray="4 3" dot={{ fill: CMD.red, strokeWidth: 0, r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Radar */}
          <Panel title="Sector Analysis" icon={<Shield className="w-3.5 h-3.5" />} className="col-span-12 xl:col-span-4">
            {radarData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-[11px] font-mono" style={{ color: CMD.text }}>NO SECTOR DATA</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke="rgba(34, 197, 94, 0.08)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={({ x, y, payload, index }: any) => (
                        <text
                          x={x} y={y} fill={CMD.text} fontSize={8} fontFamily="monospace" fontWeight={600} textAnchor="middle" cursor="pointer"
                          onClick={() => {
                            const d = radarData[index];
                            if (d) handleDrill({ type: 'category', value: d.fullName, label: `${d.fullName} Findings` });
                          }}
                        >
                          {payload.value}
                        </text>
                      )}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: CMD.text, fontSize: 7, fontFamily: 'monospace' }} axisLine={false} />
                    <Radar dataKey="score" stroke={CMD.green} fill={CMD.green} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2, fill: CMD.green }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Findings Activity */}
          <Panel title="Activity Log" icon={<Terminal className="w-3.5 h-3.5" />} className="col-span-12 xl:col-span-3" headerColor={CMD.cyan}>
            {trendData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-[11px] font-mono" style={{ color: CMD.text }}>NO ACTIVITY</div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} barSize={12}>
                    <CartesianGrid strokeDasharray="2 6" stroke="rgba(6, 182, 212, 0.06)" />
                    <XAxis dataKey="date" tick={{ fill: CMD.text, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: CMD.text, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: CMD.navy, border: `1px solid ${CMD.border}`, borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <Bar dataKey="findings" radius={[2, 2, 0, 0]}>
                      {trendData.map((entry, i) => (
                        <Cell key={i} fill={entry.findings > 10 ? CMD.red : entry.findings > 5 ? CMD.amber : CMD.cyan} opacity={0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* Bottom Row: AI + Scan Log */}
        <div className="grid grid-cols-12 gap-2">
          {/* AI Intel */}
          {data?.recent_scans?.[0]?.summary && (
            <Panel title="AI Intelligence" icon={<Cpu className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-4" headerColor={CMD.cyan}>
              <div className="font-mono">
                <div className="text-[10px] mb-2" style={{ color: CMD.cyan }}>
                  &gt; analysis.run() <span className="animate-pulse">_</span>
                </div>
                <p className="text-[11px] leading-relaxed line-clamp-4" style={{ color: CMD.bright }}>
                  {data.recent_scans[0].summary}
                </p>
                <div className="text-[9px] mt-3" style={{ color: CMD.text }}>
                  GENERATED: {timeAgo(data.recent_scans[0].completed_at || data.recent_scans[0].started_at)}
                </div>
              </div>
            </Panel>
          )}

          {/* Scan Log */}
          <Panel
            title="Mission Log"
            icon={<Terminal className="w-3.5 h-3.5" />}
            className={`col-span-12 ${data?.recent_scans?.[0]?.summary ? 'lg:col-span-5' : 'lg:col-span-8'}`}
          >
            {(!data?.recent_scans || data.recent_scans.length === 0) ? (
              <div className="text-center py-6 text-[11px] font-mono" style={{ color: CMD.text }}>NO MISSIONS LOGGED</div>
            ) : (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {data.recent_scans.map((s, i) => {
                  const sColor = (s.health_score || 0) >= 75 ? CMD.green : (s.health_score || 0) >= 50 ? CMD.amber : CMD.red;
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/scans/${s.id}`)}
                      className="w-full flex items-center gap-3 py-1.5 px-2 rounded text-left transition-colors group hover:bg-white/[0.02]"
                    >
                      <span className="text-[9px] font-mono" style={{ color: CMD.text }}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sColor }} />
                      <span className="text-[11px] font-mono flex-1 truncate group-hover:text-white transition-colors" style={{ color: CMD.bright }}>{s.org_alias}</span>
                      <span className="text-[10px] font-mono font-bold" style={{ color: sColor }}>{s.health_score || 0}</span>
                      <span className="text-[9px] font-mono" style={{ color: CMD.text }}>{s.total_findings || 0}F</span>
                      <span className="text-[9px] font-mono" style={{ color: CMD.text }}>{timeAgo(s.started_at)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Quick Ops */}
          <Panel title="Operations" icon={<Crosshair className="w-3.5 h-3.5" />} className="col-span-12 lg:col-span-3" headerColor={CMD.amber}>
            <div className="space-y-1.5">
              {[
                { label: 'INITIATE SCAN', code: 'scan.new()', action: () => navigate('/scans/new'), color: CMD.green },
                { label: 'VIEW MISSIONS', code: 'scan.list()', action: () => navigate('/scans'), color: CMD.cyan },
                { label: 'CONFIG', code: 'sys.settings()', action: () => navigate('/settings'), color: CMD.amber },
              ].map(op => (
                <button
                  key={op.label}
                  onClick={op.action}
                  className="w-full flex items-center justify-between py-2 px-2.5 rounded border transition-all group hover:border-opacity-40"
                  style={{ borderColor: `${op.color}20`, background: `${op.color}05` }}
                >
                  <div>
                    <span className="text-[10px] font-mono font-bold block group-hover:text-white transition-colors" style={{ color: op.color }}>{op.label}</span>
                    <span className="text-[9px] font-mono" style={{ color: CMD.text }}>{op.code}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" style={{ color: op.color }} />
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* Footer Status */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-md border" style={{ background: CMD.headerBg, borderColor: CMD.border }}>
          <div className="flex items-center gap-4">
            <span className="text-[9px] font-mono" style={{ color: CMD.text }}>
              FINDINGS: {totalFindings} | RESOLVED: {resolved} | OPEN: {openIssues} | CRITICAL: {critOpen}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: critOpen > 0 ? CMD.red : CMD.green, boxShadow: `0 0 6px ${critOpen > 0 ? CMD.red : CMD.green}80` }} />
            <span className="text-[9px] font-mono" style={{ color: critOpen > 0 ? CMD.red : CMD.green }}>
              {critOpen > 0 ? 'THREATS ACTIVE' : 'ALL CLEAR'}
            </span>
          </div>
        </div>
      </div>

      <ChartDrillModal
        filter={drillFilter}
        findings={drillFindings}
        scanId={latestScanId}
        onClose={() => setDrillFilter(null)}
        onFindingsChange={() => { load(); api.getAllFindings(state.selectedOrg?.alias).then(r => setDrillFindings(r.findings)); }}
      />
    </PageTransition>
  );
}
