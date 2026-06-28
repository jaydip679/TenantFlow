import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Receipt, Download, CreditCard } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import RazorpayCheckout from '../../components/billing/RazorpayCheckout.jsx';
import { getInvoices, getInvoicePdf } from '../../services/subscriptionService.js';
import { formatCurrency, formatDate } from '../../utils/helpers.js';

const STATUS_STYLES = {
  paid:          { className: 'badge badge-success', label: 'Paid' },
  open:          { className: 'badge badge-info',    label: 'Open' },
  void:          { className: 'badge badge-neutral', label: 'Void' },
  uncollectible: { className: 'badge badge-danger',  label: 'Uncollectible' },
};

export default function InvoicesPage() {
  const user     = useSelector((s) => s.auth.user);
  const tenantId = user?.tenantId;

  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [payingId, setPayingId] = useState(null);
  const limit = 10;

  const fetchInvoices = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await getInvoices(tenantId, { page, limit });
      setInvoices(res.data.data.invoices || []);
      setTotal(res.data.data.pagination?.total || 0);
    } catch {
      setError('Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [tenantId, page]);

  const handleDownloadPdf = async (invoiceId) => {
    try {
      const res = await getInvoicePdf(invoiceId);
      const url = res.data.data?.url || res.data.data?.signedUrl;
      if (url) window.open(url, '_blank');
      else alert('PDF not yet ready. Please try again in a moment.');
    } catch {
      alert('Failed to get PDF. Please try again.');
    }
  };

  const handlePaySuccess = () => {
    setPayingId(null);
    fetchInvoices(); // Refresh to show updated status
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <Receipt size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Invoices
            </h1>
            <p className="page-subtitle">Download PDF invoices and pay outstanding balances</p>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <Receipt size={40} className="empty-state-icon" />
              <h3>No invoices yet</h3>
              <p>Your invoices will appear here once billing begins.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const badge = STATUS_STYLES[inv.status] || STATUS_STYLES.void;
                  return (
                    <tr key={inv._id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-primary)' }}>
                        {inv.invoiceNumber}
                      </td>
                      <td>{formatDate(inv.issuedAt || inv.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(inv.total)}</td>
                      <td><span className={badge.className}>{badge.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => handleDownloadPdf(inv._id)}
                            title="Download PDF"
                          >
                            <Download size={14} /> PDF
                          </button>

                          {inv.status === 'open' && (
                            payingId === inv._id ? (
                              <RazorpayCheckout
                                invoiceId={inv._id}
                                amount={inv.total}
                                tenantName={user?.tenantName || user?.name}
                                onSuccess={handlePaySuccess}
                                onFailure={() => setPayingId(null)}
                              />
                            ) : (
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => setPayingId(inv._id)}
                              >
                                <CreditCard size={14} /> Pay Now
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
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
