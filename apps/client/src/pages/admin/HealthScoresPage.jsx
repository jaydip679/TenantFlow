import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, RefreshCw, Zap, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle, Loader2,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getHealthScores, computeHealthScores } from '../../services/healthService.js';

const GRADE_CONFIG = {
  A: { colorClass: 'text-emerald-500', bgClass: 'bg-emerald-500/15', label: 'Excellent', icon: CheckCircle2 },
  B: { colorClass: 'text-blue-500',    bgClass: 'bg-blue-500/15',    label: 'Good',      icon: CheckCircle2 },
  C: { colorClass: 'text-orange-500',  bgClass: 'bg-orange-500/15',  label: 'Fair',      icon: AlertTriangle },
  D: { colorClass: 'text-red-500',     bgClass: 'bg-red-500/15',     label: 'At Risk',   icon: AlertTriangle },
  F: { colorClass: 'text-red-600',     bgClass: 'bg-red-600/15',     label: 'Critical',  icon: XCircle },
};

function GradeBadge({ grade }) {
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG.C;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold ${cfg.bgClass} ${cfg.colorClass}`}>
      {grade} &middot; {cfg.label}
    </span>
  );
}

function ScoreMini({ score }) {
  const colorClass = score >= 80 ? 'bg-emerald-500' : score >= 65 ? 'bg-blue-500' : score >= 50 ? 'bg-orange-500' : 'bg-red-500';
  const textClass = score >= 80 ? 'text-emerald-500' : score >= 65 ? 'text-blue-500' : score >= 50 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-[80px] h-1.5 rounded bg-surface-secondary overflow-hidden">
        <div className={`h-full rounded ${colorClass}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[13px] font-bold min-w-[30px] ${textClass}`}>{score}</span>
    </div>
  );
}

function ComponentRow({ label, component }) {
  if (!component) return null;
  const colorClass = component.score >= 70 ? 'bg-emerald-500' : component.score >= 45 ? 'bg-orange-500' : 'bg-red-500';
  const textClass = component.score >= 70 ? 'text-emerald-500' : component.score >= 45 ? 'text-orange-500' : 'text-red-500';
  
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <span className="flex-1 text-[12px] text-text-muted">{label}</span>
      <div className="w-[60px] h-1.5 rounded-full bg-surface-secondary overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${component.score}%` }} />
      </div>
      <span className={`text-[12px] font-bold w-7 text-right ${textClass}`}>{component.score}</span>
      <span className="text-[11px] text-text-muted flex-[2] text-right">{component.signal}</span>
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
        className="cursor-pointer transition-colors hover:bg-surface-secondary/40 border-b border-border last:border-0"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3.5 text-[13px] font-bold text-text-primary">{tenant?.name || '—'}</td>
        <td className="px-4 py-3.5"><GradeBadge grade={doc.grade} /></td>
        <td className="px-4 py-3.5"><ScoreMini score={doc.score} /></td>
        <td className="px-4 py-3.5 text-[12px] text-text-muted">
          {doc.computedAt ? new Date(doc.computedAt).toLocaleDateString('en-IN') : '—'}
        </td>
        <td className="px-4 py-3.5 text-right">
          <button
            onClick={e => { e.stopPropagation(); onView(tenant?._id || doc.tenantId); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[12px] transition-colors"
          >
            Detail <ExternalLink size={12} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={5} className="px-5 pb-5 pt-2 bg-surface-secondary/20">
            <div>
              <p className="m-0 mb-3 text-[12px] font-bold text-text-primary uppercase tracking-[0.05em]">Component Breakdown</p>
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
    <AdminLayout title="Health Scores">
      <div className="font-sans text-text-primary max-w-[1200px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">
              Customer Health Scores
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">
              Operational health snapshot per tenant — payment reliability, seat utilization, tenure
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={triggerCompute}
              disabled={computing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary cursor-pointer text-[13px] font-semibold disabled:opacity-70 disabled:cursor-not-allowed hover:bg-primary/15 transition-colors"
            >
              {computing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} 
              {computing ? 'Computing…' : 'Recompute All'}
            </button>
            <button
              onClick={() => load()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors"
            >
              <RefreshCw size={14} /> {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Grade distribution */}
        {!loading && data.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mb-7">
            <button
              onClick={() => { setGradeFilter(''); load(''); }}
              className={`px-4 py-1.5 rounded-full border text-[12px] font-bold cursor-pointer transition-colors ${
                gradeFilter === '' ? 'bg-primary/15 border-primary text-primary' : 'bg-transparent border-border text-text-muted hover:border-text-muted'
              }`}
            >
              All ({data.length})
            </button>
            {Object.entries(gradeCounts).map(([g, cnt]) => {
              const cfg = GRADE_CONFIG[g];
              return (
                <button key={g}
                  onClick={() => { setGradeFilter(g); load(g); }}
                  className={`px-4 py-1.5 rounded-full border text-[12px] font-bold cursor-pointer transition-colors ${
                    gradeFilter === g ? `${cfg.bgClass} border-current ${cfg.colorClass}` : 'bg-transparent border-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  Grade {g} ({cnt})
                </button>
              );
            })}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={40} className="text-primary animate-spin mx-auto mb-4" />
            <p className="text-text-muted m-0 text-sm">Loading health scores…</p>
          </div>
        ) : data.length === 0 ? (
          <div className="py-20 text-center text-text-muted">
            <Heart size={48} className="mx-auto mb-4 opacity-40 text-text-muted" />
            <p className="m-0 text-[16px] font-bold text-text-primary mb-1.5">No health scores yet</p>
            <p className="m-0 text-[13px] mb-5">Click "Recompute All" to generate health scores for all active tenants.</p>
            <button
              onClick={triggerCompute}
              className="px-6 py-2.5 rounded-xl border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[14px] font-semibold transition-colors"
            >
              Generate Health Scores
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    {['Tenant', 'Grade', 'Score', 'Computed', 'Actions'].map(h => (
                      <th key={h} className={`px-4 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] ${h === 'Actions' ? 'text-right' : ''}`}>
                        {h}
                      </th>
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
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
