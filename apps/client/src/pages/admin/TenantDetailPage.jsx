import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getTenantDetail, forceStatusChange } from '../../services/adminService.js';
import { formatCurrency, formatDate, formatDateTime, churnRiskColor } from '../../utils/helpers.js';
import { useForm } from 'react-hook-form';

const STATUS_OPTIONS = ['active', 'trialing', 'suspended', 'cancelled'];

function statusBadge(status) {
  switch (status) {
    case 'active':    return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 'trialing':  return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
    case 'suspended': return 'bg-red-500/15 text-red-500 border-red-500/30';
    case 'cancelled': return 'bg-text-muted/15 text-text-muted border-text-muted/30';
    default:          return 'bg-text-muted/15 text-text-muted border-text-muted/30';
  }
}

export default function TenantDetailPage() {
  const { tenantId } = useParams();
  const navigate     = useNavigate();

  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState('');
  const [activeTab,  setActiveTab] = useState('overview');
  const [toast,      setToast]     = useState('');
  const [actionLoad, setActionLoad] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  useEffect(() => {
    getTenantDetail(tenantId)
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load tenant details.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const onForceStatus = async (formData) => {
    setActionLoad(true);
    try {
      await forceStatusChange(tenantId, { status: formData.status, reason: formData.reason });
      showToast(`Status updated to "${formData.status}"`);
      const res = await getTenantDetail(tenantId);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Status change failed.');
    } finally {
      setActionLoad(false);
    }
  };

  if (loading) return (
    <AdminLayout title="Tenant Details">
      <div className="py-20 text-center">
        <Loader2 size={40} className="animate-spin text-primary mx-auto" />
      </div>
    </AdminLayout>
  );

  const { tenant, subscription, members = [], recentInvoices = [], eventTimeline = [], churnScore } = data || {};

  return (
    <AdminLayout title={tenant?.name || 'Tenant Details'}>
      <div className="max-w-[1100px] font-sans text-text-primary">
        {/* Header */}
        <button 
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors cursor-pointer text-[13px] font-semibold mb-6 w-fit" 
          onClick={() => navigate('/admin/tenants')}
        >
          <ArrowLeft size={16} /> Back to Tenants
        </button>

        {error  && <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-[13px] font-medium">{error}</div>}
        {toast  && <div className="mb-6 p-4 rounded-xl bg-success/10 border border-success/20 text-success text-[13px] font-medium">{toast}</div>}

        {tenant && (
          <>
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-7">
              <div>
                <h1 className="m-0 text-[26px] font-bold text-text-primary tracking-tight">{tenant.name}</h1>
                <p className="m-0 mt-2 text-[13px] text-text-muted flex items-center gap-2 flex-wrap">
                  <span>Slug: <code className="bg-surface border border-border px-1.5 py-0.5 rounded text-[12px] text-primary">{tenant.slug}</code></span>
                  <span>&middot;</span>
                  <span>Created: {formatDate(tenant.createdAt)}</span>
                  {subscription && (
                    <>
                      <span>&middot;</span>
                      <span>Plan: <strong className="font-semibold text-text-primary">{subscription.planVersion?.plan?.name || '—'}</strong></span>
                    </>
                  )}
                </p>
              </div>
              <span className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold border uppercase tracking-[0.06em] ${statusBadge(tenant.status)}`}>
                {tenant.status}
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-surface border border-border rounded-xl p-1.5 w-fit">
              {['overview', 'members', 'timeline'].map((tab) => (
                <button 
                  key={tab} 
                  className={`px-4 py-2 rounded-lg border-none cursor-pointer text-[13px] font-bold capitalize transition-all ${
                    activeTab === tab ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-text-muted hover:text-text-primary'
                  }`} 
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Subscription Detail */}
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="m-0 mb-5 text-[15px] font-bold text-text-primary flex items-center gap-2">
                    <FileText size={16} className="text-primary" /> Subscription
                  </h3>
                  {subscription ? (
                    <div className="flex flex-col gap-3">
                      {[
                        ['Plan', subscription.planVersion?.plan?.name],
                        ['Interval', <span className="capitalize">{subscription.planVersion?.interval}</span>],
                        ['Status', <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-[0.05em] border ${statusBadge(subscription.status)}`}>{subscription.status}</span>],
                        ['MRR', <span className="text-emerald-500 font-bold">{formatCurrency(subscription.planVersion?.interval === 'annual' ? Math.round(subscription.planVersion?.price / 12) : subscription.planVersion?.price)}</span>],
                        ['Period End', formatDate(subscription.currentPeriodEnd)],
                        ['Seats', `${subscription.seats?.used || 0} / ${subscription.seats?.total || 0}`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center text-[13px] pb-3 border-b border-border/50 last:border-0 last:pb-0">
                          <span className="text-text-muted font-medium">{k}</span>
                          <span className="font-semibold text-text-primary text-right">{v || '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="m-0 text-[13px] text-text-muted">No active subscription</p>}
                </div>

                {/* Churn Score */}
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="m-0 mb-5 text-[15px] font-bold text-text-primary flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-500" /> Churn Risk
                  </h3>
                  {churnScore ? (
                    <>
                      <div className="text-center mb-6">
                        <span className="text-[48px] font-extrabold tracking-tight leading-none" style={{ color: churnRiskColor(churnScore.churnRiskScore) }}>
                          {churnScore.churnRiskScore}
                        </span>
                        <p className="m-0 mt-1.5 text-text-muted text-[13px] font-medium uppercase tracking-[0.05em]">/ 100 Risk Score</p>
                      </div>
                      {churnScore.keySignals?.length > 0 && (
                        <div className="mb-4 bg-surface-secondary/50 rounded-xl p-4">
                          <p className="m-0 mb-3 text-[11px] font-bold text-text-muted uppercase tracking-[0.06em]">Key Signals</p>
                          <div className="flex flex-wrap gap-2">
                            {churnScore.keySignals.map((s, i) => (
                              <span key={i} className="px-2.5 py-1 rounded bg-surface border border-border text-[12px] text-text-primary font-medium">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="m-0 text-[11px] text-text-muted font-medium">
                        Last analyzed: {formatDate(churnScore.analyzedAt)}
                      </p>
                    </>
                  ) : <p className="m-0 text-[13px] text-text-muted">No churn analysis available yet</p>}
                </div>

                {/* Recent Invoices */}
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm md:col-span-2">
                  <h3 className="m-0 mb-5 text-[15px] font-bold text-text-primary">Recent Invoices</h3>
                  {recentInvoices.length === 0 ? (
                    <p className="m-0 text-[13px] text-text-muted">No invoices yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-border text-text-muted bg-surface-secondary/50">
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Invoice #</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Date</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Amount</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentInvoices.map((inv) => (
                            <tr key={inv._id} className="border-b border-border/50 last:border-0 hover:bg-surface-secondary/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-primary font-medium whitespace-nowrap">{inv.invoiceNumber}</td>
                              <td className="px-4 py-3 text-text-muted whitespace-nowrap">{formatDate(inv.issuedAt || inv.createdAt)}</td>
                              <td className="px-4 py-3 font-bold text-text-primary whitespace-nowrap">{formatCurrency(inv.total)}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-[0.05em] ${
                                  inv.status === 'paid' ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : 
                                  inv.status === 'open' ? 'bg-blue-500/15 text-blue-500 border-blue-500/30' : 
                                  'bg-text-muted/15 text-text-muted border-text-muted/30'
                                }`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Force Status Change */}
                <div className="bg-danger/5 border border-danger/20 rounded-2xl p-6 shadow-sm md:col-span-2">
                  <h3 className="m-0 mb-5 text-[15px] font-bold text-danger flex items-center gap-2">
                    <AlertTriangle size={16} /> Force Status Change (Admin Override)
                  </h3>
                  <form onSubmit={handleSubmit(onForceStatus)} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 min-w-[150px] w-full">
                      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-[0.05em] mb-1.5">New Status</label>
                      <select className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-[13px] text-text-primary outline-none focus:border-danger transition-colors cursor-pointer" {...register('status', { required: 'Required' })}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-[2] min-w-[200px] w-full">
                      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-[0.05em] mb-1.5">Reason (required)</label>
                      <input
                        className={`w-full bg-surface border rounded-xl px-3.5 py-2.5 text-[13px] text-text-primary outline-none transition-colors ${errors.reason ? 'border-danger focus:border-danger' : 'border-border focus:border-danger'}`}
                        placeholder="Reason for status change..."
                        {...register('reason', { required: 'Reason is required', minLength: { value: 3, message: 'Min 3 chars' } })}
                      />
                      {errors.reason && <span className="block mt-1 text-[11px] text-danger font-medium">{errors.reason.message}</span>}
                    </div>
                    <button type="submit" className="w-full sm:w-auto px-6 py-2.5 rounded-xl border-none bg-danger hover:bg-red-600 text-white font-bold text-[13px] cursor-pointer transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]" disabled={actionLoad}>
                      {actionLoad ? <Loader2 size={16} className="animate-spin" /> : 'Apply'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-surface-secondary/50 border-b border-border text-text-muted">
                        <th className="px-5 py-3.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Name</th>
                        <th className="px-5 py-3.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Email</th>
                        <th className="px-5 py-3.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Role</th>
                        <th className="px-5 py-3.5 font-semibold uppercase tracking-[0.05em] text-[11px]">Last Login</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-12 text-text-muted">No members</td></tr>
                      ) : members.map((m) => (
                        <tr key={m._id} className="border-b border-border/50 hover:bg-surface-secondary/30 transition-colors last:border-0">
                          <td className="px-5 py-3 font-semibold text-text-primary whitespace-nowrap">{m.name}</td>
                          <td className="px-5 py-3 text-text-muted whitespace-nowrap">{m.email}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.05em] border ${m.role === 'tenant_admin' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-surface-secondary text-text-muted border-border'}`}>
                              {m.role}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-text-muted text-[12px] whitespace-nowrap">{m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Never'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                {eventTimeline.length === 0 ? (
                  <p className="m-0 text-text-muted text-[14px]">No subscription events recorded</p>
                ) : (
                  <div className="relative border-l-2 border-surface-secondary ml-3 py-2 space-y-6">
                    {eventTimeline.map((ev) => (
                      <div key={ev._id} className="relative pl-6">
                        <div className="absolute left-[-9px] top-[2px] w-4 h-4 rounded-full bg-surface border-2 border-primary flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        </div>
                        <div>
                          <p className="m-0 text-[14px] font-bold text-text-primary capitalize">{ev.event?.replace(/_/g, ' ')}</p>
                          <div className="flex items-center gap-1.5 mt-1 text-[12px] font-medium text-text-muted">
                            <Clock size={12} /> {formatDateTime(ev.createdAt)}
                          </div>
                          {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                            <div className="mt-3 bg-surface-secondary/50 rounded-xl p-3 border border-border/50">
                              <p className="m-0 text-[12px] text-text-muted font-mono leading-relaxed">
                                {Object.entries(ev.metadata).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
