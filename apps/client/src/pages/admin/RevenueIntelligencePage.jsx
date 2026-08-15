import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Calendar, Users, BarChart2, RefreshCw, Zap, Cpu, Loader2,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getMrrMovements, getCashFlowForecast, getCohortRetention, getForecast, triggerForecast } from '../../services/adminService.js';

// ── Colors for Recharts ────────────────────────────────────────────────────────
const ACCENT   = '#6c63ff';
const GREEN    = '#4ade80';
const RED      = '#f87171';
const ORANGE   = '#fb923c';
const BLUE     = '#60a5fa';
const PURPLE   = '#c084fc';
const MUTED    = 'var(--color-text-muted)';
const BORDER   = 'var(--color-border)';

function formatINR(paise) {
  if (paise == null) return '—';
  const r = Math.round(paise / 100);
  return '₹' + r.toLocaleString('en-IN');
}

function KpiCard({ label, value, sub, icon: Icon, colorClass = 'text-primary', bgClass = 'bg-primary/15', badge }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2.5 shadow-sm transition-colors hover:border-border/80">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-muted uppercase tracking-[0.06em]">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgClass}`}>
          <Icon size={15} className={colorClass} />
        </div>
      </div>
      <div>
        <p className="m-0 text-[26px] font-bold text-text-primary tracking-tight leading-none">{value}</p>
        {sub && <p className="m-0 mt-1.5 text-[12px] text-text-muted font-medium">{sub}</p>}
      </div>
      {badge && (
        <span className={`self-start px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.bgClass} ${badge.colorClass}`}>
          {badge.label}
        </span>
      )}
    </div>
  );
}

// Custom Recharts tooltip
function MrrTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-[12px] text-text-primary shadow-md">
      <p className="m-0 mb-2 font-bold text-text-primary">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="m-0 my-1 font-medium" style={{ color: p.fill || p.color }}>
          {p.name}: {formatINR(p.value * 100)}
        </p>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-5 gap-4">
      <div>
        <h2 className="m-0 text-[18px] font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="m-0 mt-1 text-[13px] text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── MRR Waterfall Section ─────────────────────────────────────────────────────
function MrrWaterfall({ data, loading }) {
  if (loading) return <Skeleton h={320} />;
  if (!data?.length) return <Empty msg="No MRR data available" />;

  // Latest month summary
  const latest   = data[data.length - 1];
  const nrrColorClass = latest?.nrr >= 100 ? 'text-emerald-500' : latest?.nrr >= 80 ? 'text-orange-500' : 'text-red-500';
  const nrrBgClass = latest?.nrr >= 100 ? 'bg-emerald-500/15' : latest?.nrr >= 80 ? 'bg-orange-500/15' : 'bg-red-500/15';

  const qrColorClass = latest?.quickRatio >= 4 ? 'text-emerald-500' : latest?.quickRatio >= 2 ? 'text-orange-500' : 'text-red-500';
  const qrBgClass = latest?.quickRatio >= 4 ? 'bg-emerald-500/15' : latest?.quickRatio >= 2 ? 'bg-orange-500/15' : 'bg-red-500/15';

  const chartData = data.map(d => ({
    month:       d.month,
    'New MRR':         Math.round((d.newMrr || 0) / 100),
    'Expansion':       Math.round((d.expansionMrr || 0) / 100),
    'Reactivation':    Math.round((d.reactivationMrr || 0) / 100),
    'Contraction':    -Math.round((d.contractionMrr || 0) / 100),
    'Churned':        -Math.round((d.churnedMrr || 0) / 100),
    'Ending MRR':      Math.round((d.endingMrr || 0) / 100),
    nrr:               d.nrr,
    quickRatio:        d.quickRatio,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ending MRR"
          value={formatINR((latest?.endingMrr || 0))}
          sub={`Net New: ${latest?.netNewMrr >= 0 ? '+' : ''}${formatINR(latest?.netNewMrr || 0)}`}
          icon={DollarSign} colorClass="text-primary" bgClass="bg-primary/15"
        />
        <KpiCard
          label="Net Revenue Retention"
          value={`${latest?.nrr ?? '—'}%`}
          sub="NRR > 100% = net growth"
          icon={TrendingUp} colorClass={nrrColorClass} bgClass={nrrBgClass}
          badge={{ label: latest?.nrr >= 100 ? '🟢 Healthy' : latest?.nrr >= 80 ? '🟡 Watch' : '🔴 At Risk', colorClass: nrrColorClass, bgClass: nrrBgClass }}
        />
        <KpiCard
          label="Quick Ratio"
          value={latest?.quickRatio != null ? `${latest.quickRatio}×` : 'N/A'}
          sub="Growth ÷ Churn. Target: >4"
          icon={BarChart2} colorClass="text-blue-500" bgClass="bg-blue-500/15"
          badge={latest?.quickRatio != null ? { label: latest.quickRatio >= 4 ? '🟢 Strong' : latest.quickRatio >= 2 ? '🟡 Ok' : '🔴 Low', colorClass: qrColorClass, bgClass: qrBgClass } : null}
        />
        <KpiCard
          label="Churned MRR"
          value={formatINR(latest?.churnedMrr || 0)}
          sub={`Expansion: ${formatINR(latest?.expansionMrr || 0)}`}
          icon={TrendingDown} colorClass="text-red-500" bgClass="bg-red-500/15"
        />
      </div>

      {/* Stacked Bar Chart */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <p className="m-0 mb-4 text-[14px] font-semibold text-text-primary">Monthly MRR Movements</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `₹${Math.abs(v).toLocaleString('en-IN')}`} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<MrrTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />
              <Bar dataKey="New MRR"      fill={GREEN}  radius={[3,3,0,0]} stackId="pos" />
              <Bar dataKey="Expansion"    fill={BLUE}   radius={[3,3,0,0]} stackId="pos" />
              <Bar dataKey="Reactivation" fill={PURPLE} radius={[3,3,0,0]} stackId="pos" />
              <Bar dataKey="Contraction"  fill={ORANGE} radius={[0,0,3,3]} stackId="neg" />
              <Bar dataKey="Churned"      fill={RED}    radius={[0,0,3,3]} stackId="neg" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/50">
                {['Month','Begin','New','Expansion','Contraction','Churned','Net New','Ending','NRR','QR'].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-right font-semibold text-text-muted uppercase tracking-[0.05em] text-[10px] whitespace-nowrap first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.month} className="border-b border-border transition-colors hover:bg-surface-secondary/40 last:border-0">
                  <td className="px-3.5 py-2.5 text-text-primary font-bold">{d.month}</td>
                  {[d.beginMrr, d.newMrr, d.expansionMrr, d.contractionMrr, d.churnedMrr, d.netNewMrr, d.endingMrr].map((v, i) => (
                    <td key={i} className={`px-3.5 py-2.5 text-right font-mono font-medium whitespace-nowrap ${
                      [5].includes(i) ? (v >= 0 ? 'text-emerald-500' : 'text-red-500') : 'text-text-primary'
                    }`}>
                      {i === 5 && v >= 0 ? '+' : ''}{formatINR(v)}
                    </td>
                  ))}
                  <td className={`px-3.5 py-2.5 text-right font-bold whitespace-nowrap ${
                    d.nrr >= 100 ? 'text-emerald-500' : d.nrr >= 80 ? 'text-orange-500' : 'text-red-500'
                  }`}>{d.nrr ?? '—'}%</td>
                  <td className="px-3.5 py-2.5 text-right text-text-muted font-medium whitespace-nowrap">{d.quickRatio != null ? `${d.quickRatio}×` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Cash Flow Calendar ─────────────────────────────────────────────────────
function CashFlowCalendar({ data, loading }) {
  if (loading) return <Skeleton h={220} />;
  if (!data?.length) return <Empty msg="No upcoming renewals" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {data.map(m => {
        const atRiskPct = m.expectedMrr > 0 ? Math.round((m.atRiskMrr / m.expectedMrr) * 100) : 0;
        return (
          <div key={m.month} className="bg-surface border border-border rounded-2xl p-6 relative overflow-hidden shadow-sm hover:border-border/80 transition-colors">
            {/* Accent bar at top */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-purple-400 opacity-90" />
            <div className="flex items-center justify-between mb-4 mt-1">
              <span className="text-[14px] font-bold text-text-primary">{m.month}</span>
              <Calendar size={15} className="text-text-muted" />
            </div>
            <p className="m-0 mb-1 text-[24px] font-bold text-text-primary leading-tight">{formatINR(m.expectedMrr)}</p>
            <p className="m-0 mb-4 text-[12px] font-medium text-text-muted">{m.renewalCount} renewal{m.renewalCount !== 1 ? 's' : ''}</p>
            {m.atRiskMrr > 0 ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle size={13} className="text-red-500" />
                <span className="text-[12px] font-semibold text-red-500">{formatINR(m.atRiskMrr)} at risk ({atRiskPct}%)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[12px] font-semibold text-emerald-500">✓ No at-risk renewals</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Cohort Retention Heat-Map ─────────────────────────────────────────────────
function CohortHeatMap({ data, loading }) {
  if (loading) return <Skeleton h={260} />;
  if (!data?.length || data.every(d => d.cohortSize === 0)) return <Empty msg="Not enough data for cohort analysis (need ≥1 month of subscriptions)" />;

  // Color scale: 100% = green, 50% = orange, 0% = red
  function cellColor(pct) {
    if (pct == null) return 'transparent';
    if (pct >= 85) return `rgba(74,222,128,${0.1 + pct / 200})`;
    if (pct >= 60) return `rgba(251,146,60,${0.1 + (100-pct) / 300})`;
    return `rgba(248,113,113,${0.12 + (100-pct) / 250})`;
  }
  function cellTextClass(pct) {
    if (pct >= 85) return 'text-emerald-500';
    if (pct >= 60) return 'text-orange-500';
    return 'text-red-500';
  }

  const maxCols = Math.max(...data.map(d => d.retention.length));

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-x-auto shadow-sm p-4">
      <table className="w-full border-separate border-spacing-[3px] text-[12px] table-fixed min-w-[600px]">
        <thead>
          <tr>
            <th className="text-left px-2.5 py-1 text-text-muted font-semibold text-[11px] uppercase tracking-[0.06em] whitespace-nowrap w-[90px]">Cohort</th>
            <th className="text-center px-2 py-1 text-text-muted font-semibold text-[11px] uppercase tracking-[0.06em] w-[60px]">Size</th>
            {Array.from({ length: maxCols }, (_, i) => (
              <th key={i} className="text-center px-2 py-1 text-text-muted font-semibold text-[11px] uppercase w-[60px]">
                M+{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.cohort}>
              <td className="px-2.5 py-1.5 text-text-primary font-bold whitespace-nowrap">{row.cohort}</td>
              <td className="px-2 py-1.5 text-center font-medium text-text-muted">{row.cohortSize}</td>
              {row.retention.map((pct, i) => (
                <td key={i} className={`px-2 py-1.5 text-center font-bold rounded-lg transition-colors ${cellTextClass(pct)}`} style={{ background: cellColor(pct) }}>
                  {pct}%
                </td>
              ))}
              {/* Empty cells for missing months */}
              {Array.from({ length: maxCols - row.retention.length }, (_, i) => (
                <td key={`e-${i}`} className="px-2 py-1.5 text-center text-text-muted/30 text-[10px]">—</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Utility components ────────────────────────────────────────────────────────
function Skeleton({ h = 200 }) {
  return (
    <div className="bg-surface border border-border rounded-2xl flex items-center justify-center shadow-sm" style={{ height: h }}>
      <Loader2 size={36} className="text-primary animate-spin" />
    </div>
  );
}
function Empty({ msg }) {
  return (
    <div className="bg-surface border border-border rounded-2xl text-center p-12 text-text-muted text-[14px] font-medium shadow-sm">{msg}</div>
  );
}

// ── Forecast Chart ────────────────────────────────────────────────────────────
function ForecastChart({ data, loading, onTrigger, triggering }) {
  if (loading) return <Skeleton h={320} />;
  if (!data) return (
    <div className="bg-surface border border-border rounded-2xl text-center p-16 shadow-sm">
      <Cpu size={48} className="mx-auto mb-4 opacity-40 text-text-muted block" />
      <p className="m-0 mb-1.5 text-[16px] text-text-primary font-bold">No forecast generated yet</p>
      <p className="m-0 mb-5 text-[13px] text-text-muted max-w-sm mx-auto">Click the button below to compute a 3-month MRR forecast using linear regression + AI narrative.</p>
      <button
        onClick={onTrigger}
        disabled={triggering}
        className="px-6 py-2.5 rounded-xl border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[14px] font-semibold flex items-center gap-2 justify-center mx-auto transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {triggering ? <Loader2 size={16} className="animate-spin" /> : '⚡'}
        {triggering ? 'Computing…' : 'Generate Forecast'}
      </button>
    </div>
  );

  const { forecastMonths, trend, confidence, narrative, modelVersion, computedAt } = data;
  const trendColorClass = trend === 'growth' ? 'text-emerald-500' : trend === 'decline' ? 'text-red-500' : 'text-orange-500';

  // Build chart data
  const chartData = (forecastMonths || []).map(m => ({
    month:    m.month,
    forecast: Math.round(m.forecastedMrr / 100),
    low:      Math.round(m.low / 100),
    high:     Math.round(m.high / 100),
  }));

  const ForecastTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-[12px] text-text-primary shadow-md">
        <p className="m-0 mb-1.5 font-bold">{label}</p>
        <p className="m-0 my-0.5 text-primary font-semibold">Forecast: {formatINR(payload[0]?.payload?.forecast)}</p>
        <p className="m-0 my-0.5 text-text-muted text-[11px] font-medium">Range: {formatINR(payload[0]?.payload?.low)} &ndash; {formatINR(payload[0]?.payload?.high)}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          <p className="m-0 mb-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em]">Trend</p>
          <p className={`m-0 text-[22px] font-bold ${trendColorClass}`}>
            {trend === 'growth' ? '📈 Growth' : trend === 'decline' ? '📉 Decline' : '➡️ Stable'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          <p className="m-0 mb-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em]">Confidence</p>
          <p className={`m-0 mb-2 text-[22px] font-bold ${confidence >= 70 ? 'text-emerald-500' : confidence >= 40 ? 'text-orange-500' : 'text-red-500'}`}>{confidence}%</p>
          <div className="w-full h-1.5 rounded bg-surface-secondary overflow-hidden">
            <div 
              className={`h-full rounded transition-all ${confidence >= 70 ? 'bg-emerald-500' : confidence >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} 
              style={{ width: `${confidence}%` }} 
            />
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          <p className="m-0 mb-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em]">3-Month Projection</p>
          <p className="m-0 text-[22px] font-bold text-text-primary">
            {chartData.length ? formatINR(chartData[chartData.length - 1].forecast) : '—'}
          </p>
          <p className="m-0 mt-1 text-[11px] font-medium text-text-muted">Ending MRR by {chartData[chartData.length - 1]?.month}</p>
        </div>
      </div>

      {/* Area chart */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="m-0 text-[14px] font-bold text-text-primary">3-Month MRR Forecast</p>
          <span className="text-[11px] font-medium text-text-muted">Shaded band = &plusmn;1.5&sigma; confidence interval</span>
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `₹${v.toLocaleString('en-IN')}`} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ForecastTooltip />} />
              <Area type="monotone" dataKey="high"     stroke="transparent" fill={`${ACCENT}18`} />
              <Area type="monotone" dataKey="forecast" stroke={ACCENT} strokeWidth={2.5} fill="url(#forecastGrad)" dot={{ fill: ACCENT, r: 5, strokeWidth: 2, stroke: '#1a1a2e' }} />
              <Area type="monotone" dataKey="low"      stroke="transparent" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Narrative */}
      {narrative && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <Cpu size={15} className="text-primary" />
            <span className="text-[12px] font-bold text-primary uppercase tracking-[0.05em]">AI Insight</span>
            <span className="text-[11px] font-medium text-text-muted ml-auto">via {modelVersion || 'AI'} &middot; {computedAt ? new Date(computedAt).toLocaleString() : ''}</span>
          </div>
          <p className="m-0 text-[14px] text-text-primary leading-relaxed font-medium">{narrative}</p>
        </div>
      )}

      {/* Trigger recompute */}
      <div className="flex justify-end mt-2">
        <button
          onClick={onTrigger}
          disabled={triggering}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary cursor-pointer text-[13px] font-semibold disabled:opacity-70 disabled:cursor-not-allowed hover:bg-primary/15 transition-colors"
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} 
          {triggering ? 'Computing…' : 'Recompute Forecast'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RevenueIntelligencePage() {
  const [tab, setTab] = useState('mrr');
  const socketRef = useRef(null);

  const [mrrData,       setMrrData]       = useState([]);
  const [cashData,      setCashData]      = useState([]);
  const [cohortData,    setCohortData]    = useState([]);
  const [forecastData,  setForecastData]  = useState(null);
  const [mrrLoading,    setMrrLoading]    = useState(true);
  const [cashLoading,   setCashLoading]   = useState(true);
  const [cohortLoading, setCohortLoading] = useState(true);
  const [forecastLoading,setForecastLoading] = useState(true);
  const [triggering,    setTriggering]    = useState(false);
  const [lastRefresh,   setLastRefresh]   = useState(null);

  const loadAll = async () => {
    setMrrLoading(true); setCashLoading(true); setCohortLoading(true); setForecastLoading(true);
    try { const r = await getMrrMovements(6);      setMrrData(r.data.data   || []); } catch { setMrrData([]); }
    finally { setMrrLoading(false); }
    try { const r = await getCashFlowForecast(3);  setCashData(r.data.data  || []); } catch { setCashData([]); }
    finally { setCashLoading(false); }
    try { const r = await getCohortRetention(6);   setCohortData(r.data.data|| []); } catch { setCohortData([]); }
    finally { setCohortLoading(false); }
    try { const r = await getForecast();            setForecastData(r.data.data || null); } catch { setForecastData(null); }
    finally { setForecastLoading(false); setLastRefresh(new Date()); }
  };

  const handleTriggerForecast = async () => {
    setTriggering(true);
    try {
      await triggerForecast();
      // Data will arrive via Socket.IO; poll as fallback after 8s
      setTimeout(async () => {
        try { const r = await getForecast(); setForecastData(r.data.data || null); } catch {}
        setTriggering(false);
      }, 8000);
    } catch { setTriggering(false); }
  };

  useEffect(() => {
    loadAll();

    // Real-time: listen for forecast updates from server
    const socket = io('/admin', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('admin:forecast:updated', (data) => {
      setForecastData(data);
      setTriggering(false);
      setLastRefresh(new Date());
    });

    return () => socket.disconnect();
  }, []);

  const TABS = [
    { id: 'mrr',      label: 'MRR Waterfall',   icon: BarChart2 },
    { id: 'cash',     label: 'Renewal Calendar', icon: Calendar },
    { id: 'cohort',   label: 'Cohort Retention', icon: Users },
    { id: 'forecast', label: 'AI Forecast',       icon: Cpu },
  ];

  return (
    <AdminLayout title="Revenue Intelligence">
      <div className="font-sans text-text-primary max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">
              Revenue Intelligence
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">
              MRR waterfall, cohort retention, and 90-day renewal forecast
            </p>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors"
          >
            <RefreshCw size={14} />
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1.5 mb-7 bg-surface border border-border rounded-xl p-1.5 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-none cursor-pointer text-[13px] font-bold transition-all ${
                tab === t.id ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'mrr' && (
          <>
            <SectionHeader
              title="MRR Movement Waterfall"
              subtitle="New, Expansion, Contraction, Churned, and Reactivation MRR per month + NRR & Quick Ratio"
            />
            <MrrWaterfall data={mrrData} loading={mrrLoading} />
          </>
        )}

        {tab === 'cash' && (
          <>
            <SectionHeader
              title="90-Day Renewal Calendar"
              subtitle="Expected recurring revenue from subscription renewals in the next 3 months"
            />
            <CashFlowCalendar data={cashData} loading={cashLoading} />
          </>
        )}

        {tab === 'cohort' && (
          <>
            <SectionHeader
              title="Cohort Retention Heat-Map"
              subtitle="What % of each monthly cohort is still active M+1, M+2 ... months after signup"
            />
            <div className="flex gap-4 mb-4 flex-wrap text-[12px] font-semibold text-text-muted">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500/40 inline-block" />&ge;85% Healthy</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-500/40 inline-block" />60&ndash;84% Watch</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-red-500/40 inline-block" />&lt;60% At Risk</span>
            </div>
            <CohortHeatMap data={cohortData} loading={cohortLoading} />
          </>
        )}

        {tab === 'forecast' && (
          <>
            <SectionHeader
              title="3-Month Revenue Forecast"
              subtitle="Deterministic linear regression on MRR trend &middot; AI-generated narrative insight"
            />
            <ForecastChart
              data={forecastData}
              loading={forecastLoading}
              onTrigger={handleTriggerForecast}
              triggering={triggering}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
