import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { CreditCard, Zap, Check, X, AlertTriangle } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getSubscription, getPlans, cancelSubscription, reactivateSubscription, subscribePlan, upgradePlan, downgradePlan } from '../../services/subscriptionService.js';
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
    Promise.all([
      getSubscription(tenantId).catch((err) => {
        // 404 = no subscription yet — treat as empty, not an error
        if (err.response?.status === 404) return null;
        throw err;
      }),
      getPlans(),
    ])
      .then(([subRes, planRes]) => {
        // API returns { data: { subscription: {...} } } — unwrap the inner object
        const rawSub = subRes?.data?.data;
        setSub(rawSub?.subscription ?? rawSub ?? null);
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
      const res = await api.post(`/subscriptions/${tenantId}/preview-change`, { targetPlanId: plan._id });
      setPreview(res.data.data);
    } catch {
      setPreview(null);
    }
  };

  const confirmChangePlan = async () => {
    if (!modal?.plan) return;
    setActionLoading(true);
    try {
      if (!sub) {
        // First-time: no subscription exists yet
        await subscribePlan(tenantId, { planId: modal.plan._id });
      } else {
        // Compare against the price locked in the current plan version snapshot
        const currentPrice = sub?.planVersionId?.price || sub?.planId?.price || 0;
        const isUpgrade = modal.plan.price > currentPrice;
        if (isUpgrade) {
          await upgradePlan(tenantId, { targetPlanId: modal.plan._id });
        } else {
          await downgradePlan(tenantId, { targetPlanId: modal.plan._id });
        }
      }
      showToast('Plan changed successfully!');
      setModal(null);
      const res = await getSubscription(tenantId);
      const rawSub = res.data.data;
      setSub(rawSub?.subscription ?? rawSub ?? null);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Plan change failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancel = async () => {
    setActionLoading(true);
    try {
      // Backend requires { cancelAtPeriodEnd: true } — access ends at period end, not immediately
      await cancelSubscription(tenantId, { cancelAtPeriodEnd: true });
      showToast('Subscription cancelled. You retain access until the billing period ends.');
      setModal(null);
      const res = await getSubscription(tenantId);
      const rawSub = res.data.data;
      setSub(rawSub?.subscription ?? rawSub ?? null);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Cancellation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReactivate = async () => {
    setActionLoading(true);
    setError('');
    try {
      await reactivateSubscription(tenantId);
      showToast('✅ Plan reactivated! Your subscription is now active.');
      const res = await getSubscription(tenantId);
      const rawSub = res.data.data;
      setSub(rawSub?.subscription ?? rawSub ?? null);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Reactivation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <DashboardLayout><div style={{ padding: 80, textAlign: 'center' }}><div className="btn-spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} /></div></DashboardLayout>;

  // sub.planId is the populated Plan object — compare its _id against plan cards
  const currentPlanId = sub?.planId?._id?.toString() || sub?.planId?.toString();

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

        {/* No subscription yet */}
        {!sub && !error && !loading && (
          <div className="card" style={{ marginBottom: 28, textAlign: 'center', padding: '40px 28px' }}>
            <CreditCard size={40} style={{ color: 'var(--color-primary)', marginBottom: 12, opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>No Active Plan</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, margin: 0 }}>
              You don't have a subscription yet. Choose a plan below to get started.
            </p>
          </div>
        )}

        {/* Current Plan */}
        {sub && (
          <div className="card" style={{ marginBottom: 28 }}>
            <div className="card-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                  {sub.planVersionId?.displayName || sub.planId?.displayName || 'Current Plan'}
                  {' '}<span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 400 }}>({sub.planVersionId?.interval || sub.planId?.interval || 'monthly'})</span>
                </h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
                   Next billing: <strong>{formatDate(sub.currentPeriodEnd)}</strong>
                   {' · '}Amount: <strong>{formatCurrency(sub.planVersionId?.price || sub.planId?.price)}</strong>
                </p>
              </div>
              {/* Smart cancel / status area */}
              {sub.status === 'cancelled' ? (
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>
                    ✕ Subscription Cancelled
                  </span>
                  <button
                    className="btn-primary btn-sm"
                    onClick={confirmReactivate}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <span className="btn-spinner" /> : '↺ Reactivate Plan'}
                  </button>
                </div>
              ) : sub.cancelAtPeriodEnd ? (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12, color: '#fbbf24', margin: '0 0 8px', fontWeight: 600 }}>
                    ⚠ Cancels on {formatDate(sub.currentPeriodEnd)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
                    Access continues until that date.
                  </p>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={confirmReactivate}
                    disabled={actionLoading}
                    style={{ fontSize: 12 }}
                  >
                    {actionLoading ? <span className="btn-spinner" /> : '↺ Keep Plan'}
                  </button>
                </div>
              ) : sub.status === 'pending_downgrade' ? (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12, color: '#a78bfa', margin: '0 0 4px', fontWeight: 600 }}>
                    ↓ Downgrade scheduled for {formatDate(sub.currentPeriodEnd)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                    Current plan remains active until then.
                  </p>
                </div>
              ) : (
                <button className="btn-danger btn-sm" onClick={() => setModal('cancel')}>
                  <X size={14} /> Cancel Subscription
                </button>
              )}
            </div>
            {/* Features */}
            {(sub.planVersionId?.features || sub.planId?.features) && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Included Features</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(sub.planVersionId?.features instanceof Map
                    ? Object.fromEntries(sub.planVersionId.features)
                    : (sub.planVersionId?.features || sub.planId?.features || {})
                  )
                  .filter(([, v]) => v !== false)
                  .map(([k, v]) => (
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
                const isCurrent = plan._id?.toString() === currentPlanId;
                const currentPrice = sub?.planVersionId?.price || sub?.planId?.price || 0;
                const isUpgrade = plan.price > currentPrice;
                const isGrowth  = plan.name === 'growth' || plan.displayName === 'Growth';
                const btnLabel  = !sub ? 'Subscribe →' : isCurrent ? null : isUpgrade ? 'Upgrade →' : 'Downgrade';
                return (
                  <div key={plan._id} className={`plan-card${isCurrent ? ' current' : ''}${isGrowth ? ' featured' : ''}`}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      {plan.displayName || plan.plan?.name || plan.name}
                    </p>
                    <div className="plan-price">
                      {formatCurrency(plan.price)}
                      <span>/{plan.interval === 'annual' ? 'yr' : 'mo'}</span>
                    </div>
                    <ul className="plan-features">
                      <li>Up to {plan.features?.max_seats || '∞'} seats</li>
                      {plan.features?.ai_assistant && <li>AI Billing Assistant</li>}
                      {plan.features?.advanced_analytics && <li>Advanced Analytics</li>}
                      {plan.features?.priority_support && <li>Priority Support</li>}
                      {plan.features?.api_access && <li>API Access</li>}
                    </ul>
                    {isCurrent ? (
                      <button className="btn-secondary btn-full" disabled>✓ Current Plan</button>
                    ) : (
                      <button
                        className={(!sub || isUpgrade) ? 'btn-primary btn-full' : 'btn-secondary btn-full'}
                        onClick={() => openChangePlan(plan)}
                      >
                        {btnLabel}
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
