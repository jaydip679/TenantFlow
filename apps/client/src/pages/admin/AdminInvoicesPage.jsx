import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAllInvoices } from '../../services/adminService.js';
import { formatCurrency, formatDate } from '../../utils/helpers.js';

const STATUS_MAP = {
  paid:          { cls: 'badge badge-success', label: 'Paid' },
  open:          { cls: 'badge badge-info',    label: 'Open' },
  void:          { cls: 'badge badge-neutral', label: 'Void' },
  uncollectible: { cls: 'badge badge-danger',  label: 'Uncollectible' },
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
    <AdminLayout>
      <div style={{ maxWidth: 1200 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <FileText size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              All Invoices
            </h1>
            <p className="page-subtitle">Cross-tenant invoice management</p>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {/* Filters */}
        <div className="filter-bar">
          <select className="form-select" style={{ width: 'auto' }}
            value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="uncollectible">Uncollectible</option>
          </select>
        </div>

        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <FileText size={40} className="empty-state-icon" />
              <h3>No invoices found</h3>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Invoice #</th><th>Tenant</th><th>Date</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const badge = STATUS_MAP[inv.status] || STATUS_MAP.void;
                  return (
                    <tr key={inv._id}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{inv.invoiceNumber}</td>
                      <td style={{ fontWeight: 500 }}>{inv.tenant?.name || inv.tenantId}</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{formatDate(inv.issuedAt || inv.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(inv.total)}</td>
                      <td><span className={badge.cls}>{badge.label}</span></td>
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
    </AdminLayout>
  );
}
