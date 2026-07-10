import React, { useState, useEffect } from 'react';
import { AlertOctagon, RotateCcw, XCircle } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getActiveDunning, resetDunning, abandonDunning } from '../../services/adminService.js';
import { formatCurrency, formatDateTime, formatDate } from '../../utils/helpers.js';

const STEPS = [0, 3, 7, 14];

function StepIndicator({ currentStep }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {STEPS.map((day, i) => (
        <React.Fragment key={day}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i <= currentStep ? 'var(--color-danger)' : 'var(--color-surface-2)',
            color: i <= currentStep ? '#fff' : 'var(--color-text-muted)',
            border: `2px solid ${i === currentStep ? 'var(--color-danger)' : 'var(--color-border)'}`,
          }}>
            {day}d
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, minWidth: 16, background: i < currentStep ? 'var(--color-danger)' : 'var(--color-border)' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function DunningPage() {
  const [records,     setRecords]   = useState([]);
  const [loading,     setLoading]   = useState(true);
  const [error,       setError]     = useState('');
  const [toast,       setToast]     = useState('');
  const [modal,       setModal]     = useState(null); // { type: 'reset'|'abandon', record }
  const [actionLoad,  setActionLoad] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getActiveDunning();
      const raw = res.data.data;
      // Safely extract array — raw could be { dunningRecords: [] } or [] or {}
      const list = Array.isArray(raw?.dunningRecords)
        ? raw.dunningRecords
        : Array.isArray(raw) ? raw : [];
      setRecords(list);
    } catch {
      setError('Failed to load dunning records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleReset = async () => {
    setActionLoad(true);
    try {
      await resetDunning(modal.record._id);
      showToast('Dunning reset — retrying from step 0.');
      setModal(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed.');
    } finally {
      setActionLoad(false);
    }
  };

  const handleAbandon = async () => {
    setActionLoad(true);
    try {
      await abandonDunning(modal.record._id);
      showToast('Dunning abandoned — tenant suspended.');
      setModal(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Abandon failed.');
    } finally {
      setActionLoad(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 1200 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <AlertOctagon size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Dunning Records
            </h1>
            <p className="page-subtitle">Active payment recovery workflows</p>
          </div>
          {!loading && (
            <span className="badge badge-danger" style={{ fontSize: 14, padding: '6px 14px' }}>
              {records.length} active
            </span>
          )}
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {toast && <div className="alert alert-success">{toast}</div>}

        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <AlertOctagon size={40} className="empty-state-icon" />
              <h3>No active dunning records</h3>
              <p>All customers are in good standing.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Invoice</th>
                  <th>Amount Due</th>
                  <th>Step Progress</th>
                  <th>Next Retry</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec._id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{rec.tenant?.name || rec.tenantId}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{rec.tenant?.slug}</div>
                    </td>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--color-primary)' }}>
                        {rec.invoice?.invoiceNumber || rec.invoiceId?.slice(-8)}
                      </code>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
                      {formatCurrency(rec.invoice?.total || rec.amountDue || 0)}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <StepIndicator currentStep={rec.currentStep || 0} />
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                      {rec.nextRetryAt ? formatDate(rec.nextRetryAt) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setModal({ type: 'reset', record: rec })}
                          title="Reset to step 0 and retry immediately"
                        >
                          <RotateCcw size={13} /> Reset
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => setModal({ type: 'abandon', record: rec })}
                          title="Abandon dunning and suspend tenant"
                        >
                          <XCircle size={13} /> Abandon
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Reset Modal */}
        {modal?.type === 'reset' && (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title"><RotateCcw size={18} style={{ display: 'inline', marginRight: 8 }} />Reset Dunning?</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                This will reset dunning to step 0 and schedule an immediate retry for <strong>{modal.record.tenant?.name || 'this tenant'}</strong>.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModal(null)} disabled={actionLoad}>Cancel</button>
                <button className="btn-primary" onClick={handleReset} disabled={actionLoad}>
                  {actionLoad ? <span className="btn-spinner" /> : 'Confirm Reset'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Abandon Modal */}
        {modal?.type === 'abandon' && (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                <AlertOctagon size={28} color="var(--color-danger)" style={{ flexShrink: 0 }} />
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Abandon Dunning?</h3>
                  <p style={{ color: 'var(--color-danger)', fontWeight: 500, fontSize: 14, marginTop: 6 }}>
                    ⚠ This will immediately suspend the tenant.
                  </p>
                </div>
              </div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                <strong>{modal.record.tenant?.name || 'This tenant'}</strong> will lose access to the platform immediately. This action cannot be undone without manually restoring their status.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModal(null)} disabled={actionLoad}>Cancel</button>
                <button className="btn-danger" onClick={handleAbandon} disabled={actionLoad}>
                  {actionLoad ? <span className="btn-spinner" /> : 'Abandon & Suspend'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
