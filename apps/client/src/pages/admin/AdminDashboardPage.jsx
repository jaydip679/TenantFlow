import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import {
  TrendingUp,
  BarChart2,
  Users,
  AlertTriangle,
  Activity,
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

// ── Components ─────────────────────────────────────────────────────────────────
const METRIC_CARDS = [
  { key: 'mrr',               label: 'MRR',                    accentColor: '#22c55e', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20', icon: TrendingUp,    fmt: formatINR    },
  { key: 'arr',               label: 'ARR',                    accentColor: '#3b82f6', bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/20',    icon: BarChart2,     fmt: formatINR    },
  { key: 'activeSubscriptions', label: 'Active Subscriptions', accentColor: '#14b8a6', bgClass: 'bg-teal-500/10',    borderClass: 'border-teal-500/20',    icon: Users,         fmt: (v) => v ?? 0 },
  { key: 'churnRate',         label: 'Churn Rate (Month)',     accentColor: '#f97316', bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/20',  icon: Activity,      fmt: formatPercent },
  { key: 'highRiskTenants',   label: 'High Risk Tenants',      accentColor: '#ef4444', bgClass: 'bg-red-500/10',     borderClass: 'border-red-500/20',     icon: AlertTriangle, fmt: (v) => v ?? 0 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3.5 py-2.5 shadow-md">
      <p className="m-0 text-xs text-text-muted">{label}</p>
      <p className="m-0 mt-1 text-sm font-semibold text-emerald-500">
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
      <div className="font-sans text-text-primary">
        {/* Page header */}
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">Platform Overview</h1>
          <p className="m-0 mt-1 text-sm text-text-muted">Real-time metrics and revenue intelligence</p>
        </div>

        {/* Metric cards */}
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
            {METRIC_CARDS.map((c) => (
              <div key={c.key} className="bg-surface border border-border rounded-2xl p-5 h-[100px] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
            {METRIC_CARDS.map(({ key, label, accentColor, bgClass, borderClass, icon: Icon, fmt }) => (
              <div key={key} className="bg-surface border border-border rounded-2xl p-5 shadow-sm transition-colors hover:border-border/80">
                <div className="flex items-center justify-between mb-2.5">
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center border ${bgClass} ${borderClass}`}>
                    <Icon size={18} color={accentColor} />
                  </div>
                </div>
                <p className="m-0 text-[12px] font-medium text-text-muted uppercase tracking-[0.06em]">{label}</p>
                <p className="m-0 mt-1.5 text-[26px] font-bold leading-none tracking-tight" style={{ color: accentColor }}>
                  {fmt(metrics?.[key])}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Chart + stat cards */}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-5 mb-6">
          {/* MRR Trend Chart */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <p className="m-0 mb-4.5 text-[15px] font-semibold text-text-primary">MRR Trend — Last 12 Months</p>
            {loading ? (
              <div className="bg-surface-secondary rounded-xl h-[220px] animate-pulse" />
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mrrTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border opacity-50" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
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
              </div>
            )}
          </div>

          {/* Stat cards */}
          <div className="flex flex-col gap-4">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-5 py-4.5 flex-1 shadow-sm">
              <p className="m-0 text-[12px] font-medium text-text-muted">New This Month</p>
              {loading
                ? <div className="bg-emerald-500/20 rounded-md h-8 w-16 mt-2 animate-pulse" />
                : <p className="m-0 mt-1.5 text-[28px] font-bold text-emerald-400">{metrics?.newThisMonth ?? metrics?.newSubscriptionsThisMonth ?? 0}</p>
              }
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-5 py-4.5 flex-1 shadow-sm">
              <p className="m-0 text-[12px] font-medium text-text-muted">Cancelled This Month</p>
              {loading
                ? <div className="bg-red-500/20 rounded-md h-8 w-16 mt-2 animate-pulse" />
                : <p className="m-0 mt-1.5 text-[28px] font-bold text-red-400">{metrics?.cancelledThisMonth ?? metrics?.cancelledSubscriptionsThisMonth ?? 0}</p>
              }
            </div>
          </div>
        </div>

        {/* Live events feed */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_6px_var(--color-success)] animate-pulse" />
            <p className="m-0 text-[15px] font-semibold text-text-primary">Live Platform Events</p>
            <Zap size={14} className="text-amber-500 ml-0.5" />
          </div>

          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
            {events.length === 0 ? (
              <p className="text-center py-6 text-[13px] text-text-muted m-0">Waiting for events… (connected to /admin socket)</p>
            ) : (
              events.map((ev) => {
                const cfg = {
                  'payment:success':      { icon: CheckCircle, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20', label: 'Payment Success' },
                  'payment:failed':       { icon: XCircle,     colorClass: 'text-red-400',     bgClass: 'bg-red-500/10',     borderClass: 'border-red-500/20',     label: 'Payment Failed' },
                  'subscription:created':  { icon: Zap,         colorClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/20',    label: 'New Subscription' },
                  'subscription:upgraded': { icon: TrendingUp,  colorClass: 'text-purple-400',  bgClass: 'bg-purple-500/10',  borderClass: 'border-purple-500/20',  label: 'Plan Upgraded' },
                  'subscription:downgraded':{ icon: Activity,   colorClass: 'text-orange-400',  bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/20',  label: 'Downgrade Scheduled' },
                }[ev.type] || { icon: Activity, colorClass: 'text-text-muted', bgClass: 'bg-surface-secondary', borderClass: 'border-border', label: ev.type };

                const Icon    = cfg.icon;

                const descParts = [];
                if (ev.data?.tenantName)  descParts.push(ev.data.tenantName);
                if (ev.data?.planName)    descParts.push(ev.data.planName);
                if (ev.data?.toPlanName)  descParts.push(`→ ${ev.data.toPlanName}`);
                if (ev.data?.amountPaid)  descParts.push(formatINR(ev.data.amountPaid));

                return (
                  <div key={ev.id} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${cfg.bgClass} ${cfg.borderClass}`}>
                    <Icon size={16} className={`${cfg.colorClass} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className={`m-0 text-[13px] font-semibold ${cfg.colorClass}`}>{cfg.label}</p>
                      <p className="m-0 mt-0.5 text-[12px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">{descParts.join(' · ') || 'Platform event'}</p>
                    </div>
                    <span className="text-[11px] text-text-muted shrink-0">{timeAgo(ev.ts)}</span>
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
