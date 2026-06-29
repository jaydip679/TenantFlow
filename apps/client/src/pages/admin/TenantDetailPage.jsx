import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, FileText, Clock, AlertTriangle } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getTenantDetail, forceStatusChange } from '../../services/adminService.js';
import { formatCurrency, formatDate, formatDateTime, churnRiskColor } from '../../utils/helpers.js';
import { useForm } from 'react-hook-form';

const STATUS_OPTIONS = ['active', 'trialing', 'suspended', 'cancelled'];

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
    <AdminLayout>
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div className="btn-spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
      </div>
    </AdminLayout>
  );

  const { tenant, subscription, members = [], recentInvoices = [], eventTimeline = [], churnScore } = data || {};

  return (
    <AdminLayout>
      <div style={{ maxWidth: 1100 }}>
        {/* Header */}
        <button className="btn-ghost btn-sm" onClick={() => navigate('/admin/tenants')} style={{ marginBottom: 20 }}>
          <ArrowLeft size={16} /> Back to Tenants
        </button>

        {error  && <div className="alert alert-danger">{error}</div>}
        {toast  && <div className="alert alert-success">{toast}</div>}

        {tenant && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">{tenant.name}</h1>
                <p className="page-subtitle">
                  Slug: <code style={{ fontSize: 12 }}>{tenant.slug}</code>
                  {' · '}Created: {formatDate(tenant.createdAt)}
                  {subscription && (
                    <>{' · '}Plan: <strong>{subscription.planVersion?.plan?.name || '—'}</strong></>
                  )}
                </p>
              </div>
              <span className={`badge ${
                tenant.status === 'active' ? 'badge-success' :
                tenant.status === 'trialing' ? 'badge-info' :
                tenant.status === 'suspended' ? 'badge-danger' : 'badge-neutral'
              }`} style={{ fontSize: 13, padding: '6px 14px' }}>
                {tenant.status}
              </span>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {['overview', 'members', 'timeline'].map((tab) => (
                <button key={tab} className={`tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="grid-2" style={{ gap: 20 }}>
                {/* Subscription Detail */}
                <div className="card">
                  <h3 className="section-title"><FileText size={15} style={{ display: 'inline', marginRight: 8 }} />Subscription</h3>
                  {subscription ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        ['Plan', subscription.planVersion?.plan?.name],
                        ['Interval', subscription.planVersion?.interval],
                        ['Status', subscription.status],
                        ['MRR', formatCurrency(subscription.planVersion?.interval === 'annual' ? Math.round(subscription.planVersion?.price / 12) : subscription.planVersion?.price)],
                        ['Period End', formatDate(subscription.currentPeriodEnd)],
                        ['Seats', `${subscription.seats?.used || 0} / ${subscription.seats?.total || 0}`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                          <span style={{ fontWeight: 500 }}>{v || '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: 'var(--color-text-muted)' }}>No active subscription</p>}
                </div>

                {/* Churn Score */}
                <div className="card">
                  <h3 className="section-title"><AlertTriangle size={15} style={{ display: 'inline', marginRight: 8 }} />Churn Risk</h3>
                  {churnScore ? (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: 16 }}>
                        <span className="churn-score" style={{ color: churnRiskColor(churnScore.churnRiskScore) }}>
                          {churnScore.churnRiskScore}
                        </span>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>/ 100 Risk Score</p>
                      </div>
                      {churnScore.keySignals?.length > 0 && (
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Key Signals</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {churnScore.keySignals.map((s, i) => <span key={i} className="signal-tag">{s}</span>)}
                          </div>
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 12 }}>
                        Last analyzed: {formatDate(churnScore.analyzedAt)}
                      </p>
                    </>
                  ) : <p style={{ color: 'var(--color-text-muted)' }}>No churn analysis available yet</p>}
                </div>

                {/* Recent Invoices */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h3 className="section-title">Recent Invoices</h3>
                  {recentInvoices.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No invoices yet</p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {recentInvoices.map((inv) => (
                          <tr key={inv._id}>
                            <td style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{inv.invoiceNumber}</td>
                            <td>{formatDate(inv.issuedAt || inv.createdAt)}</td>
                            <td style={{ fontWeight: 600 }}>{formatCurrency(inv.total)}</td>
                            <td>
                              <span className={`badge ${inv.status === 'paid' ? 'badge-success' : inv.status === 'open' ? 'badge-info' : 'badge-neutral'}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Force Status Change */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h3 className="section-title" style={{ color: 'var(--color-warning)' }}>
                    <AlertTriangle size={15} style={{ display: 'inline', marginRight: 8 }} />
                    Force Status Change (Admin Override)
                  </h3>
                  <form onSubmit={handleSubmit(onForceStatus)}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'flex-start' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">New Status</label>
                        <select className="form-select" {...register('status', { required: 'Required' })}>
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Reason (required)</label>
                        <input
                          className={`form-input ${errors.reason ? 'is-invalid' : ''}`}
                          placeholder="Reason for status change..."
                          {...register('reason', { required: 'Reason is required', minLength: { value: 3, message: 'Min 3 chars' } })}
                        />
                        {errors.reason && <span className="form-error">{errors.reason.message}</span>}
                      </div>
                      <div style={{ paddingTop: 22 }}>
                        <button type="submit" className="btn-warning" disabled={actionLoad}>
                          {actionLoad ? <span className="btn-spinner" /> : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr>
                  </thead>
                  <tbody>
                    {members.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 32 }}>No members</td></tr>
                    ) : members.map((m) => (
                      <tr key={m._id}>
                        <td style={{ fontWeight: 500 }}>{m.name}</td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{m.email}</td>
                        <td><span className={m.role === 'tenant_admin' ? 'badge badge-purple' : 'badge badge-neutral'}>{m.role}</span></td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="card">
                {eventTimeline.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)' }}>No subscription events recorded</p>
                ) : (
                  <div className="timeline">
                    {eventTimeline.map((ev) => (
                      <div key={ev._id} className="timeline-item">
                        <div className="timeline-dot">
                          <Clock size={14} color="var(--color-text-muted)" />
                        </div>
                        <div className="timeline-content">
                          <p className="timeline-event">{ev.event?.replace(/_/g, ' ')}</p>
                          <p className="timeline-date">{formatDateTime(ev.createdAt)}</p>
                          {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                            <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 2 }}>
                              {Object.entries(ev.metadata).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                            </p>
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
