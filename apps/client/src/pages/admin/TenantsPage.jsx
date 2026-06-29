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
  AlertTriangle,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getAdminTenants, updateTenantStatus } from '../../services/adminService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(paise) {
  if (paise == null) return '₹0';
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

function statusColor(status) {
  switch (status) {
    case 'active':    return { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.25)'  };
    case 'trialing':  return { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' };
    case 'suspended': return { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', border: 'rgba(239,68,68,0.25)'  };
    case 'cancelled': return { bg: 'rgba(107,114,128,0.12)',color: '#9ca3af', border: 'rgba(107,114,128,0.25)' };
    default:          return { bg: 'rgba(107,114,128,0.1)', color: '#9ca3af', border: 'rgba(107,114,128,0.2)'  };
  }
}

function riskColor(score) {
  if (score > 75) return '#ef4444';
  if (score > 40) return '#f97316';
  return '#22c55e';
}

// ── Churn bar ─────────────────────────────────────────────────────────────────
function ChurnBar({ score }) {
  const color = riskColor(score ?? 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score ?? 0}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{score ?? 0}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { color: '#f0f0ff', fontFamily: 'system-ui, sans-serif' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: 700, color: '#f0f0ff', letterSpacing: '-0.02em' },
  pageSub: { margin: '4px 0 0', fontSize: 14, color: '#8b8bad' },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  filterSelect: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 9,
    color: '#f0f0ff',
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 140,
  },
  searchWrap: { position: 'relative', flex: 1, maxWidth: 320 },
  searchIcon: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8b8bad' },
  searchInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 9,
    color: '#f0f0ff',
    padding: '8px 12px 8px 34px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  tableWrap: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#8b8bad',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    background: 'rgba(255,255,255,0.02)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  td: {
    padding: '13px 16px',
    fontSize: 13,
    color: '#f0f0ff',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
  },
  statusBadge: (status) => {
    const c = statusColor(status);
    return {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      textTransform: 'capitalize',
    };
  },
  btnView: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: '#a78bfa', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  },
  btnSuspend: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)',
    background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 500,
    marginLeft: 6,
  },
  pagination: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', justifyContent: 'flex-end' },
  pageBtn: (disabled) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: disabled ? '#4b5563' : '#f0f0ff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
  }),
  pageInfo: { fontSize: 13, color: '#8b8bad' },
  emptyRow: { textAlign: 'center', padding: '40px 0', color: '#8b8bad', fontSize: 14 },
  skeletonRow: { height: 56, background: 'rgba(255,255,255,0.03)', animation: 'tf-pulse 1.5s ease-in-out infinite' },
  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw',
  },
  modalTitle: { margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#f0f0ff' },
  modalSub: { margin: '0 0 20px', fontSize: 13, color: '#8b8bad' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#8b8bad', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9,
    color: '#f0f0ff', padding: '9px 12px', fontSize: 13,
    outline: 'none', marginBottom: 14, boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9,
    color: '#f0f0ff', padding: '9px 12px', fontSize: 13,
    outline: 'none', resize: 'vertical', minHeight: 80,
    fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box',
  },
  modalBtns: { display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' },
  btnCancel: {
    padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: '#8b8bad', cursor: 'pointer', fontSize: 13,
  },
  btnConfirm: {
    padding: '9px 18px', borderRadius: 9, border: 'none',
    background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  errText: { fontSize: 12, color: '#f87171', marginTop: 4 },
};

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
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={S.modalTitle}>Change Tenant Status</p>
            <p style={S.modalSub}>Updating: <strong style={{ color: '#a78bfa' }}>{tenant.name}</strong></p>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#8b8bad', cursor: 'pointer' }} onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <label style={S.label}>New Status</label>
          <select style={S.select} {...register('status', { required: 'Status is required' })}>
            <option value="suspended">Suspended</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {errors.status && <p style={S.errText}>{errors.status.message}</p>}

          <label style={S.label}>Reason</label>
          <textarea
            style={S.textarea}
            placeholder="Provide a reason for this status change…"
            {...register('reason', { required: 'Reason is required' })}
          />
          {errors.reason && <p style={S.errText}>{errors.reason.message}</p>}
          {error && <p style={S.errText}>{error}</p>}

          <div style={S.modalBtns}>
            <button type="button" style={S.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" style={S.btnConfirm} disabled={loading}>
              {loading ? 'Updating…' : 'Confirm Change'}
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
      })
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [page, statusFilter, riskFilter, search]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusSuccess = (tenantId, newStatus) => {
    setTenants((prev) => prev.map((t) => t._id === tenantId ? { ...t, status: newStatus } : t));
  };

  // Inject keyframes
  useEffect(() => {
    const id = 'tf-tenants-kf';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = `@keyframes tf-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;
      document.head.appendChild(el);
    }
  }, []);

  return (
    <AdminLayout title="Tenants">
      <div style={S.page}>
        <div style={S.headerRow}>
          <div>
            <h1 style={S.pageTitle}>Tenants</h1>
            <p style={S.pageSub}>Manage all platform tenants</p>
          </div>
        </div>

        {/* Filters */}
        <div style={S.filtersRow}>
          <div style={S.searchWrap}>
            <Search size={14} style={S.searchIcon} />
            <input
              style={S.searchInput}
              placeholder="Search tenants…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} color="#8b8bad" />
          </div>

          <select
            style={S.filterSelect}
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
            style={S.filterSelect}
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
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Tenant Name', 'Status', 'Plan', 'MRR', 'Seats', 'Churn Risk', 'Actions'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <div style={{ ...S.skeletonRow, margin: '2px 0' }} />
                    </td>
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr><td colSpan={7} style={S.emptyRow}>No tenants found</td></tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant._id} style={{ cursor: 'pointer' }}>
                    <td style={S.td}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f0f0ff' }}>{tenant.name}</div>
                        <div style={{ fontSize: 11, color: '#8b8bad', marginTop: 2 }}>{tenant.slug}</div>
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={S.statusBadge(tenant.status)}>{tenant.status}</span>
                    </td>
                    <td style={{ ...S.td, color: '#a78bfa' }}>
                      {tenant.planName ?? tenant.plan?.name ?? '—'}
                    </td>
                    <td style={{ ...S.td, color: '#4ade80', fontWeight: 600 }}>
                      {formatINR(tenant.mrrContribution ?? tenant.mrr)}
                    </td>
                    <td style={S.td}>
                      <span style={{ color: '#60a5fa' }}>
                        {tenant.usedSeats ?? '—'}/{tenant.totalSeats ?? tenant.seats ?? '—'}
                      </span>
                    </td>
                    <td style={{ ...S.td, minWidth: 140 }}>
                      <ChurnBar score={tenant.churnRiskScore ?? tenant.churnScore} />
                    </td>
                    <td style={S.td}>
                      <button
                        style={S.btnView}
                        onClick={() => navigate(`/admin/tenants/${tenant._id}`)}
                      >
                        <Eye size={13} />
                        View
                      </button>
                      <button
                        style={S.btnSuspend}
                        onClick={() => setSuspend(tenant)}
                      >
                        <Ban size={13} />
                        Suspend
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && (
            <div style={S.pagination}>
              <span style={S.pageInfo}>
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                style={S.pageBtn(page <= 1)}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                style={S.pageBtn(page >= totalPages)}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
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
