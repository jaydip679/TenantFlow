import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Wallet } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getPaymentHistory } from '../../services/subscriptionService.js';
import { formatCurrency, formatDateTime } from '../../utils/helpers.js';

const STATUS_MAP = {
  captured:  { label: 'Captured', cls: 'bg-success/10 text-success border border-success/20' },
  failed:    { label: 'Failed',   cls: 'bg-danger/10 text-danger border border-danger/20' },
  refunded:  { label: 'Refunded', cls: 'bg-warning/10 text-warning border border-warning/20' },
  pending:   { label: 'Pending',  cls: 'bg-info/10 text-info border border-info/20' },
};

export default function PaymentHistoryPage() {
  const user     = useSelector((s) => s.auth.user);
  const tenantId = user?.tenantId;

  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const limit = 15;

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    getPaymentHistory(tenantId, { page, limit })
      .then((res) => {
        setPayments(res.data.data.transactions || res.data.data.payments || []);
        setTotal(res.data.data.pagination?.total || 0);
      })
      .catch(() => setError('Failed to load payment history.'))
      .finally(() => setLoading(false));
  }, [tenantId, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <DashboardLayout title="Payment History">
      <div className="max-w-[1100px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Wallet size={18} className="text-primary" />
              </div>
              Payment History
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">All payment transactions for your account</p>
          </div>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}

        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary/50 border-b border-border">
                  {['Date', 'Amount', 'Method', 'Status', 'Reference ID'].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td colSpan={5} className="p-0">
                        <div className="h-14 bg-surface-secondary/40 animate-pulse my-0.5" />
                      </td>
                    </tr>
                  ))
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-text-muted">
                      <Wallet size={48} className="mx-auto mb-3 text-text-muted/40" />
                      <h3 className="text-base font-bold text-text-primary m-0 mb-1">No payments yet</h3>
                      <p className="text-sm m-0">Your payment transactions will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  payments.map((txn) => {
                    const badge = STATUS_MAP[txn.status] || { label: txn.status, cls: 'bg-surface-secondary text-text-muted border border-border' };
                    return (
                      <tr key={txn._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                        <td className="px-4 py-3.5 whitespace-nowrap text-text-muted text-[13px]">
                          {formatDateTime(txn.paidAt || txn.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[13px] font-semibold">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-text-muted capitalize">
                          {txn.method || 'Card'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <code className="text-xs text-text-muted bg-surface-secondary px-2 py-1 rounded">
                            {txn.razorpayPaymentId || txn._id?.slice(-8) || '—'}
                          </code>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-secondary/30">
              <span className="text-[13px] text-text-muted font-medium">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button 
                  className="px-3 py-1.5 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                >
                  &larr; Prev
                </button>
                <button 
                  className="px-3 py-1.5 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  disabled={page >= totalPages} 
                  onClick={() => setPage(p => p + 1)}
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
