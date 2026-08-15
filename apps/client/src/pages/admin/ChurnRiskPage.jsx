import React, { useState, useEffect } from 'react';
import { Brain, RefreshCw, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAllChurnScores } from '../../services/adminService.js';
import api from '../../services/api.js';
import { formatDate, churnRiskColor } from '../../utils/helpers.js';

const getRiskLabel = (score) => {
  if (score > 75) return { label: 'High',   cls: 'bg-danger/15 text-danger border-danger/30' };
  if (score > 40) return { label: 'Medium', cls: 'bg-warning/15 text-warning border-warning/30' };
  return               { label: 'Low',    cls: 'bg-success/15 text-success border-success/30' };
};

export default function ChurnRiskPage() {
  const [scores,    setScores]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [toast,     setToast]     = useState('');
  const [triggering, setTriggering] = useState({});

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    getAllChurnScores()
      .then((res) => {
        const raw  = res.data.data;
        const list = Array.isArray(raw?.churnScores)
          ? raw.churnScores
          : Array.isArray(raw) ? raw : [];
        setScores([...list].sort((a, b) => b.churnRiskScore - a.churnRiskScore));
      })
      .catch((err) => {
        // 404 = no scores yet (AI cron hasn't run) — show empty state, not error
        if (err.response?.status === 404) return;
        setError('Failed to load churn scores.');
      })
      .finally(() => setLoading(false));
  }, []);

  const triggerAnalysis = async (tenantId, tenantName) => {
    setTriggering((prev) => ({ ...prev, [tenantId]: true }));
    try {
      await api.post(`/ai/churn/trigger/${tenantId}`);
      showToast(`Analysis enqueued for ${tenantName}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to trigger analysis.');
    } finally {
      setTriggering((prev) => ({ ...prev, [tenantId]: false }));
    }
  };

  return (
    <AdminLayout title="Churn Risk Analysis">
      <div className="max-w-[1200px] font-sans text-text-primary">
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Brain size={18} className="text-primary" />
            </div>
            Churn Risk Analysis
          </h1>
          <p className="m-0 mt-1.5 text-sm text-text-muted">AI-powered churn predictions sorted by risk score</p>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}
        {toast && <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm font-medium">{toast}</div>}

        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={36} className="text-primary animate-spin" />
            </div>
          ) : scores.length === 0 ? (
            <div className="py-16 px-6 text-center text-text-muted">
              <Brain size={48} className="mx-auto mb-4 opacity-40 text-text-muted" />
              <h3 className="m-0 text-[17px] font-semibold text-text-primary mb-2">No churn analysis yet</h3>
              <p className="m-0 text-sm">The nightly AI job runs at 03:00 UTC. Trigger analysis manually per tenant.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em] w-10">#</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Tenant</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Risk Score</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Risk Level</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Key Signals</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Recommendation</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Analyzed</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, idx) => {
                    const risk = getRiskLabel(s.churnRiskScore);
                    const color = churnRiskColor(s.churnRiskScore);
                    const tenantId = s.tenantId?._id || s.tenantId;
                    const tenantName = s.tenantId?.name || s.tenantName || tenantId;

                    return (
                      <tr key={s._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                        <td className="px-5 py-3.5 text-[13px] text-text-muted font-semibold w-10 whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] font-semibold text-text-primary whitespace-nowrap">
                          {tenantName}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span 
                              className="text-[22px] font-extrabold tabular-nums min-w-[36px] text-right" 
                              style={{ color }}
                            >
                              {s.churnRiskScore}
                            </span>
                            <div className="flex-1 max-w-[80px]">
                              <div className="h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500 ease-out"
                                  style={{
                                    width: `${s.churnRiskScore}%`,
                                    background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${risk.cls}`}>
                            {risk.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(s.keySignals || []).slice(0, 3).map((sig, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-surface-secondary text-[11px] font-medium text-text-secondary border border-border whitespace-nowrap">
                                {sig}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[12px] text-text-muted max-w-[160px] block leading-snug">
                            {s.recommendedAction || (s.churnRiskScore > 75 ? 'Immediate outreach' : s.churnRiskScore > 40 ? 'Monitor closely' : 'No action needed')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-text-muted whitespace-nowrap">
                          {s.analyzedAt ? formatDate(s.analyzedAt) : '—'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <button
                            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border-none bg-surface-secondary hover:bg-border text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                            onClick={() => triggerAnalysis(tenantId, tenantName)}
                            disabled={!!triggering[tenantId]}
                            title="Trigger fresh AI analysis"
                          >
                            {triggering[tenantId]
                              ? <Loader2 size={13} className="animate-spin text-primary" />
                              : <><RefreshCw size={13} className="text-primary" /> Analyze</>
                            }
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
