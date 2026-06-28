import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { CreditCard, Zap, Check, X, AlertTriangle } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getSubscription, getPlans, cancelSubscription, changePlan } from '../../services/subscriptionService.js';
import api from '../../services/api.js';
import { formatCurrency, formatDate } from '../../utils/helpers.js';

export default function SubscriptionPage() {
  const user     = useSelector((s) => s.auth.user);
  const tenantId = user?.tenantId;

  const [sub,     setSub]     = useState(null);
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState(null); // 'cancel' | { type:'change', plan }
  const [preview, setPreview] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,   setToast]   = useState('');

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([getSubscription(tenantId), getPlans()])
      .then(([subRes, planRes]) => {
        setSub(subRes.data.data);
        setPlans(planRes.data.data?.planVersions || planRes.data.data?.plans || []);
      })
      .catch(() => setError('Failed to load subscription data.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const openChangePlan = async (plan) => {
    setModal({ type: 'change', plan });
    try {
      const res = await api.post(`/subscriptions/${tenantId}/preview-change`, { planVersionId: plan._id });
      setPreview(res.data.data);
    } catch {
      setPreview(null);
    }
  };

  const confirmChangePlan = async () => {
    if (!modal?.plan) return;
    setActionLoading(true);
    try {
      await changePlan(tenantId, { planVersionId: modal.plan._id });
      showToast('Plan changed successfully!');
      setModal(null);
      const res = await getSubscription(tenantId);
      setSub(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Plan change failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancel = async () => {
    setActionLoading(true);
    try {
      await cancelSubscription(tenantId);
      showToast('Subscription cancelled. You retain access until the billing period ends.');
      setModal(null);
      const res = await getSubscription(tenantId);
      setSub(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Cancellation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <DashboardLayout><div style={{ padding: 80, textAlign: 'center' }}><div className="btn-spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} /></div></DashboardLayout>;

  const currentPlanId = sub?.planVersion?._id;

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <CreditCard size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Subscription
            </h1>
            <p className="page-subtitle">Manage your plan, upgrade or downgrade anytime</p>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {toast && <div className="alert alert-success">{toast}</div>}

        {/* Current Plan */}
        {sub && (
          <div className="card" style={{ marginBottom: 28 }}>
            <div className="card-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                  {sub.planVersion?.plan?.name || 'Current Plan'}
                  {' '}<span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 400 }}>({sub.planVersion?.interval || 'monthly'})</span>
                </h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
                  Next billing: <strong>{formatDate(sub.currentPeriodEnd)}</strong>
                  {' · '}Amount: <strong>{formatCurrency(sub.planVersion?.price)}</strong>
                </p>
              </div>
              {sub.status !== 'cancelled' && (
                <button className="btn-danger btn-sm" onClick={() => setModal('cancel')}>
                  <X size={14} /> Cancel Subscription
                </button>
              )}
            </div>
            {/* Features */}
            {sub.planVersion?.features && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Included Features</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(sub.planVersion.features).map(([k, v]) => (
                    <span key={k} className="signal-tag">
                      {v === true ? <Check size={10} style={{ marginRight: 4 }} /> : null}
                      {k.replace(/_/g, ' ')}
                      {typeof v === 'number' ? `: ${v}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Plan Cards */}
        {plans.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 8 }}>
              <Zap size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              Available Plans
            </h2>
            <div className="plan-cards">
              {plans.map((plan) => {
                const isCurrent = plan._id === currentPlanId;
                const isUpgrade = plan.price > (sub?.planVersion?.price || 0);
                return (
                  <div key={plan._id} className={`plan-card${isCurrent ? ' current' : ''}${plan.plan?.name === 'Growth' ? ' featured' : ''}`}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      {plan.plan?.name || plan.name}
                    </p>
                    <div className="plan-price">
                      {formatCurrency(plan.price)}
                      <span>/{plan.interval === 'annual' ? 'yr' : 'mo'}</span>
                    </div>
                    <ul className="plan-features">
                      <li>Up to {plan.features?.seat_limit || '∞'} seats</li>
                      {plan.features?.ai_assistant && <li>AI Billing Assistant</li>}
                      {plan.features?.advanced_analytics && <li>Advanced Analytics</li>}
                      {plan.features?.priority_support && <li>Priority Support</li>}
                      {plan.features?.api_access && <li>API Access</li>}
                    </ul>
                    {isCurrent ? (
                      <button className="btn-secondary btn-full" disabled>✓ Current Plan</button>
                    ) : (
                      <button
                        className={isUpgrade ? 'btn-primary btn-full' : 'btn-secondary btn-full'}
                        onClick={() => openChangePlan(plan)}
                      >
                        {isUpgrade ? 'Upgrade →' : 'Downgrade'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Cancel Modal */}
        {modal === 'cancel' && (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
                <AlertTriangle size={28} color="var(--color-danger)" />
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Cancel Subscription?</h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 8 }}>
                    Your subscription will be cancelled at the end of the current billing period. You will retain full access until then.
                  </p>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModal(null)} disabled={actionLoading}>Keep Subscription</button>
                <button className="btn-danger" onClick={confirmCancel} disabled={actionLoading}>
                  {actionLoading ? <span className="btn-spinner" /> : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change Plan Modal */}
        {modal?.type === 'change' && (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">
                Change to {modal.plan?.plan?.name || modal.plan?.name}?
              </h3>
              {preview ? (
                <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16, fontSize: 14 }}>
                  <p style={{ marginBottom: 8, fontWeight: 500 }}>Proration Preview:</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Credit (remaining days):</span>
                    <span style={{ color: 'var(--color-success)' }}>−{formatCurrency(preview.creditAmount || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>New plan charge:</span>
                    <span>{formatCurrency(preview.chargeAmount || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Net due today:</span>
                    <span style={{ color: 'var(--color-primary)' }}>{formatCurrency(Math.max(0, preview.netAmount || 0))}</span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
                  Your plan will be changed immediately with prorated billing.
                </p>
              )}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModal(null)} disabled={actionLoading}>Cancel</button>
                <button className="btn-primary" onClick={confirmChangePlan} disabled={actionLoading}>
                  {actionLoading ? <span className="btn-spinner" /> : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
