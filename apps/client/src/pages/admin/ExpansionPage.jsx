import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Users, Zap, RefreshCw, ExternalLink,
  ArrowUpCircle, AlertCircle, CheckCircle2, ChevronRight,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getExpansionOpportunities, computeHealthScores } from '../../services/healthService.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const TEXT   = '#f0f0ff';
const MUTED  = '#8b8bad';
const BORDER = 'rgba(255,255,255,0.08)';
const CARD   = 'rgba(255,255,255,0.04)';
const ACCENT = '#6c63ff';
const GREEN  = '#4ade80';
const ORANGE = '#fb923c';
const RED    = '#f87171';
const BLUE   = '#60a5fa';

const card = {
  background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 16, padding: '20px 22px',
};

function formatINR(paise) {
  if (paise == null || paise === 0) return 'Free';
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

function ScoreBar({ score }) {
  const color = score >= 70 ? GREEN : score >= 45 ? ORANGE : RED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${score}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

function UtilBadge({ pct }) {
  const color = pct >= 90 ? RED : pct >= 70 ? ORANGE : GREEN;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}22`, color }}>
      {pct}%
    </span>
  );
}

function OpportunityCard({ item, onViewTenant }) {
  const urgency = item.opportunityScore >= 75 ? 'High' : item.opportunityScore >= 50 ? 'Medium' : 'Low';
  const urgencyColor = urgency === 'High' ? RED : urgency === 'Medium' ? ORANGE : BLUE;

  return (
    <div style={{
      ...card,
      transition: 'border-color 0.15s, transform 0.1s',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${ACCENT}44`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${urgencyColor}, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{item.tenantName}</p>
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${urgencyColor}22`, color: urgencyColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {urgency} Opportunity
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{item.currentPlan} · {formatINR(item.currentPlanPrice)}/mo</p>
        </div>
        <button
          onClick={() => onViewTenant(item.tenantId)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: 12 }}
        >
          View <ExternalLink size={12} />
        </button>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seats</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{item.usedSeats}<span style={{ color: MUTED, fontSize: 12 }}>/{item.maxSeats}</span></p>
          <UtilBadge pct={item.seatUtilPct} />
        </div>
        <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Health</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: item.healthScore >= 70 ? GREEN : item.healthScore >= 50 ? ORANGE : RED }}>{item.healthScore ?? '—'}</p>
        </div>
        <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tenure</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{Math.floor(item.subscriptionAge / 30)}mo</p>
        </div>
      </div>

      {/* Opportunity score */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Opportunity Score</span>
        </div>
        <ScoreBar score={item.opportunityScore} />
      </div>

      {/* Signals */}
      {item.signals.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {item.signals.map((sig, i) => (
            <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: MUTED, fontSize: 11 }}>
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Recommended upgrade */}
      {item.recommendedUpgrade && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpCircle size={15} color={ACCENT} />
            <span style={{ fontSize: 12, color: '#a78bfa' }}>
              Upgrade to <strong>{item.recommendedUpgrade.planName}</strong> ({formatINR(item.recommendedUpgrade.price)}/mo)
            </span>
          </div>
          <ChevronRight size={14} color={ACCENT} />
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
    <AdminLayout>
      <div style={{ color: TEXT }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
              Expansion Opportunities
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: MUTED }}>
              Tenants ranked by upgrade likelihood — seat pressure, health, and payment reliability
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={triggerCompute}
              disabled={computing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: `1px solid rgba(108,99,255,0.3)`, background: 'rgba(108,99,255,0.08)', color: '#a78bfa', cursor: computing ? 'not-allowed' : 'pointer', fontSize: 13, opacity: computing ? 0.7 : 1 }}
            >
              <Zap size={14} />
              {computing ? 'Recomputing…' : 'Recompute Scores'}
            </button>
            <button
              onClick={load}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, cursor: 'pointer', fontSize: 13 }}
            >
              <RefreshCw size={14} />
              {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary KPI strip */}
        {!loading && data.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Total Candidates', value: data.length, icon: Users, color: BLUE },
              { label: 'High Priority',    value: highCount,   icon: AlertCircle, color: RED },
              { label: 'Medium Priority',  value: mediumCount, icon: TrendingUp,  color: ORANGE },
              { label: 'Potential MRR Uplift', value: `₹${totalUpsellMrr.toLocaleString('en-IN')}`, icon: Zap, color: GREEN },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={color} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT }}>{value}</p>
                  <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${ACCENT}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: MUTED, margin: 0 }}>Analysing expansion opportunities…</p>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: RED }}>
            {error}
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: MUTED }}>
            <CheckCircle2 size={48} color={GREEN} style={{ margin: '0 auto 16px' }} />
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: TEXT }}>No expansion opportunities found</p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>All active tenants are either on the highest plan or have low seat utilization.</p>
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
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
