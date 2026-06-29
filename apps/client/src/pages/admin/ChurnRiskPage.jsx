import React, { useState, useEffect } from 'react';
import { Brain, TrendingDown, RefreshCw } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAllChurnScores } from '../../services/adminService.js';
import api from '../../services/api.js';
import { formatDate, churnRiskColor } from '../../utils/helpers.js';

const getRiskLabel = (score) => {
  if (score > 75) return { label: 'High',   cls: 'badge badge-danger' };
  if (score > 40) return { label: 'Medium', cls: 'badge badge-warning' };
  return               { label: 'Low',    cls: 'badge badge-success' };
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
        const list = res.data.data?.churnScores || res.data.data || [];
        // Sort by score descending
        setScores([...list].sort((a, b) => b.churnRiskScore - a.churnRiskScore));
      })
      .catch(() => setError('Failed to load churn scores.'))
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
    <AdminLayout>
      <div style={{ maxWidth: 1200 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <Brain size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Churn Risk Analysis
            </h1>
            <p className="page-subtitle">AI-powered churn predictions sorted by risk score</p>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {toast && <div className="alert alert-success">{toast}</div>}

        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : scores.length === 0 ? (
            <div className="empty-state">
              <Brain size={40} className="empty-state-icon" />
              <h3>No churn analysis yet</h3>
              <p>The nightly AI job runs at 03:00 UTC. Trigger analysis manually per tenant.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tenant</th>
                  <th>Risk Score</th>
                  <th>Risk Level</th>
                  <th>Key Signals</th>
                  <th>Recommendation</th>
                  <th>Analyzed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s, idx) => {
                  const risk = getRiskLabel(s.churnRiskScore);
                  const color = churnRiskColor(s.churnRiskScore);
                  const tenantId = s.tenantId?._id || s.tenantId;
                  const tenantName = s.tenantId?.name || s.tenantName || tenantId;

                  return (
                    <tr key={s._id}>
                      <td style={{ color: 'var(--color-text-muted)', fontWeight: 600, width: 40 }}>
                        {idx + 1}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{tenantName}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 22, fontWeight: 800, color,
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 36, textAlign: 'right',
                          }}>
                            {s.churnRiskScore}
                          </span>
                          <div style={{ flex: 1, maxWidth: 80 }}>
                            <div className="progress-bar-track" style={{ height: 6 }}>
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${s.churnRiskScore}%`,
                                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={risk.cls}>{risk.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                          {(s.keySignals || []).slice(0, 3).map((sig, i) => (
                            <span key={i} className="signal-tag">{sig}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 160, display: 'block' }}>
                          {s.recommendedAction || (s.churnRiskScore > 75 ? 'Immediate outreach' : s.churnRiskScore > 40 ? 'Monitor closely' : 'No action needed')}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                        {s.analyzedAt ? formatDate(s.analyzedAt) : '—'}
                      </td>
                      <td>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => triggerAnalysis(tenantId, tenantName)}
                          disabled={!!triggering[tenantId]}
                          title="Trigger fresh AI analysis"
                        >
                          {triggering[tenantId]
                            ? <span className="btn-spinner" style={{ borderTopColor: 'var(--color-primary)' }} />
                            : <><RefreshCw size={13} /> Analyze</>
                          }
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
