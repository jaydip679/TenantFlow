import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Wallet } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getPaymentHistory } from '../../services/subscriptionService.js';
import { formatCurrency, formatDateTime } from '../../utils/helpers.js';

const STATUS_MAP = {
  captured:  { label: 'Captured', cls: 'badge badge-success' },
  failed:    { label: 'Failed',   cls: 'badge badge-danger' },
  refunded:  { label: 'Refunded', cls: 'badge badge-warning' },
  pending:   { label: 'Pending',  cls: 'badge badge-info' },
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
    <DashboardLayout>
      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <Wallet size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Payment History
            </h1>
            <p className="page-subtitle">All payment transactions for your account</p>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <Wallet size={40} className="empty-state-icon" />
              <h3>No payments yet</h3>
              <p>Your payment transactions will appear here.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((txn) => {
                  const badge = STATUS_MAP[txn.status] || { label: txn.status, cls: 'badge badge-neutral' };
                  return (
                    <tr key={txn._id}>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {formatDateTime(txn.paidAt || txn.createdAt)}
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(txn.amount)}</td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>
                        {txn.method || 'Card'}
                      </td>
                      <td><span className={badge.cls}>{badge.label}</span></td>
                      <td>
                        <code style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                          {txn.razorpayPaymentId || txn._id?.slice(-8) || '—'}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
              <div className="pagination-controls">
                <button className="btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
