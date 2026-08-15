import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Search,
  Filter,
  Eye,
  Ban,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAdminTenants, updateTenantStatus } from '../../services/adminService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(paise) {
  if (paise == null) return '₹0';
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

function statusBadge(status) {
  switch (status) {
    case 'active':    return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 'trialing':  return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
    case 'suspended': return 'bg-red-500/15 text-red-500 border-red-500/30';
    case 'cancelled': return 'bg-text-muted/15 text-text-muted border-text-muted/30';
    default:          return 'bg-text-muted/15 text-text-muted border-text-muted/30';
  }
}

function riskColorClass(score) {
  if (score > 75) return 'text-red-500';
  if (score > 40) return 'text-orange-500';
  return 'text-emerald-500';
}
function riskBgClass(score) {
  if (score > 75) return 'bg-red-500';
  if (score > 40) return 'bg-orange-500';
  return 'bg-emerald-500';
}

// ── Churn bar ─────────────────────────────────────────────────────────────────
function ChurnBar({ score }) {
  const colorClass = riskColorClass(score ?? 0);
  const bgClass = riskBgClass(score ?? 0);
  return (
    <div className="flex items-center gap-2 w-full max-w-[120px]">
      <div className="flex-1 h-1.5 bg-surface-secondary rounded overflow-hidden">
        <div className={`h-full rounded transition-all duration-300 ease-out ${bgClass}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <span className={`text-[12px] font-bold min-w-[28px] text-right ${colorClass}`}>{score ?? 0}</span>
    </div>
  );
}

const PAGE_SIZE = 10;

// ── Suspend modal ────────────────────────────────────────────────────────────
function SuspendModal({ tenant, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const onSubmit = async ({ status, reason }) => {
    setLoading(true);
    setError('');
    try {
      await updateTenantStatus(tenant._id, { status, reason });
      onSuccess(tenant._id, status);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl p-7 w-full max-w-[420px] shadow-xl">
        <div className="flex justify-between items-start mb-5">
          <div>
            <p className="m-0 mb-1 text-[18px] font-bold text-text-primary">Change Tenant Status</p>
            <p className="m-0 text-[13px] text-text-muted">Updating: <strong className="text-primary">{tenant.name}</strong></p>
          </div>
          <button className="bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer p-1" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-semibold text-text-muted mb-1.5 uppercase tracking-[0.05em]">New Status</label>
            <select className="w-full bg-surface-secondary/50 border border-border rounded-xl px-3.5 py-2.5 text-text-primary text-[13px] outline-none focus:border-primary transition-colors cursor-pointer" {...register('status', { required: 'Status is required' })}>
              <option value="suspended">Suspended</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {errors.status && <p className="m-0 mt-1 text-[12px] text-danger font-medium">{errors.status.message}</p>}
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-text-muted mb-1.5 uppercase tracking-[0.05em]">Reason</label>
            <textarea
              className="w-full bg-surface-secondary/50 border border-border rounded-xl px-3.5 py-2.5 text-text-primary text-[13px] outline-none focus:border-primary transition-colors resize-y min-h-[80px]"
              placeholder="Provide a reason for this status change…"
              {...register('reason', { required: 'Reason is required' })}
            />
            {errors.reason && <p className="m-0 mt-1 text-[12px] text-danger font-medium">{errors.reason.message}</p>}
          </div>
          
          {error && <p className="m-0 text-[13px] text-danger font-medium">{error}</p>}

          <div className="flex justify-end gap-3 mt-2">
            <button type="button" className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors" onClick={onClose}>Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg border-none bg-danger hover:bg-red-600 text-white cursor-pointer text-[13px] font-bold min-w-[120px] flex items-center justify-center transition-colors disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const navigate = useNavigate();
  const [tenants,    setTenants]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [statusFilter, setStatus]   = useState('all');
  const [riskFilter,   setRisk]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [suspendTenant, setSuspend] = useState(null);

  const fetchTenants = useCallback(() => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (statusFilter !== 'all') params.status  = statusFilter;
    if (riskFilter   !== 'all') params.riskLevel = riskFilter;
    if (search) params.search = search;

    getAdminTenants(params)
      .then((res) => {
        const d = res.data?.data ?? res.data;
        setTenants(Array.isArray(d) ? d : (d?.tenants ?? []));
        setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
        setError('');
      })
      .catch((err) => {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to load tenants.');
        setTenants([]);
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter, riskFilter, search]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusSuccess = (tenantId, newStatus) => {
    setTenants((prev) => prev.map((t) => t._id === tenantId ? { ...t, status: newStatus } : t));
  };

  return (
    <AdminLayout title="Tenants">
      <div className="font-sans text-text-primary">
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">Tenants</h1>
          <p className="m-0 mt-1.5 text-sm text-text-muted">Manage all platform tenants</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-[13px] font-medium">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-[320px] min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="w-full bg-surface border border-border rounded-xl pl-9 pr-3.5 py-2 text-[13px] text-text-primary outline-none focus:border-primary transition-colors"
              placeholder="Search tenants…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <div className="flex items-center gap-2 px-2 hidden sm:flex">
            <Filter size={14} className="text-text-muted" />
          </div>

          <select
            className="bg-surface border border-border rounded-xl px-3.5 py-2 text-[13px] text-text-primary outline-none focus:border-primary transition-colors cursor-pointer min-w-[140px]"
            value={statusFilter}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            className="bg-surface border border-border rounded-xl px-3.5 py-2 text-[13px] text-text-primary outline-none focus:border-primary transition-colors cursor-pointer min-w-[140px]"
            value={riskFilter}
            onChange={(e) => { setRisk(e.target.value); setPage(1); }}
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary/50 border-b border-border">
                  {['Tenant Name', 'Status', 'Plan', 'MRR', 'Seats', 'Churn Risk', 'Actions'].map((h) => (
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
                      <td colSpan={7} className="p-0">
                        <div className="h-14 bg-surface-secondary/40 animate-pulse my-0.5" />
                      </td>
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-text-muted text-[14px]">No tenants found</td></tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0 cursor-pointer" onClick={() => navigate(`/admin/tenants/${tenant._id}`)}>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-bold text-text-primary text-[13px]">{tenant.name}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{tenant.slug}</div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-[0.05em] ${statusBadge(tenant.status)}`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] font-medium text-primary whitespace-nowrap">
                        {tenant.planName ?? tenant.plan?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] font-bold text-emerald-500 whitespace-nowrap">
                        {formatINR(tenant.mrrContribution ?? tenant.mrr)}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] font-medium text-blue-500 whitespace-nowrap">
                        {tenant.usedSeats ?? '—'}/{tenant.totalSeats ?? tenant.seats ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 min-w-[140px] whitespace-nowrap">
                        <ChurnBar score={tenant.churnRiskScore ?? tenant.churnScore} />
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-transparent text-primary hover:bg-primary/5 cursor-pointer text-[12px] font-semibold transition-colors"
                            onClick={() => navigate(`/admin/tenants/${tenant._id}`)}
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-danger/20 bg-danger/5 text-danger hover:bg-danger/10 cursor-pointer text-[12px] font-semibold transition-colors"
                            onClick={() => setSuspend(tenant)}
                          >
                            <Ban size={13} /> Suspend
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-secondary/20">
              <span className="text-[13px] text-text-muted font-medium">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="w-8 h-8 rounded-lg border border-border bg-surface-secondary flex items-center justify-center text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-border transition-colors"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="w-8 h-8 rounded-lg border border-border bg-surface-secondary flex items-center justify-center text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-border transition-colors"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {suspendTenant && (
        <SuspendModal
          tenant={suspendTenant}
          onClose={() => setSuspend(null)}
          onSuccess={handleStatusSuccess}
        />
      )}
    </AdminLayout>
  );
}
