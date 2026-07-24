import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, RefreshCw, Zap, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getHealthScores, computeHealthScores } from '../../services/healthService.js';

const TEXT   = '#f0f0ff';
const MUTED  = '#8b8bad';
const BORDER = 'rgba(255,255,255,0.08)';
const CARD   = 'rgba(255,255,255,0.04)';
const ACCENT = '#6c63ff';
const GREEN  = '#4ade80';
const BLUE   = '#60a5fa';
const ORANGE = '#fb923c';
const RED    = '#f87171';

const GRADE_CONFIG = {
  A: { color: GREEN,  bg: 'rgba(74,222,128,0.12)',  label: 'Excellent',  icon: CheckCircle2 },
  B: { color: BLUE,   bg: 'rgba(96,165,250,0.12)',  label: 'Good',       icon: CheckCircle2 },
  C: { color: ORANGE, bg: 'rgba(251,146,60,0.12)',  label: 'Fair',       icon: AlertTriangle },
  D: { color: RED,    bg: 'rgba(248,113,113,0.12)', label: 'At Risk',    icon: AlertTriangle },
  F: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Critical', icon: XCircle },
};

function GradeBadge({ grade }) {
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG.C;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: cfg.bg, color: cfg.color,
    }}>
      {grade} · {cfg.label}
    </span>
  );
}

function ScoreMini({ score }) {
  const color = score >= 80 ? GREEN : score >= 65 ? BLUE : score >= 50 ? ORANGE : RED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${score}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 30 }}>{score}</span>
    </div>
  );
}

function ComponentRow({ label, component }) {
  if (!component) return null;
  const color = component.score >= 70 ? GREEN : component.score >= 45 ? ORANGE : RED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ flex: 1, fontSize: 12, color: MUTED }}>{label}</span>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ width: `${component.score}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, width: 28, textAlign: 'right' }}>{component.score}</span>
      <span style={{ fontSize: 11, color: MUTED, flex: 2, textAlign: 'right' }}>{component.signal}</span>
    </div>
  );
}

function HealthRow({ doc, onView }) {
  const [expanded, setExpanded] = useState(false);
  const tenant = doc.tenantId;
  const comp   = doc.components || {};

  return (
    <>
      <tr
        style={{ cursor: 'pointer', transition: 'background 0.1s' }}
        onClick={() => setExpanded(v => !v)}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: '12px 14px', color: TEXT, fontWeight: 600 }}>{tenant?.name || '—'}</td>
        <td style={{ padding: '12px 14px' }}><GradeBadge grade={doc.grade} /></td>
        <td style={{ padding: '12px 14px' }}><ScoreMini score={doc.score} /></td>
        <td style={{ padding: '12px 14px', color: MUTED, fontSize: 12 }}>
          {doc.computedAt ? new Date(doc.computedAt).toLocaleDateString('en-IN') : '—'}
        </td>
        <td style={{ padding: '12px 14px' }}>
          <button
            onClick={e => { e.stopPropagation(); onView(tenant?._id || doc.tenantId); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: 11 }}
          >
            Detail <ExternalLink size={11} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: '0 14px 14px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ paddingTop: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: TEXT }}>Component Breakdown</p>
              <ComponentRow label="Payment Health (30%)"        component={comp.paymentHealth} />
              <ComponentRow label="Seat Utilization (20%)"      component={comp.seatUtilization} />
              <ComponentRow label="Plan Longevity (20%)"        component={comp.planLongevity} />
              <ComponentRow label="Invoice Payment Speed (20%)" component={comp.invoicePaymentSpeed} />
              <ComponentRow label="Dunning Risk (10%)"          component={comp.dunningRisk} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function HealthScoresPage() {
  const navigate   = useNavigate();
  const [data,       setData]      = useState([]);
  const [pagination, setPagination]= useState(null);
  const [loading,    setLoading]   = useState(true);
  const [computing,  setComputing] = useState(false);
  const [gradeFilter,setGradeFilter]= useState('');
  const [lastRefresh,setLastRefresh]= useState(null);

  const load = async (grade = gradeFilter) => {
    setLoading(true);
    try {
      const r = await getHealthScores({ limit: 50, grade: grade || undefined });
      setData(r.data.data.scores || []);
      setPagination(r.data.data.pagination);
      setLastRefresh(new Date());
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const triggerCompute = async () => {
    setComputing(true);
    try {
      await computeHealthScores({});
      await load();
    } catch { /* silent */ }
    finally { setComputing(false); }
  };

  useEffect(() => { load(); }, []);

  // Grade distribution stats
  const gradeCounts = ['A', 'B', 'C', 'D', 'F'].reduce((acc, g) => {
    acc[g] = data.filter(d => d.grade === g).length;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div style={{ color: TEXT }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
              Customer Health Scores
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: MUTED }}>
              Operational health snapshot per tenant — payment reliability, seat utilization, tenure
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={triggerCompute}
              disabled={computing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.08)', color: '#a78bfa', cursor: computing ? 'not-allowed' : 'pointer', fontSize: 13, opacity: computing ? 0.7 : 1 }}
            >
              <Zap size={14} /> {computing ? 'Computing…' : 'Recompute All'}
            </button>
            <button
              onClick={() => load()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, cursor: 'pointer', fontSize: 13 }}
            >
              <RefreshCw size={14} /> {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Grade distribution */}
        {!loading && data.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setGradeFilter(''); load(''); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${gradeFilter === '' ? ACCENT : BORDER}`, background: gradeFilter === '' ? 'rgba(108,99,255,0.15)' : 'transparent', color: gradeFilter === '' ? '#a78bfa' : MUTED, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              All ({data.length})
            </button>
            {Object.entries(gradeCounts).map(([g, cnt]) => {
              const cfg = GRADE_CONFIG[g];
              return (
                <button key={g}
                  onClick={() => { setGradeFilter(g); load(g); }}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${gradeFilter === g ? cfg.color : BORDER}`, background: gradeFilter === g ? cfg.bg : 'transparent', color: gradeFilter === g ? cfg.color : MUTED, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Grade {g} ({cnt})
                </button>
              );
            })}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${ACCENT}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: MUTED, margin: 0 }}>Loading health scores…</p>
          </div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: MUTED }}>
            <Heart size={40} color={MUTED} style={{ margin: '0 auto 16px' }} />
            <p style={{ margin: 0, fontSize: 15, color: TEXT }}>No health scores yet</p>
            <p style={{ margin: '6px 0 16px', fontSize: 13 }}>Click "Recompute All" to generate health scores for all active tenants.</p>
            <button
              onClick={triggerCompute}
              style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Generate Health Scores
            </button>
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Tenant', 'Grade', 'Score', 'Computed', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(doc => (
                  <HealthRow
                    key={doc._id}
                    doc={doc}
                    onView={(id) => navigate(`/admin/tenants/${id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
