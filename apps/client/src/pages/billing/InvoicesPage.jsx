import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Receipt, Download, CreditCard, Loader2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import RazorpayCheckout from '../../components/billing/RazorpayCheckout.jsx';
import { getInvoices, getInvoicePdf } from '../../services/subscriptionService.js';
import { formatCurrency, formatDate } from '../../utils/helpers.js';

const STATUS_STYLES = {
  paid:          { className: 'bg-success/10 text-success border border-success/20', label: 'Paid' },
  open:          { className: 'bg-warning/10 text-warning border border-warning/20', label: 'Open' },
  void:          { className: 'bg-surface-secondary text-text-muted border border-border', label: 'Void' },
  uncollectible: { className: 'bg-danger/10 text-danger border border-danger/20', label: 'Uncollectible' },
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
    <DashboardLayout title="Invoices">
      <div className="max-w-[1100px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Receipt size={18} className="text-primary" />
              </div>
              Invoices
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">Download PDF invoices and pay outstanding balances</p>
          </div>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}

        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary/50 border-b border-border">
                  {['Invoice #', 'Date', 'Amount', 'Status', 'Actions'].map((h) => (
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
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-text-muted">
                      <Receipt size={48} className="mx-auto mb-3 text-text-muted/40" />
                      <h3 className="text-base font-bold text-text-primary m-0 mb-1">No invoices yet</h3>
                      <p className="text-sm m-0">Your invoices will appear here once billing begins.</p>
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const badge = STATUS_STYLES[inv.status] || STATUS_STYLES.void;
                    return (
                      <tr key={inv._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-semibold text-[13px] text-primary">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[13px]">
                          {formatDate(inv.issuedAt || inv.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[13px] font-semibold">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex gap-2 items-center">
                            <button
                              className="px-3 py-1.5 rounded-lg border border-transparent bg-transparent text-text-muted hover:text-text-primary hover:bg-surface-secondary cursor-pointer text-xs font-semibold transition-colors flex items-center gap-1.5"
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
                                  className="px-3 py-1.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-xs font-semibold transition-colors flex items-center gap-1.5"
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
