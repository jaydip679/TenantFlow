import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Users, Zap, RefreshCw, ExternalLink,
  ArrowUpCircle, AlertCircle, CheckCircle2, ChevronRight, Loader2,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getExpansionOpportunities, computeHealthScores } from '../../services/healthService.js';

function formatINR(paise) {
  if (paise == null || paise === 0) return 'Free';
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

function ScoreBar({ score }) {
  const colorClass = score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-orange-500' : 'bg-red-500';
  const textClass = score >= 70 ? 'text-emerald-500' : score >= 45 ? 'text-orange-500' : 'text-red-500';
  
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ease-out ${colorClass}`}
          style={{ width: `${score}%` }} 
        />
      </div>
      <span className={`text-[12px] font-bold min-w-[34px] text-right ${textClass}`}>{score}</span>
    </div>
  );
}

function UtilBadge({ pct }) {
  const badgeClass = pct >= 90 ? 'bg-red-500/15 text-red-500' : pct >= 70 ? 'bg-orange-500/15 text-orange-500' : 'bg-emerald-500/15 text-emerald-500';
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${badgeClass}`}>
      {pct}%
    </span>
  );
}

function OpportunityCard({ item, onViewTenant }) {
  const urgency = item.opportunityScore >= 75 ? 'High' : item.opportunityScore >= 50 ? 'Medium' : 'Low';
  
  // Define colors based on urgency
  const topBarClass = urgency === 'High' ? 'from-red-500' : urgency === 'Medium' ? 'from-orange-500' : 'from-blue-500';
  const badgeClass = urgency === 'High' ? 'bg-red-500/15 text-red-500' : urgency === 'Medium' ? 'bg-orange-500/15 text-orange-500' : 'bg-blue-500/15 text-blue-500';
  const healthClass = item.healthScore >= 70 ? 'text-emerald-500' : item.healthScore >= 50 ? 'text-orange-500' : 'text-red-500';

  return (
    <div 
      className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden transition-colors hover:border-primary/40 cursor-pointer shadow-sm group"
    >
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${topBarClass} to-transparent opacity-80`} />

      <div className="flex items-start justify-between mb-4 mt-1">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="m-0 text-[15px] font-bold text-text-primary tracking-tight">{item.tenantName}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.06em] ${badgeClass}`}>
              {urgency} Opportunity
            </span>
          </div>
          <p className="m-0 text-[12px] text-text-muted">{item.currentPlan} &middot; {formatINR(item.currentPlanPrice)}/mo</p>
        </div>
        <button
          onClick={() => onViewTenant(item.tenantId)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[12px] transition-colors"
        >
          View <ExternalLink size={12} />
        </button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2.5 bg-surface-secondary/50 rounded-xl">
          <p className="m-0 mb-1 text-[10px] text-text-muted uppercase tracking-[0.06em] font-semibold">Seats</p>
          <p className="m-0 text-[16px] font-bold text-text-primary mb-1">
            {item.usedSeats}<span className="text-text-muted text-[12px] font-medium">/{item.maxSeats}</span>
          </p>
          <UtilBadge pct={item.seatUtilPct} />
        </div>
        <div className="text-center p-2.5 bg-surface-secondary/50 rounded-xl">
          <p className="m-0 mb-1 text-[10px] text-text-muted uppercase tracking-[0.06em] font-semibold">Health</p>
          <p className={`m-0 text-[16px] font-bold mt-1 ${healthClass}`}>{item.healthScore ?? '—'}</p>
        </div>
        <div className="text-center p-2.5 bg-surface-secondary/50 rounded-xl">
          <p className="m-0 mb-1 text-[10px] text-text-muted uppercase tracking-[0.06em] font-semibold">Tenure</p>
          <p className="m-0 text-[16px] font-bold text-text-primary mt-1">{Math.floor(item.subscriptionAge / 30)}mo</p>
        </div>
      </div>

      {/* Opportunity score */}
      <div className="mb-3">
        <div className="flex justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em]">Opportunity Score</span>
        </div>
        <ScoreBar score={item.opportunityScore} />
      </div>

      {/* Signals */}
      {item.signals.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {item.signals.map((sig, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full bg-surface-secondary/80 text-text-muted text-[11px] font-medium border border-border">
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Recommended upgrade */}
      {item.recommendedUpgrade && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20 group-hover:bg-primary/10 transition-colors">
          <div className="flex items-center gap-2">
            <ArrowUpCircle size={15} className="text-primary" />
            <span className="text-[12px] text-primary">
              Upgrade to <strong className="font-semibold">{item.recommendedUpgrade.planName}</strong> ({formatINR(item.recommendedUpgrade.price)}/mo)
            </span>
          </div>
          <ChevronRight size={14} className="text-primary" />
        </div>
      )}
    </div>
  );
}

export default function ExpansionPage() {
  const navigate  = useNavigate();
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [computing,setComputing]= useState(false);
  const [error,    setError]    = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getExpansionOpportunities(30);
      setData(r.data.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load expansion data.');
    } finally {
      setLoading(false);
    }
  };

  const triggerCompute = async () => {
    setComputing(true);
    try {
      await computeHealthScores({});
      await load();
    } catch {
      /* silent */
    } finally {
      setComputing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const highCount   = data.filter(d => d.opportunityScore >= 75).length;
  const mediumCount = data.filter(d => d.opportunityScore >= 50 && d.opportunityScore < 75).length;
  const totalUpsellMrr = data.reduce((sum, d) => {
    return sum + (d.recommendedUpgrade ? Math.round((d.recommendedUpgrade.price - d.currentPlanPrice) / 100) : 0);
  }, 0);

  return (
    <AdminLayout title="Expansion">
      <div className="font-sans text-text-primary">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">
              Expansion Opportunities
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted max-w-xl">
              Tenants ranked by upgrade likelihood — seat pressure, health, and payment reliability
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={triggerCompute}
              disabled={computing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary cursor-pointer text-[13px] font-semibold disabled:opacity-70 disabled:cursor-not-allowed hover:bg-primary/15 transition-colors"
            >
              {computing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {computing ? 'Recomputing…' : 'Recompute Scores'}
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors"
            >
              <RefreshCw size={14} />
              {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary KPI strip */}
        {!loading && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            {[
              { label: 'Total Candidates', value: data.length, icon: Users, colorClass: 'text-blue-500', bgClass: 'bg-blue-500/10' },
              { label: 'High Priority',    value: highCount,   icon: AlertCircle, colorClass: 'text-red-500', bgClass: 'bg-red-500/10' },
              { label: 'Medium Priority',  value: mediumCount, icon: TrendingUp,  colorClass: 'text-orange-500', bgClass: 'bg-orange-500/10' },
              { label: 'Potential MRR Uplift', value: `₹${totalUpsellMrr.toLocaleString('en-IN')}`, icon: Zap, colorClass: 'text-emerald-500', bgClass: 'bg-emerald-500/10' },
            ].map(({ label, value, icon: Icon, colorClass, bgClass }) => (
              <div key={label} className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-3.5 shadow-sm hover:border-border/80 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
                  <Icon size={18} className={colorClass} />
                </div>
                <div>
                  <p className="m-0 text-[22px] font-bold text-text-primary leading-tight">{value}</p>
                  <p className="m-0 mt-0.5 text-[12px] font-medium text-text-muted uppercase tracking-[0.05em]">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {loading && (
          <div className="py-20 text-center">
            <Loader2 size={40} className="text-primary animate-spin mx-auto mb-4" />
            <p className="text-text-muted m-0 text-sm">Analysing expansion opportunities…</p>
          </div>
        )}

        {!loading && error && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-[14px] font-medium">
            {error}
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="py-20 text-center text-text-muted">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
            <p className="m-0 text-[16px] font-bold text-text-primary mb-1.5">No expansion opportunities found</p>
            <p className="m-0 text-[13px]">All active tenants are either on the highest plan or have low seat utilization.</p>
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
            {data.map(item => (
              <OpportunityCard
                key={item.tenantId}
                item={item}
                onViewTenant={(id) => navigate(`/admin/tenants/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
