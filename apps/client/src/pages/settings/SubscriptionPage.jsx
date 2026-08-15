import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { CreditCard, Zap, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
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
      showToast('✅ Plan changed successfully!');
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

  if (loading) return <DashboardLayout><div className="p-20 text-center"><Loader2 size={36} className="text-primary animate-spin mx-auto" /></div></DashboardLayout>;

  // sub.planId is the populated Plan object — compare its _id against plan cards
  const currentPlanId = sub?.planId?._id?.toString() || sub?.planId?.toString();

  return (
    <DashboardLayout title="Subscription">
      <div className="max-w-[1100px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <CreditCard size={18} className="text-primary" />
              </div>
              Subscription
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">Manage your plan, upgrade or downgrade anytime</p>
          </div>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}
        {toast && <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm font-medium">{toast}</div>}

        {/* No subscription yet */}
        {!sub && !error && !loading && (
          <div className="bg-surface border border-border rounded-2xl p-10 text-center mb-7 shadow-sm">
            <CreditCard size={40} className="text-primary/60 mb-3 mx-auto" />
            <h2 className="m-0 mb-2 text-lg font-bold text-text-primary">No Active Plan</h2>
            <p className="m-0 text-sm text-text-muted">
              You don't have a subscription yet. Choose a plan below to get started.
            </p>
          </div>
        )}

        {/* Current Plan */}
        {sub && (
          <div className="bg-surface border border-border rounded-2xl p-6 mb-7 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-5 border-b border-border">
              <div>
                <h2 className="m-0 text-lg font-bold text-text-primary">
                  {sub.planVersionId?.displayName || sub.planId?.displayName || 'Current Plan'}
                  {' '}<span className="text-[13px] text-text-muted font-normal">({sub.planVersionId?.interval || sub.planId?.interval || 'monthly'})</span>
                </h2>
                <p className="m-0 mt-1 text-[13px] text-text-muted">
                   Next billing: <strong className="text-text-primary">{formatDate(sub.currentPeriodEnd)}</strong>
                   {' · '}Amount: <strong className="text-text-primary">{formatCurrency(sub.planVersionId?.price || sub.planId?.price)}</strong>
                </p>
              </div>
              {/* Smart cancel / status area */}
              {sub.status === 'cancelled' ? (
                <div className="text-right">
                  <span className="block text-xs font-bold text-danger mb-2">
                    ✕ Subscription Cancelled
                  </span>
                  <button
                    className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                    onClick={confirmReactivate}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : '↺ Reactivate Plan'}
                  </button>
                </div>
              ) : sub.cancelAtPeriodEnd ? (
                <div className="text-right">
                  <p className="m-0 mb-2 text-xs font-bold text-warning">
                    ⚠ Cancels on {formatDate(sub.currentPeriodEnd)}
                  </p>
                  <p className="m-0 mb-2.5 text-[11px] text-text-muted">
                    Access continues until that date.
                  </p>
                  <button
                    className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                    onClick={confirmReactivate}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : '↺ Keep Plan'}
                  </button>
                </div>
              ) : sub.status === 'pending_downgrade' ? (
                <div className="text-right">
                  <p className="m-0 mb-1 text-xs font-bold text-primary">
                    ↓ Downgrade scheduled for {formatDate(sub.currentPeriodEnd)}
                  </p>
                  <p className="m-0 text-[11px] text-text-muted">
                    Current plan remains active until then.
                  </p>
                </div>
              ) : (
                <button className="px-4 py-2 rounded-lg border-none bg-danger hover:bg-red-600 text-white cursor-pointer text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5" onClick={() => setModal('cancel')}>
                  <X size={14} /> Cancel Subscription
                </button>
              )}
            </div>
            {/* Features */}
            {(sub.planVersionId?.features || sub.planId?.features) && (
              <div>
                <p className="m-0 mb-3 text-xs font-bold text-text-muted uppercase tracking-wider">Included Features</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sub.planVersionId?.features instanceof Map
                    ? Object.fromEntries(sub.planVersionId.features)
                    : (sub.planVersionId?.features || sub.planId?.features || {})
                  )
                  .filter(([, v]) => v !== false)
                  .map(([k, v]) => (
                    <span key={k} className="inline-flex items-center px-2 py-1 rounded bg-surface-secondary/50 border border-border text-[11px] font-semibold text-text-secondary whitespace-nowrap capitalize">
                      {v === true ? <Check size={12} className="mr-1 text-primary" /> : null}
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
            <h2 className="m-0 mb-5 mt-2 text-lg font-bold text-text-primary flex items-center gap-2">
              <Zap size={16} className="text-primary" />
              Available Plans
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 items-stretch">
              {plans.map((plan) => {
                const isCurrent = plan._id?.toString() === currentPlanId;
                const currentPrice = sub?.planVersionId?.price || sub?.planId?.price || 0;
                const isUpgrade = plan.price > currentPrice;
                const isGrowth  = plan.name === 'growth' || plan.displayName === 'Growth';
                const btnLabel  = !sub ? 'Subscribe →' : isCurrent ? null : isUpgrade ? 'Upgrade →' : 'Downgrade';
                return (
                  <div key={plan._id} className={`flex flex-col bg-surface border rounded-2xl p-6 transition-all ${isGrowth ? 'border-primary/50 shadow-[0_4px_24px_rgba(108,99,255,0.1)] -translate-y-1' : 'border-border shadow-sm'}`}>
                    <p className="m-0 mb-2 text-[13px] font-bold text-text-muted uppercase tracking-wider">
                      {plan.displayName || plan.plan?.name || plan.name}
                    </p>
                    <div className="m-0 mb-5 text-4xl font-extrabold text-text-primary flex items-baseline gap-1">
                      {formatCurrency(plan.price)}
                      <span className="text-[15px] font-medium text-text-muted">/{plan.interval === 'annual' ? 'yr' : 'mo'}</span>
                    </div>
                    <ul className="list-none p-0 m-0 mb-6 flex-1 space-y-3">
                      <li className="flex items-start gap-2.5 text-[13px] text-text-secondary"><Check size={16} className="text-primary shrink-0" /> Up to {plan.features?.max_seats || '∞'} seats</li>
                      {plan.features?.ai_assistant && <li className="flex items-start gap-2.5 text-[13px] text-text-secondary"><Check size={16} className="text-primary shrink-0" /> AI Billing Assistant</li>}
                      {plan.features?.advanced_analytics && <li className="flex items-start gap-2.5 text-[13px] text-text-secondary"><Check size={16} className="text-primary shrink-0" /> Advanced Analytics</li>}
                      {plan.features?.priority_support && <li className="flex items-start gap-2.5 text-[13px] text-text-secondary"><Check size={16} className="text-primary shrink-0" /> Priority Support</li>}
                      {plan.features?.api_access && <li className="flex items-start gap-2.5 text-[13px] text-text-secondary"><Check size={16} className="text-primary shrink-0" /> API Access</li>}
                    </ul>
                    {isCurrent ? (
                      <button className="w-full py-2.5 rounded-lg border border-border bg-surface-secondary text-text-muted font-bold text-sm cursor-default" disabled>✓ Current Plan</button>
                    ) : (
                      <button
                        className={`w-full py-2.5 rounded-lg border-none text-white font-bold text-sm cursor-pointer transition-colors flex items-center justify-center ${(!sub || isUpgrade) ? 'bg-primary hover:bg-primary-hover' : 'bg-surface-secondary text-text-muted hover:text-text-primary border border-border'}`}
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
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-[440px] p-6 text-text-primary" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-4 items-start mb-5">
                <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-danger" />
                </div>
                <div>
                  <h3 className="m-0 text-xl font-bold mb-2">Cancel Subscription?</h3>
                  <p className="m-0 text-sm text-text-muted leading-relaxed">
                    Your subscription will be cancelled at the end of the current billing period. You will retain full access until then.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setModal(null)} disabled={actionLoading}>Keep Subscription</button>
                <button className="px-4 py-2 rounded-lg border-none bg-danger hover:bg-red-600 text-white cursor-pointer text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 min-w-[120px] disabled:opacity-70 disabled:cursor-not-allowed" onClick={confirmCancel} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change Plan Modal */}
        {modal?.type === 'change' && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-[440px] p-6 text-text-primary" onClick={(e) => e.stopPropagation()}>
              <h3 className="m-0 text-xl font-bold mb-4">
                Change to {modal.plan?.plan?.name || modal.plan?.name}?
              </h3>
              {preview ? (
                <div className="bg-surface-secondary/40 border border-border rounded-xl p-4 mb-5 text-[13px]">
                  <p className="m-0 mb-3 font-semibold text-text-primary">Proration Preview:</p>
                  <div className="flex justify-between mb-2">
                    <span className="text-text-muted">Credit (remaining days):</span>
                    <span className="text-success font-medium">−{formatCurrency(preview.creditAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-text-muted">New plan charge:</span>
                    <span className="text-text-primary font-medium">{formatCurrency(preview.chargeAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-border pt-3 mt-3">
                    <span className="text-text-primary">Net due today:</span>
                    <span className="text-primary text-base">{formatCurrency(Math.max(0, preview.netAmount || 0))}</span>
                  </div>
                </div>
              ) : (
                <p className="m-0 text-[13px] text-text-muted mb-5">
                  Your plan will be changed immediately with prorated billing.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setModal(null)} disabled={actionLoading}>Cancel</button>
                <button className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 min-w-[140px] disabled:opacity-70 disabled:cursor-not-allowed" onClick={confirmChangePlan} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
