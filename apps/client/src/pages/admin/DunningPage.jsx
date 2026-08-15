import React, { useState, useEffect } from 'react';
import { AlertOctagon, RotateCcw, XCircle, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getActiveDunning, resetDunning, abandonDunning } from '../../services/adminService.js';
import { formatCurrency, formatDateTime, formatDate } from '../../utils/helpers.js';

const STEPS = [0, 3, 7, 14];

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center gap-1.5 w-full max-w-[200px]">
      {STEPS.map((day, i) => (
        <React.Fragment key={day}>
          <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 border-2 transition-colors ${
            i <= currentStep ? 'bg-danger text-white border-danger' : 'bg-surface-secondary text-text-muted border-border'
          }`}>
            {day}d
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 min-w-[12px] transition-colors ${
              i < currentStep ? 'bg-danger' : 'bg-border'
            }`} />
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
    <AdminLayout title="Dunning">
      <div className="max-w-[1200px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <AlertOctagon size={18} className="text-primary" />
              </div>
              Dunning Records
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">Active payment recovery workflows</p>
          </div>
          {!loading && (
            <span className="px-3.5 py-1.5 rounded-full text-[13px] font-bold bg-danger/15 text-danger border border-danger/30">
              {records.length} active
            </span>
          )}
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}
        {toast && <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm font-medium">{toast}</div>}

        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={36} className="text-primary animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 px-6 text-center text-text-muted">
              <AlertOctagon size={48} className="mx-auto mb-4 opacity-40 text-text-muted" />
              <h3 className="m-0 text-[17px] font-semibold text-text-primary mb-2">No active dunning records</h3>
              <p className="m-0 text-sm">All customers are in good standing.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Tenant</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Invoice</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Amount Due</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Step Progress</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Next Retry</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => (
                    <tr key={rec._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-[13px] font-semibold text-text-primary">{rec.tenant?.name || rec.tenantId}</div>
                        <div className="text-[12px] text-text-muted mt-0.5">{rec.tenant?.slug}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <code className="text-[12px] text-primary font-mono bg-primary/5 px-2 py-1 rounded border border-primary/10">
                          {rec.invoice?.invoiceNumber || rec.invoiceId?.slice(-8)}
                        </code>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-[13px] font-bold text-danger">
                          {formatCurrency(rec.invoice?.total || rec.amountDue || 0)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StepIndicator currentStep={rec.currentStep || 0} />
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-text-muted">
                        {rec.nextRetryAt ? formatDate(rec.nextRetryAt) : '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border-none bg-surface-secondary hover:bg-border text-text-primary cursor-pointer transition-colors flex items-center gap-1.5"
                            onClick={() => setModal({ type: 'reset', record: rec })}
                            title="Reset to step 0 and retry immediately"
                          >
                            <RotateCcw size={13} className="text-text-primary" /> Reset
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border-none bg-danger/10 hover:bg-danger/20 text-danger cursor-pointer transition-colors flex items-center gap-1.5"
                            onClick={() => setModal({ type: 'abandon', record: rec })}
                            title="Abandon dunning and suspend tenant"
                          >
                            <XCircle size={13} className="text-danger" /> Abandon
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modals */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-[420px] shadow-xl" onClick={(e) => e.stopPropagation()}>
              
              {modal.type === 'reset' && (
                <>
                  <h3 className="m-0 mb-4 text-[18px] font-bold text-text-primary flex items-center gap-2">
                    <RotateCcw size={18} className="text-primary" /> Reset Dunning?
                  </h3>
                  <p className="m-0 mb-6 text-[14px] text-text-muted leading-relaxed">
                    This will reset dunning to step 0 and schedule an immediate retry for <strong className="text-text-primary">{modal.record.tenant?.name || 'this tenant'}</strong>.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setModal(null)} disabled={actionLoad}>Cancel</button>
                    <button className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white font-semibold text-[13px] min-w-[120px] flex items-center justify-center cursor-pointer transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={handleReset} disabled={actionLoad}>
                      {actionLoad ? <Loader2 size={16} className="animate-spin text-white" /> : 'Confirm Reset'}
                    </button>
                  </div>
                </>
              )}

              {modal.type === 'abandon' && (
                <>
                  <div className="flex gap-4 mb-4">
                    <AlertOctagon size={28} className="text-danger shrink-0" />
                    <div>
                      <h3 className="m-0 text-[18px] font-bold text-text-primary">Abandon Dunning?</h3>
                      <p className="m-0 mt-1.5 text-[14px] font-semibold text-danger">
                        ⚠ This will immediately suspend the tenant.
                      </p>
                    </div>
                  </div>
                  <p className="m-0 mb-6 text-[14px] text-text-muted leading-relaxed">
                    <strong className="text-text-primary">{modal.record.tenant?.name || 'This tenant'}</strong> will lose access to the platform immediately. This action cannot be undone without manually restoring their status.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setModal(null)} disabled={actionLoad}>Cancel</button>
                    <button className="px-4 py-2 rounded-lg border-none bg-danger hover:bg-red-600 text-white font-semibold text-[13px] min-w-[150px] flex items-center justify-center cursor-pointer transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={handleAbandon} disabled={actionLoad}>
                      {actionLoad ? <Loader2 size={16} className="animate-spin text-white" /> : 'Abandon & Suspend'}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
