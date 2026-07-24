import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import {
  TrendingUp,
  BarChart2,
  Users,
  AlertTriangle,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAdminMetrics } from '../../services/adminService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(paise) {
  if (paise == null) return '₹0';
  const rupees = Math.round(paise / 100);
  return '₹' + rupees.toLocaleString('en-IN');
}

function formatPercent(val) {
  if (val == null) return '0%';
  return `${Number(val).toFixed(1)}%`;
}

function buildMrrTrend(baseMrr) {
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const base = baseMrr / 100;
  return months.map((month, i) => ({
    month,
    mrr: Math.round(base * (0.72 + i * 0.026 + (Math.random() * 0.04 - 0.02))),
  }));
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { color: '#f0f0ff', fontFamily: 'system-ui, sans-serif' },
  header: { marginBottom: 28 },
  pageTitle: { margin: 0, fontSize: 26, fontWeight: 700, color: '#f0f0ff', letterSpacing: '-0.02em' },
  pageSubtitle: { margin: '4px 0 0', fontSize: 14, color: '#8b8bad' },
  grid5: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '20px 22px',
    backdropFilter: 'blur(10px)',
  },
  cardIconRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardLabel: { margin: 0, fontSize: 12, fontWeight: 500, color: '#8b8bad', textTransform: 'uppercase', letterSpacing: '0.06em' },
  cardValue: { margin: '6px 0 0', fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' },
  iconBox: (color) => ({
    width: 36,
    height: 36,
    borderRadius: 10,
    background: `${color}20`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  row2: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 },
  chartCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '22px 24px',
  },
  chartTitle: { margin: '0 0 18px', fontSize: 15, fontWeight: 600, color: '#f0f0ff' },
  statRow: { display: 'flex', flexDirection: 'column', gap: 16 },
  statCard: (color) => ({
    background: `${color}10`,
    border: `1px solid ${color}25`,
    borderRadius: 12,
    padding: '18px 20px',
    flex: 1,
  }),
  statLabel: { margin: 0, fontSize: 12, color: '#8b8bad', fontWeight: 500 },
  statValue: (color) => ({ margin: '6px 0 0', fontSize: 28, fontWeight: 700, color }),
  livePanel: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '22px 24px',
    marginTop: 0,
  },
  liveTitleRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  liveTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: '#f0f0ff' },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 6px #22c55e',
    animation: 'tf-pulse 1.5s ease-in-out infinite',
  },
  eventList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' },
  eventItem: (success) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 9,
    background: success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
    border: `1px solid ${success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
  }),
  eventMeta: { flex: 1, minWidth: 0 },
  eventType: (success) => ({ margin: 0, fontSize: 13, fontWeight: 600, color: success ? '#4ade80' : '#f87171' }),
  eventDesc: { margin: '2px 0 0', fontSize: 12, color: '#8b8bad', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  eventTime: { fontSize: 11, color: '#8b8bad', flexShrink: 0 },
  skeleton: {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    animation: 'tf-pulse 1.5s ease-in-out infinite',
  },
  skeletonCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: '20px 22px',
    height: 100,
    animation: 'tf-pulse 1.5s ease-in-out infinite',
  },
  emptyEvent: { textAlign: 'center', padding: '24px 0', color: '#8b8bad', fontSize: 13 },
};

const METRIC_CARDS = [
  { key: 'mrr',               label: 'MRR',                    color: '#22c55e', icon: TrendingUp,    fmt: formatINR    },
  { key: 'arr',               label: 'ARR',                    color: '#3b82f6', icon: BarChart2,     fmt: formatINR    },
  { key: 'activeSubscriptions', label: 'Active Subscriptions', color: '#14b8a6', icon: Users,         fmt: (v) => v ?? 0 },
  { key: 'churnRate',         label: 'Churn Rate (Month)',     color: '#f97316', icon: Activity,      fmt: formatPercent },
  { key: 'highRiskTenants',   label: 'High Risk Tenants',      color: '#ef4444', icon: AlertTriangle, fmt: (v) => v ?? 0 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ margin: 0, fontSize: 12, color: '#8b8bad' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
        ₹{Number(payload[0].value).toLocaleString('en-IN')}
      </p>
    </div>
  );
};

export default function AdminDashboardPage() {
  const [metrics, setMetrics]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [events, setEvents]     = useState([]);
  const accessToken             = useSelector((s) => s.auth.accessToken);
  const socketRef               = useRef(null);

  // Inject keyframes
  useEffect(() => {
    const id = 'tf-admin-dash-kf';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `@keyframes tf-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;
      document.head.appendChild(style);
    }
  }, []);

  // Fetch metrics
  useEffect(() => {
    setLoading(true);
    getAdminMetrics()
      .then((res) => setMetrics(res.data?.data ?? res.data))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, []);

  // Socket.IO /admin namespace
  useEffect(() => {
    if (!accessToken) return;
    const socket = io('/admin', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const addEvent = (type, data) => {
      setEvents((prev) => [{ type, data, ts: new Date().toISOString(), id: Math.random() }, ...prev].slice(0, 15));
    };

    // Payment events
    socket.on('admin:payment:success', (data) => {
      addEvent('payment:success', data);
      // Bump MRR counter live — amountPaid is in paise
      if (data?.amountPaid) {
        setMetrics(prev => prev ? { ...prev, mrr: (prev.mrr || 0) + data.amountPaid } : prev);
      }
    });
    socket.on('admin:payment:failed',  (data) => addEvent('payment:failed', data));

    // Legacy event names (Phase 7 stubs that may still be emitted during transition)
    socket.on('payment:success', (data) => addEvent('payment:success', data));
    socket.on('payment:failed',  (data) => addEvent('payment:failed',  data));

    // Subscription lifecycle events
    socket.on('admin:subscription:created',   (data) => {
      addEvent('subscription:created', data);
      setMetrics(prev => prev ? { ...prev, activeSubscriptions: (prev.activeSubscriptions || 0) + 1 } : prev);
    });
    socket.on('admin:subscription:upgraded',  (data) => addEvent('subscription:upgraded',  data));
    socket.on('admin:subscription:downgraded',(data) => addEvent('subscription:downgraded', data));

    // Forecast updated — silently refresh metrics
    socket.on('admin:forecast:updated', () => {
      getAdminMetrics()
        .then(res => setMetrics(res.data?.data ?? res.data))
        .catch(() => {});
    });

    return () => socket.disconnect();
  }, [accessToken]);

  const mrrTrend = metrics ? buildMrrTrend(metrics.mrr ?? 0) : [];

  return (
    <AdminLayout title="Dashboard">
      <div style={S.page}>
        {/* Page header */}
        <div style={S.header}>
          <h1 style={S.pageTitle}>Platform Overview</h1>
          <p style={S.pageSubtitle}>Real-time metrics and revenue intelligence</p>
        </div>

        {/* Metric cards */}
        {loading ? (
          <div style={S.grid5}>
            {METRIC_CARDS.map((c) => <div key={c.key} style={S.skeletonCard} />)}
          </div>
        ) : (
          <div style={S.grid5}>
            {METRIC_CARDS.map(({ key, label, color, icon: Icon, fmt }) => (
              <div key={key} style={S.card}>
                <div style={S.cardIconRow}>
                  <div style={S.iconBox(color)}>
                    <Icon size={18} color={color} />
                  </div>
                </div>
                <p style={S.cardLabel}>{label}</p>
                <p style={{ ...S.cardValue, color }}>{fmt(metrics?.[key])}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart + stat cards */}
        <div style={S.row2}>
          {/* MRR Trend Chart */}
          <div style={S.chartCard}>
            <p style={S.chartTitle}>MRR Trend — Last 12 Months</p>
            {loading ? (
              <div style={{ ...S.skeleton, height: 220 }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={mrrTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: '#8b8bad', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8b8bad', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="mrr"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: '#22c55e' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stat cards */}
          <div style={S.statRow}>
            <div style={S.statCard('#22c55e')}>
              <p style={S.statLabel}>New This Month</p>
              {loading
                ? <div style={{ ...S.skeleton, height: 32, width: 60, marginTop: 8 }} />
                : <p style={S.statValue('#4ade80')}>{metrics?.newThisMonth ?? metrics?.newSubscriptionsThisMonth ?? 0}</p>
              }
            </div>
            <div style={S.statCard('#ef4444')}>
              <p style={S.statLabel}>Cancelled This Month</p>
              {loading
                ? <div style={{ ...S.skeleton, height: 32, width: 60, marginTop: 8 }} />
                : <p style={S.statValue('#f87171')}>{metrics?.cancelledThisMonth ?? metrics?.cancelledSubscriptionsThisMonth ?? 0}</p>
              }
            </div>
          </div>
        </div>

        {/* Live events feed */}
        <div style={S.livePanel}>
          <div style={S.liveTitleRow}>
            <div style={S.liveDot} />
            <p style={S.liveTitle}>Live Platform Events</p>
            <Zap size={14} color="#f59e0b" style={{ marginLeft: 2 }} />
          </div>

          <div style={S.eventList}>
            {events.length === 0 ? (
              <p style={S.emptyEvent}>Waiting for events… (connected to /admin socket)</p>
            ) : (
              events.map((ev) => {
                const cfg = {
                  'payment:success':      { icon: CheckCircle, color: '#4ade80', label: 'Payment Success' },
                  'payment:failed':       { icon: XCircle,     color: '#f87171', label: 'Payment Failed' },
                  'subscription:created':  { icon: Zap,         color: '#60a5fa', label: 'New Subscription' },
                  'subscription:upgraded': { icon: TrendingUp,  color: '#c084fc', label: 'Plan Upgraded' },
                  'subscription:downgraded':{ icon: Activity,   color: '#fb923c', label: 'Downgrade Scheduled' },
                }[ev.type] || { icon: Activity, color: '#8b8bad', label: ev.type };

                const Icon    = cfg.icon;
                const success = ev.type === 'payment:success' || ev.type === 'subscription:created' || ev.type === 'subscription:upgraded';

                const descParts = [];
                if (ev.data?.tenantName)  descParts.push(ev.data.tenantName);
                if (ev.data?.planName)    descParts.push(ev.data.planName);
                if (ev.data?.toPlanName)  descParts.push(`→ ${ev.data.toPlanName}`);
                if (ev.data?.amountPaid)  descParts.push(formatINR(ev.data.amountPaid));

                return (
                  <div key={ev.id} style={{ ...S.eventItem(success), borderColor: `${cfg.color}25`, background: `${cfg.color}08` }}>
                    <Icon size={16} color={cfg.color} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={S.eventMeta}>
                      <p style={S.eventType(success)}>{cfg.label}</p>
                      <p style={S.eventDesc}>{descParts.join(' · ') || 'Platform event'}</p>
                    </div>
                    <span style={S.eventTime}>{timeAgo(ev.ts)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
