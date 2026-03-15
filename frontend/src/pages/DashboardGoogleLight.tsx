import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Search, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import PageTransition from '@/components/layout/PageTransition';
import { api } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { fmtShortDate, timeAgo } from '@/utils/formatters';
import { scoreGrade } from '@/utils/scoreHelpers';
import type { DashboardData, DrillFilter, Finding } from '@/api/types';
import ChartDrillModal from '@/components/charts/ChartDrillModal';

/*
 * Google Material You - LIGHT theme.
 * Bright, joyful, colorful. Dynamic color from seed, large shapes,
 * Google's 4 brand colors, tonal surface system, playful motion.
 */

const G = {
  bg: '#FFFBFE',
  surface: '#FFFFFF',
  surfaceVariant: '#E7E0EC',
  surfaceContainer: '#F3EDF7',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainerHigh: '#ECE6F0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  primary: '#6750A4',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondary: '#625B71',
  secondaryContainer: '#E8DEF8',
  tertiary: '#7D5260',
  tertiaryContainer: '#FFD8E4',
  error: '#B3261E',
  errorContainer: '#F9DEDC',
  gBlue: '#4285F4',
  gRed: '#EA4335',
  gYellow: '#FBBC04',
  gGreen: '#34A853',
  shadow: 'rgba(0,0,0,0.08)',
};

const SEV_GL: Record<string, { color: string; bg: string; text: string }> = {
  Critical: { color: '#B3261E', bg: '#F9DEDC', text: '#410E0B' },
  High: { color: '#E8710A', bg: '#FEEFC3', text: '#594300' },
  Medium: { color: '#E37400', bg: '#FFF0C7', text: '#4B3800' },
  Low: { color: '#1E8E3E', bg: '#CEEAD6', text: '#0D3F1C' },
  Info: { color: '#1A73E8', bg: '#D3E3FD', text: '#003A75' },
};

function GCard({ children, className = '', elevated, onClick }: { children: React.ReactNode; className?: string; elevated?: boolean; onClick?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      onClick={onClick}
      className={`rounded-[28px] ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: elevated ? G.surface : G.surfaceContainerLow,
        boxShadow: elevated ? `0 1px 3px ${G.shadow}, 0 1px 2px ${G.shadow}` : 'none',
      }}
    >
      {children}
    </motion.div>
  );
}

function GChip({ label, selected, color, onClick }: { label: string; selected?: boolean; color?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[14px] font-medium transition-all"
      style={selected
        ? { background: color || G.secondaryContainer, color: G.onSurface }
        : { background: 'transparent', border: `1px solid ${G.outline}`, color: G.onSurfaceVariant }
      }
    >
      {label}
    </button>
  );
}

function GScoreCircle({ score, size = 140 }: { score: number; size?: number }) {
  const [animated, setAnimated] = useState(0);
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const dur = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setAnimated(Math.round(e * score));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  const offset = circ - (animated / 100) * circ;
  const color = score >= 75 ? G.gGreen : score >= 50 ? G.gYellow : G.gRed;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={G.surfaceContainerHigh} strokeWidth={12} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={12}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-normal" style={{ color: G.onSurface }}>{animated}</span>
        <span className="text-[12px] font-medium" style={{ color: G.onSurfaceVariant }}>{scoreGrade(score)}</span>
      </div>
    </div>
  );
}

export default function DashboardGoogleLight() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(null);
  const [drillFindings, setDrillFindings] = useState<Finding[]>([]);
  const [latestScanId, setLatestScanId] = useState<number | undefined>();
  const navigate = useNavigate();
  const { state, toast } = useApp();

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard(state.selectedOrg?.alias);
      setData(d);
      if (d.recent_scans.length > 0) setLatestScanId(d.recent_scans[0].id);
    } catch (e: any) {
      toast('Failed to load: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, state.selectedOrg?.alias]);

  useEffect(() => { load(); }, [load]);

  const handleDrill = useCallback(async (filter: DrillFilter) => {
    if (!latestScanId) return;
    try {
      const scan = await api.getScan(latestScanId);
      setDrillFindings(scan.findings || []);
      setDrillFilter(filter);
    } catch (e: any) {
      toast('Failed to load findings: ' + e.message, 'error');
    }
  }, [latestScanId, toast]);

  if (loading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-5" style={{ background: G.bg }}>
          {[160, 300].map((h, i) => (
            <div key={i} className="rounded-[28px] animate-pulse" style={{ background: G.surfaceContainerLow, height: h }} />
          ))}
        </div>
      </PageTransition>
    );
  }

  const stats = data?.stats;
  const ext = data?.extended;
  const history = (ext?.scan_history || []).slice().reverse();
  const latestScore = stats?.latest_health_score ?? 0;
  const openIssues = (stats?.total_findings || 0) - (stats?.resolved_findings || 0);
  const critOpen = stats?.critical_unresolved || 0;
  const avgScore = ext?.avg_score_last_5 ?? 0;

  const trendData = history.map(s => ({ date: fmtShortDate(s.started_at), score: s.health_score || 0, findings: s.total_findings || 0 }));
  const delta = trendData.length >= 2 ? trendData[trendData.length - 1].score - trendData[trendData.length - 2].score : 0;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const categoryEntries = Object.entries(ext?.latest_category_scores || {}).sort((a, b) => b[1] - a[1]);
  const radarData = categoryEntries.map(([name, score]) => ({ category: name.length > 12 ? name.substring(0, 10) + '..' : name, fullName: name, score }));
  const severityEntries = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(n => ({ name: n, value: ext?.severity_totals?.[n] || 0 })).filter(d => d.value > 0);
  const totalSev = severityEntries.reduce((a, b) => a + b.value, 0);

  return (
    <PageTransition>
      <div className="p-6 space-y-5 min-h-screen" style={{ background: G.bg }}>
        {/* Hero */}
        <GCard className="p-8" elevated>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <GScoreCircle score={latestScore} />
              <div>
                <h2 className="text-[22px] font-normal" style={{ color: G.onSurface }}>Org Health</h2>
                <p className="text-[14px] mt-1" style={{ color: G.onSurfaceVariant }}>
                  Your Salesforce org health overview
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <TrendIcon className="w-4 h-4" style={{ color: delta >= 0 ? G.gGreen : G.gRed }} />
                  <span className="text-[14px] font-medium" style={{ color: delta >= 0 ? G.gGreen : G.gRed }}>
                    {delta > 0 ? '+' : ''}{delta} from previous
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              {[
                { label: 'Average', value: avgScore, color: G.gBlue, bg: '#D3E3FD' },
                { label: 'Open Issues', value: openIssues, color: '#E8710A', bg: '#FEEFC3' },
                { label: 'Critical', value: critOpen, color: G.gRed, bg: '#F9DEDC' },
              ].map(s => (
                <div key={s.label} className="px-6 py-4 rounded-2xl text-center min-w-[100px]" style={{ background: s.bg }}>
                  <span className="text-2xl font-medium block" style={{ color: s.color }}>{s.value}</span>
                  <span className="text-[12px] font-medium" style={{ color: G.onSurfaceVariant }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </GCard>

        {/* Severity Chips */}
        {severityEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2">
            {severityEntries.map(d => {
              const sev = SEV_GL[d.name];
              return (
                <button
                  key={d.name}
                  onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[14px] font-medium transition-all hover:shadow-sm"
                  style={{ background: sev.bg, color: sev.text }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: sev.color }} />
                  {d.name}
                  <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: `${sev.color}15` }}>{d.value}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* AI Summary */}
        {data?.recent_scans?.[0]?.summary && (
          <GCard className="p-5" elevated>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #4285F4, #34A853, #FBBC04, #EA4335)' }}>
                <span className="text-[11px] font-bold text-white">G</span>
              </div>
              <div>
                <span className="text-[12px] font-medium" style={{ color: G.primary }}>Gemini Summary</span>
                <p className="text-[14px] leading-relaxed mt-1 line-clamp-2" style={{ color: G.onSurface }}>{data.recent_scans[0].summary}</p>
              </div>
            </div>
          </GCard>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Score Trend */}
          <GCard className="p-5" elevated>
            <h3 className="text-[16px] font-medium mb-4" style={{ color: G.onSurface }}>Score Trend</h3>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: G.onSurfaceVariant }}>No data yet</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="glGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={G.gBlue} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={G.gBlue} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={G.outlineVariant + '60'} />
                    <XAxis dataKey="date" tick={{ fill: G.onSurfaceVariant, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: G.onSurfaceVariant, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: G.surface, border: `1px solid ${G.outlineVariant}`, borderRadius: 16, fontSize: 13, boxShadow: `0 4px 12px ${G.shadow}` }} />
                    <Area type="monotone" dataKey="score" stroke={G.gBlue} strokeWidth={2.5} fill="url(#glGrad)" dot={{ fill: G.gBlue, strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: G.surface, stroke: G.gBlue, strokeWidth: 2.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </GCard>

          {/* Radar */}
          <GCard className="p-5" elevated>
            <h3 className="text-[16px] font-medium mb-4" style={{ color: G.onSurface }}>Category Radar</h3>
            {radarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: G.onSurfaceVariant }}>No data</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke={G.outlineVariant} />
                    <PolarAngleAxis dataKey="category" tick={{ fill: G.onSurfaceVariant, fontSize: 9, fontWeight: 500 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: G.outline, fontSize: 8 }} axisLine={false} />
                    <Radar dataKey="score" stroke={G.primary} fill={G.primaryContainer} fillOpacity={0.5} strokeWidth={2} dot={{ r: 3, fill: G.primary }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GCard>

          {/* Severity Donut */}
          <GCard className="p-5" elevated>
            <h3 className="text-[16px] font-medium mb-4" style={{ color: G.onSurface }}>Findings Breakdown</h3>
            {totalSev === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: G.onSurfaceVariant }}>No findings</div>
            ) : (
              <div className="flex items-center gap-6">
                <div className="w-36 h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityEntries} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="value" stroke={G.surface} strokeWidth={3} paddingAngle={2}>
                        {severityEntries.map(d => <Cell key={d.name} fill={SEV_GL[d.name]?.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {severityEntries.map(d => (
                    <button
                      key={d.name}
                      onClick={() => handleDrill({ type: 'severity', value: d.name, label: `${d.name} Findings` })}
                      className="w-full flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: SEV_GL[d.name]?.color }} />
                        <span className="text-[14px]" style={{ color: G.onSurface }}>{d.name}</span>
                      </div>
                      <span className="text-[14px] font-medium" style={{ color: G.onSurfaceVariant }}>{d.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </GCard>

          {/* Findings per Scan */}
          <GCard className="p-5" elevated>
            <h3 className="text-[16px] font-medium mb-4" style={{ color: G.onSurface }}>Scan Activity</h3>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[14px]" style={{ color: G.onSurfaceVariant }}>No scans</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={G.outlineVariant + '60'} />
                    <XAxis dataKey="date" tick={{ fill: G.onSurfaceVariant, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: G.onSurfaceVariant, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: G.surface, border: `1px solid ${G.outlineVariant}`, borderRadius: 16, fontSize: 13, boxShadow: `0 4px 12px ${G.shadow}` }} />
                    <Bar dataKey="findings" radius={[10, 10, 0, 0]} barSize={20}>
                      {trendData.map((_, i) => {
                        const colors = [G.gBlue, G.gRed, G.gGreen, G.gYellow];
                        return <Cell key={i} fill={colors[i % 4]} opacity={0.75} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GCard>
        </div>

        {/* Categories */}
        {categoryEntries.length > 0 && (
          <GCard className="p-5" elevated>
            <h3 className="text-[16px] font-medium mb-4" style={{ color: G.onSurface }}>Category Health</h3>
            <div className="grid grid-cols-2 gap-4">
              {categoryEntries.map(([name, score], i) => {
                const colors = [G.gBlue, G.gGreen, G.gYellow, G.gRed, G.primary, '#E8710A', '#1A73E8', '#34A853'];
                const color = score >= 75 ? G.gGreen : score >= 50 ? G.gYellow : G.gRed;
                return (
                  <button
                    key={name}
                    onClick={() => handleDrill({ type: 'category', value: name, label: `${name} Findings` })}
                    className="text-left group p-3 rounded-2xl transition-colors"
                    style={{ background: G.surfaceContainerLow }}
                    onMouseEnter={e => (e.currentTarget.style.background = G.surfaceContainerHigh)}
                    onMouseLeave={e => (e.currentTarget.style.background = G.surfaceContainerLow)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[14px] font-medium truncate mr-2" style={{ color: G.onSurface }}>{name}</span>
                      <span className="text-[14px] font-medium" style={{ color }}>{score}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: G.surfaceContainerHigh }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score}%` }}
                        transition={{ duration: 0.8, delay: i * 0.05 }}
                        className="h-full rounded-full"
                        style={{ background: color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </GCard>
        )}

        {/* Recent Scans */}
        <GCard className="overflow-hidden" elevated>
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-[16px] font-medium" style={{ color: G.onSurface }}>Recent Scans</h3>
            <button onClick={() => navigate('/scans')} className="text-[14px] font-medium" style={{ color: G.primary }}>View all</button>
          </div>
          {(!data?.recent_scans || data.recent_scans.length === 0) ? (
            <div className="px-6 pb-6 text-center py-8 text-[14px]" style={{ color: G.onSurfaceVariant }}>Start your first scan!</div>
          ) : (
            <div>
              {data.recent_scans.map((s, i) => {
                const sColor = (s.health_score || 0) >= 75 ? G.gGreen : (s.health_score || 0) >= 50 ? G.gYellow : G.gRed;
                const bgColor = (s.health_score || 0) >= 75 ? '#CEEAD6' : (s.health_score || 0) >= 50 ? '#FEEFC3' : '#F9DEDC';
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/scans/${s.id}`)}
                    className="w-full flex items-center px-6 py-4 transition-colors text-left group"
                    style={{ borderTop: i > 0 ? `1px solid ${G.outlineVariant}40` : undefined }}
                    onMouseEnter={e => (e.currentTarget.style.background = G.surfaceContainerLow)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mr-4" style={{ background: bgColor }}>
                      <span className="text-[15px] font-medium" style={{ color: sColor }}>{s.health_score || 0}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-medium block" style={{ color: G.onSurface }}>{s.org_alias}</span>
                      <span className="text-[13px]" style={{ color: G.onSurfaceVariant }}>{timeAgo(s.started_at)} &middot; {s.total_findings || 0} findings</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </GCard>
      </div>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/scans/new')}
        className="fixed bottom-6 right-6 h-14 px-5 rounded-2xl flex items-center gap-2 z-30 text-[15px] font-medium"
        style={{ background: G.primaryContainer, color: G.onPrimaryContainer, boxShadow: `0 3px 8px ${G.shadow}, 0 6px 20px ${G.shadow}` }}
      >
        <Plus className="w-5 h-5" /> New Scan
      </motion.button>

      <ChartDrillModal
        filter={drillFilter}
        findings={drillFindings}
        scanId={latestScanId}
        onClose={() => setDrillFilter(null)}
        onFindingsChange={() => { load(); if (latestScanId) api.getScan(latestScanId).then(s => setDrillFindings(s.findings || [])); }}
      />
    </PageTransition>
  );
}
