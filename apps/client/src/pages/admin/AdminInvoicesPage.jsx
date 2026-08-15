import React, { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAllInvoices } from '../../services/adminService.js';
import { formatCurrency, formatDate } from '../../utils/helpers.js';

const STATUS_MAP = {
  paid:          { cls: 'bg-success/15 text-success border-success/30', label: 'Paid' },
  open:          { cls: 'bg-accent/15 text-accent border-accent/30',    label: 'Open' },
  void:          { cls: 'bg-text-muted/20 text-text-muted border-transparent', label: 'Void' },
  uncollectible: { cls: 'bg-danger/15 text-danger border-danger/30',  label: 'Uncollectible' },
};

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [filter,   setFilter]   = useState({ status: '', tenantId: '' });
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    const params = { page, limit, ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) };
    getAllInvoices(params)
      .then((res) => {
        setInvoices(res.data.data?.invoices || []);
        setTotal(res.data.data?.pagination?.total || 0);
      })
      .catch(() => setError('Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, [page, filter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title="Invoices">
      <div className="max-w-[1200px] font-sans text-text-primary">
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-primary" />
            </div>
            All Invoices
          </h1>
          <p className="m-0 mt-1.5 text-sm text-text-muted">Cross-tenant invoice management</p>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}

        {/* Filters */}
        <div className="flex gap-4 items-center mb-6">
          <select 
            className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary transition-colors cursor-pointer"
            value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="uncollectible">Uncollectible</option>
          </select>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={36} className="text-primary animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 px-6 text-center text-text-muted">
              <FileText size={48} className="mx-auto mb-4 opacity-40 text-text-muted" />
              <h3 className="m-0 text-[17px] font-semibold text-text-primary">No invoices found</h3>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Invoice #</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Tenant</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Date</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Amount</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const badge = STATUS_MAP[inv.status] || STATUS_MAP.void;
                    return (
                      <tr key={inv._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                        <td className="px-5 py-3.5 text-[13px] font-mono text-primary font-medium whitespace-nowrap">{inv.invoiceNumber}</td>
                        <td className="px-5 py-3.5 text-[13px] font-semibold text-text-primary whitespace-nowrap">{inv.tenant?.name || inv.tenantId}</td>
                        <td className="px-5 py-3.5 text-[13px] text-text-muted whitespace-nowrap">{formatDate(inv.issuedAt || inv.createdAt)}</td>
                        <td className="px-5 py-3.5 text-[13px] font-bold text-text-primary whitespace-nowrap">{formatCurrency(inv.total)}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-secondary/30">
              <span className="text-[13px] text-text-muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
              <div className="flex gap-2">
                <button 
                  className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border-none bg-surface-secondary hover:bg-border text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                >
                  &larr; Prev
                </button>
                <button 
                  className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border-none bg-surface-secondary hover:bg-border text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
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
    </AdminLayout>
  );
}
