import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Calendar, Users, BarChart2, RefreshCw,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getMrrMovements, getCashFlowForecast, getCohortRetention } from '../../services/adminService.js';

// ── Styles ────────────────────────────────────────────────────────────────────
const ACCENT   = '#6c63ff';
const GREEN    = '#4ade80';
const RED      = '#f87171';
const ORANGE   = '#fb923c';
const BLUE     = '#60a5fa';
const PURPLE   = '#c084fc';
const MUTED    = '#8b8bad';
const TEXT     = '#f0f0ff';
const CARD_BG  = 'rgba(255,255,255,0.04)';
const BORDER   = 'rgba(255,255,255,0.08)';

const card = {
  background: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: '24px 24px',
};

function formatINR(paise) {
  if (paise == null) return '—';
  const r = Math.round(paise / 100);
  return '₹' + r.toLocaleString('en-IN');
}

function KpiCard({ label, value, sub, icon: Icon, color = ACCENT, trend, badge }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>{value}</p>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: MUTED }}>{sub}</p>}
      </div>
      {badge && (
        <span style={{ alignSelf: 'flex-start', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${badge.color}22`, color: badge.color }}>
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
    <div style={{ background: '#1a1a2e', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: TEXT }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600, color: TEXT }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '2px 0', color: p.fill || p.color }}>
          {p.name}: {formatINR(p.value * 100)}
        </p>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>{subtitle}</p>}
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
  const nrrColor = latest?.nrr >= 100 ? GREEN : latest?.nrr >= 80 ? ORANGE : RED;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard
          label="Ending MRR"
          value={formatINR((latest?.endingMrr || 0))}
          sub={`Net New: ${latest?.netNewMrr >= 0 ? '+' : ''}${formatINR(latest?.netNewMrr || 0)}`}
          icon={DollarSign} color={ACCENT}
        />
        <KpiCard
          label="Net Revenue Retention"
          value={`${latest?.nrr ?? '—'}%`}
          sub="NRR > 100% = net growth"
          icon={TrendingUp} color={nrrColor}
          badge={{ label: latest?.nrr >= 100 ? '🟢 Healthy' : latest?.nrr >= 80 ? '🟡 Watch' : '🔴 At Risk', color: nrrColor }}
        />
        <KpiCard
          label="Quick Ratio"
          value={latest?.quickRatio != null ? `${latest.quickRatio}×` : 'N/A'}
          sub="Growth ÷ Churn. Target: >4"
          icon={BarChart2} color={BLUE}
          badge={latest?.quickRatio != null ? { label: latest.quickRatio >= 4 ? '🟢 Strong' : latest.quickRatio >= 2 ? '🟡 Ok' : '🔴 Low', color: latest.quickRatio >= 4 ? GREEN : latest.quickRatio >= 2 ? ORANGE : RED } : null}
        />
        <KpiCard
          label="Churned MRR"
          value={formatINR(latest?.churnedMrr || 0)}
          sub={`Expansion: ${formatINR(latest?.expansionMrr || 0)}`}
          icon={TrendingDown} color={RED}
        />
      </div>

      {/* Stacked Bar Chart */}
      <div style={card}>
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: TEXT }}>Monthly MRR Movements</p>
        <ResponsiveContainer width="100%" height={260}>
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

      {/* Data table */}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Month','Begin','New','Expansion','Contraction','Churned','Net New','Ending','NRR','QR'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.month} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td style={{ padding: '7px 10px', color: TEXT, fontWeight: 600 }}>{d.month}</td>
                {[d.beginMrr, d.newMrr, d.expansionMrr, d.contractionMrr, d.churnedMrr, d.netNewMrr, d.endingMrr].map((v, i) => (
                  <td key={i} style={{ padding: '7px 10px', textAlign: 'right', color: [5].includes(i) ? (v >= 0 ? GREEN : RED) : TEXT, fontFamily: 'monospace' }}>
                    {i === 5 && v >= 0 ? '+' : ''}{formatINR(v)}
                  </td>
                ))}
                <td style={{ padding: '7px 10px', textAlign: 'right', color: d.nrr >= 100 ? GREEN : d.nrr >= 80 ? ORANGE : RED, fontWeight: 600 }}>{d.nrr ?? '—'}%</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: MUTED }}>{d.quickRatio != null ? `${d.quickRatio}×` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cash Flow Calendar ─────────────────────────────────────────────────────
function CashFlowCalendar({ data, loading }) {
  if (loading) return <Skeleton h={220} />;
  if (!data?.length) return <Empty msg="No upcoming renewals" />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {data.map(m => {
        const atRiskPct = m.expectedMrr > 0 ? Math.round((m.atRiskMrr / m.expectedMrr) * 100) : 0;
        return (
          <div key={m.month} style={{ ...card, position: 'relative', overflow: 'hidden' }}>
            {/* Accent bar at top */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${ACCENT},#a78bfa)` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{m.month}</span>
              <Calendar size={15} color={MUTED} />
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: TEXT }}>{formatINR(m.expectedMrr)}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: MUTED }}>{m.renewalCount} renewal{m.renewalCount !== 1 ? 's' : ''}</p>
            {m.atRiskMrr > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <AlertTriangle size={13} color={RED} />
                <span style={{ fontSize: 12, color: RED }}>{formatINR(m.atRiskMrr)} at risk ({atRiskPct}%)</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)' }}>
                <span style={{ fontSize: 12, color: GREEN }}>✓ No at-risk renewals</span>
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
  function cellText(pct) {
    if (pct >= 85) return GREEN;
    if (pct >= 60) return ORANGE;
    return RED;
  }

  const maxCols = Math.max(...data.map(d => d.retention.length));

  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px', fontSize: 12, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 10px', color: MUTED, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', width: 90 }}>Cohort</th>
            <th style={{ padding: '4px 8px', color: MUTED, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', width: 60 }}>Size</th>
            {Array.from({ length: maxCols }, (_, i) => (
              <th key={i} style={{ padding: '4px 8px', color: MUTED, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'center', width: 60 }}>
                M+{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.cohort}>
              <td style={{ padding: '5px 10px', color: TEXT, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.cohort}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: MUTED }}>{row.cohortSize}</td>
              {row.retention.map((pct, i) => (
                <td key={i} style={{
                  padding: '5px 8px', textAlign: 'center',
                  background: cellColor(pct), borderRadius: 6,
                  color: cellText(pct), fontWeight: 600,
                  transition: 'all 0.15s',
                }}>
                  {pct}%
                </td>
              ))}
              {/* Empty cells for missing months */}
              {Array.from({ length: maxCols - row.retention.length }, (_, i) => (
                <td key={`e-${i}`} style={{ padding: '5px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 10 }}>—</td>
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
    <div style={{ ...card, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${ACCENT}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
function Empty({ msg }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: 48, color: MUTED, fontSize: 14 }}>{msg}</div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RevenueIntelligencePage() {
  const [tab, setTab] = useState('mrr');

  const [mrrData,      setMrrData]      = useState([]);
  const [cashData,     setCashData]     = useState([]);
  const [cohortData,   setCohortData]   = useState([]);
  const [mrrLoading,   setMrrLoading]   = useState(true);
  const [cashLoading,  setCashLoading]  = useState(true);
  const [cohortLoading,setCohortLoading]= useState(true);
  const [lastRefresh,  setLastRefresh]  = useState(null);

  const loadAll = async () => {
    setMrrLoading(true); setCashLoading(true); setCohortLoading(true);
    try { const r = await getMrrMovements(6);      setMrrData(r.data.data   || []); } catch { setMrrData([]); }
    finally { setMrrLoading(false); }
    try { const r = await getCashFlowForecast(3);  setCashData(r.data.data  || []); } catch { setCashData([]); }
    finally { setCashLoading(false); }
    try { const r = await getCohortRetention(6);   setCohortData(r.data.data|| []); } catch { setCohortData([]); }
    finally { setCohortLoading(false); setLastRefresh(new Date()); }
  };

  useEffect(() => { loadAll(); }, []);

  const TABS = [
    { id: 'mrr',    label: 'MRR Waterfall',   icon: BarChart2 },
    { id: 'cash',   label: 'Renewal Calendar', icon: Calendar },
    { id: 'cohort', label: 'Cohort Retention', icon: Users },
  ];

  return (
    <AdminLayout>
      <div style={{ color: TEXT }}>
        {/* Header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
              Revenue Intelligence
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: MUTED }}>
              MRR waterfall, cohort retention, and 90-day renewal forecast
            </p>
          </div>
          <button
            onClick={loadAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: `1px solid ${BORDER}`, background: CARD_BG, color: MUTED, cursor: 'pointer', fontSize: 13 }}
          >
            <RefreshCw size={14} />
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 4, alignSelf: 'flex-start', width: 'fit-content' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                background: tab === t.id ? ACCENT : 'transparent',
                color:      tab === t.id ? '#fff'  : MUTED,
              }}
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
            <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: MUTED }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(74,222,128,0.4)', display: 'inline-block' }} />≥85% Healthy</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(251,146,60,0.4)', display: 'inline-block' }} />60–84% Watch</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(248,113,113,0.4)', display: 'inline-block' }} />&lt;60% At Risk</span>
            </div>
            <CohortHeatMap data={cohortData} loading={cohortLoading} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
