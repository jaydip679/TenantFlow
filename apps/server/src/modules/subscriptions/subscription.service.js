'use strict';

/**
 * Subscription Service
 *
 * Full subscription lifecycle management.
 *
 * Rules that apply to EVERY state-changing method:
 *   1. Call validateTransition(currentStatus, newStatus) BEFORE any write
 *   2. Create a SubscriptionEvent record
 *   3. Create an AuditLog record
 *   4. Invalidate tenant:ctx:{tenantId} Redis cache
 *   5. Upgrade + payment-creating ops MUST use MongoDB transactions
 *
 * Monetary values: Integer paise ONLY. No floats ever.
 *
 * REF: docs/SRS.md §5 — Subscriptions Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §6.1 T3.4
 */

const mongoose       = require('mongoose');
const { addDays, addMonths, addYears, differenceInDays } = require('date-fns');
const { addEventToOutbox } = require('../../shared/events/outbox.helper');

const Subscription       = require('../../models/Subscription.model');
const SubscriptionEvent  = require('../../models/SubscriptionEvent.model');
const identityFacade     = require('../../shared/facades/identity.facade');
const { AppError }       = require('../../shared/errors/AppError');
const { ERROR_CODES }    = require('../../shared/errors/errorCodes');
const { validateTransition } = require('./subscription.statemachine');
const { calculateProration } = require('../../shared/utils/proration');
const { createAuditLog }    = require('../../shared/utils/auditLogService');
const { paginationMeta, parsePagination } = require('../../shared/utils/pagination');
const redisClient            = require('../../config/redis');
const logger                 = require('../../shared/utils/logger');

// ── Cache Helper ───────────────────────────────────────────────
const invalidateTenantCache = async (tenantId) => {
  await redisClient.del(`tenant:ctx:${tenantId}`).catch((err) =>
    logger.warn({ err: err.message, tenantId }, 'Failed to invalidate tenant cache')
  );
};

// ── PlanVersion Helper (Moved to identity.facade.js) ─────────
// ── Period Helpers ─────────────────────────────────────────────
const getPeriodEnd = (start, interval) =>
  interval === 'annual' ? addYears(start, 1) : addMonths(start, 1);

// ── Service Methods ────────────────────────────────────────────

/**
 * Create a new subscription for a tenant.
 * Called during tenant registration (from authService.register).
 * Status defaults to 'trialing' if plan has trialDays > 0, else 'active'.
 *
 * @param {string} tenantId
 * @param {string} planId
 * @param {{ seatCount?: number, actorUser?: Object }} options
 * @returns {Promise<Subscription>}
 */
const createSubscription = async (tenantId, planId, options = {}) => {
  const { seatCount = 1, actorUser = null } = options;

  const plan = await identityFacade.getPlan(planId);
  if (!plan) throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
  if (!plan.isActive) throw new AppError('Plan is not active.', 422, ERROR_CODES.PLAN_ARCHIVED);

  const planVersion = await identityFacade.getLatestPlanVersion(plan._id, plan);

  const now     = new Date();
  const status  = plan.trialDays > 0 ? 'trialing' : 'active';
  const trialEnd = plan.trialDays > 0 ? addDays(now, plan.trialDays) : null;
  const periodStart = now;
  const periodEnd   = trialEnd || getPeriodEnd(now, plan.interval);

  const subscription = await Subscription.create({
    tenantId,
    planId:             plan._id,
    planVersionId:      planVersion._id,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd:   periodEnd,
    trialStart:         status === 'trialing' ? now : null,
    trialEnd,
    billingCycleAnchor: now,
    seatCount,
  });

  // Record creation event
  await SubscriptionEvent.create({
    tenantId,
    subscriptionId: subscription._id,
    event:          status === 'trialing' ? 'subscription.trial_started' : 'subscription.created',
    fromStatus:     null,
    toStatus:       status,
    toPlanId:       plan._id,
    triggeredBy: {
      userId: actorUser?.id || null,
      role:   actorUser?.role || 'system',
      source: actorUser ? 'user' : 'system',
    },
  });

  if (actorUser) {
    await createAuditLog({
      event:        'subscription.created',
      resourceType: 'subscription',
      resourceId:   subscription._id,
      tenantId,
      actor:        actorUser,
      after:        subscription.toObject(),
    });
  }

  // Update Tenant.currentPlanId + features so tenantScope middleware
  // can read the correct seatLimit from tenant.features.max_seats
  const featuresMap = new Map(Object.entries({
    max_seats:           plan.features.max_seats,
    api_calls_per_month: plan.features.api_calls_per_month,
    storage_gb:          plan.features.storage_gb,
    advanced_analytics:  plan.features.advanced_analytics,
    ai_assistant:        plan.features.ai_assistant,
    priority_support:    plan.features.priority_support,
  }));
  await identityFacade.updateTenantFeatures(tenantId, plan._id, featuresMap);

  await invalidateTenantCache(tenantId.toString());

  // Emit Socket.IO: admin:subscription:created (new revenue signal)
  try {
    const app = require('../../app');
    const io  = app.get('io');
    if (io) {
      const { emitToAdmins } = require('../../sockets/admin.namespace');
      emitToAdmins(io, 'admin:subscription:created', {
        tenantId,
        planId:   plan._id,
        planName: plan.displayName,
        status,
        createdAt: subscription.createdAt,
      });
    }
  } catch (socketErr) {
    require('../../shared/utils/logger').warn({ err: socketErr.message }, 'Socket.IO subscription:created emit failed (non-critical)');
  }

  return subscription;
};

/**
 * Get a tenant's current (non-cancelled) subscription with populated plan info.
 *
 * @param {string} tenantId
 * @returns {Promise<Subscription>}
 */
const getSubscription = async (tenantId) => {
  const subscription = await Subscription.findOne({
    tenantId,
    status: { $ne: 'cancelled' },
  }).lean();

  if (!subscription) {
    throw new AppError('No active subscription found for this tenant.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);
  }

  // Populate manually via Facade to avoid cross-domain Mongoose populates
  subscription.planId = await identityFacade.getPlan(subscription.planId);
  subscription.planVersionId = await identityFacade.getPlanVersion(subscription.planVersionId);

  if (!subscription) {
    throw new AppError('No active subscription found for this tenant.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);
  }

  return subscription;
};

/**
 * Upgrade a subscription to a higher-priced plan.
 *
 * ⚠️ Entire operation runs inside a MongoDB transaction.
 *
 * Business rules (SRS §5 upgrade):
 *   1. Status must be 'active' or 'trialing'
 *   2. Target plan must be active
 *   3. targetPlan.price > currentPlanVersion.price
 *   4. targetPlan.features.max_seats >= usedSeats
 *   5. Calculate proration
 *   6. Create PlanVersion snapshot for target
 *   7. Create proration Invoice (status=open)
 *   8. Update Subscription
 *   9. Update Tenant.currentPlanId + features
 *  10. Invalidate cache + create SubscriptionEvent + AuditLog
 *
 * @param {string} tenantId
 * @param {string} targetPlanId
 * @param {Object} actorUser
 * @param {Object} tenantContext - req.tenantContext (for usedSeats)
 * @returns {Promise<{ subscription, proratedInvoice }>}
 */
const upgradeSubscription = async (tenantId, targetPlanId, actorUser, tenantContext) => {
  // 1. Pre-fetch Identity reference data OUTSIDE the Billing transaction
  const targetPlan = await identityFacade.getPlan(targetPlanId);
  if (!targetPlan || !targetPlan.isActive) {
    throw new AppError('Target plan is not available.', 422, ERROR_CODES.PLAN_ARCHIVED);
  }
  
  // This replicates the old logic of creating a PlanVersion snapshot during upgrade.
  // We do it before the transaction because it affects the Identity domain.
  const newPlanVersion = await identityFacade.createPlanVersionSnapshot(targetPlan);

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // 1. Load current subscription
      const subscription = await Subscription.findOne({
        tenantId,
        status: { $ne: 'cancelled' },
      }).session(session);

      if (!subscription) {
        throw new AppError('No active subscription found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);
      }

      // Validate transition: must be active or trialing
      if (!['active', 'trialing'].includes(subscription.status)) {
        throw new AppError(
          'Subscription must be active or trialing to upgrade.',
          422,
          ERROR_CODES.SUBSCRIPTION_INVALID_TRANSITION,
          { fromStatus: subscription.status }
        );
      }

      // 3. Load current plan version for price comparison
      const currentPlanVersion = await identityFacade.getPlanVersion(subscription.planVersionId);
      if (!currentPlanVersion) {
        throw new AppError('Current plan version not found.', 500, ERROR_CODES.INTERNAL_ERROR);
      }

      // 4. Validate price is strictly higher (upgrade, not lateral move)
      if (targetPlan.price <= currentPlanVersion.price) {
        throw new AppError(
          'Target plan price must be higher than the current plan for an upgrade.',
          422,
          ERROR_CODES.UPGRADE_REQUIRED
        );
      }

      // 5. Seat conflict check — new plan must have enough seats for current members
      const usedSeats = tenantContext?.usedSeats
        ?? await identityFacade.getActiveUserCount(tenantId);

      if (targetPlan.features.max_seats < usedSeats) {
        throw new AppError(
          `New plan only allows ${targetPlan.features.max_seats} seats, but you have ${usedSeats} active members. Remove members first.`,
          422,
          ERROR_CODES.SEAT_CONFLICT,
          { maxSeats: targetPlan.features.max_seats, usedSeats }
        );
      }

      // 6. Calculate proration
      const proration = calculateProration({
        oldPlanPrice: currentPlanVersion.price,
        newPlanPrice: targetPlan.price,
        changeDate:   new Date(),
        periodStart:  subscription.currentPeriodStart,
        periodEnd:    subscription.currentPeriodEnd,
      });

      // 7. PlanVersion snapshot was created outside the transaction.

      // 8. Create proration Invoice (only if net amount > 0)
      let proratedInvoice = null;
      if (proration.netAmount > 0) {
        // Lazy import — Invoice model created in Phase 4
        // For Phase 3, we stub this and create a minimal invoice placeholder
        try {
          const Invoice = require('../../models/Invoice.model');
          const { generateInvoiceNumber } = require('../../shared/utils/invoiceNumber');
          const invoiceNumber = await generateInvoiceNumber();
          const taxRate   = parseInt(process.env.TAX_RATE || '18', 10);
          const subtotal  = proration.netAmount;
          const taxAmount = Math.round(subtotal * taxRate / 100);
          const total     = subtotal + taxAmount;

          const lineItems = [
            {
              description: `${currentPlanVersion.displayName} plan — unused days (${proration.daysRemaining} days)`,
              quantity:    1,
              unitPrice:   -proration.creditAmount,
              amount:      -proration.creditAmount,
              type:        'proration_credit',
            },
            {
              description: `${targetPlan.displayName} plan — remaining days (${proration.daysRemaining} days)`,
              quantity:    1,
              unitPrice:   proration.chargeAmount,
              amount:      proration.chargeAmount,
              type:        'proration_charge',
            },
          ];

          const [inv] = await Invoice.create([{
            tenantId,
            subscriptionId: subscription._id,
            invoiceNumber,
            status:         'open',
            periodStart:    subscription.currentPeriodStart,
            periodEnd:      subscription.currentPeriodEnd,
            dueDate:        new Date(),
            lineItems,
            subtotal,
            taxRate,
            taxAmount,
            total,
            amountPaid:  0,
            amountDue:   total,
            currency:    targetPlan.currency || 'INR',
          }], { session });

          proratedInvoice = {
            _id:           inv._id,
            invoiceNumber: inv.invoiceNumber,
            total:         inv.total,
            amountDue:     inv.amountDue,
            status:        inv.status,
          };
        } catch (invoiceErr) {
          // Phase 4 not yet available — log and continue without invoice
          logger.warn(
            { err: invoiceErr.message, tenantId },
            'Invoice model not available (Phase 4 required) — upgrade proceeding without invoice'
          );
        }
      }

      // 9. Update Subscription
      const fromPlanId = subscription.planId;
      subscription.planId        = targetPlan._id;
      subscription.planVersionId = newPlanVersion._id;
      // seatCount = actual active/invited users in this tenant (not the plan max capacity).
      // Recount here so the value is always accurate after an upgrade.
      subscription.seatCount = await identityFacade.getActiveUserCount(tenantId);
      await subscription.save({ session });

      // 11. Create SubscriptionEvent
      await SubscriptionEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        event:          'subscription.upgraded',
        fromStatus:     subscription.status,
        toStatus:       subscription.status, // status doesn't change on upgrade
        fromPlanId,
        toPlanId:       targetPlan._id,
        triggeredBy:    { userId: actorUser.id, role: actorUser.role, source: 'user' },
        metadata:       new Map([
          ['proration', proration],
          ['newPlanVersionId', newPlanVersion._id.toString()],
        ]),
      }], { session });

      await addEventToOutbox({
        eventType: 'subscription.upgraded',
        aggregateType: 'subscription',
        aggregateId: subscription._id.toString(),
        tenantId: tenantId.toString(),
        payload: {
          subscriptionId: subscription._id.toString(),
          oldPlanId: fromPlanId.toString(),
          newPlanId: targetPlan._id.toString(),
          proratedInvoiceId: proratedInvoice ? proratedInvoice._id.toString() : null,
          features: {
            max_seats: targetPlan.features.max_seats,
            api_calls_per_month: targetPlan.features.api_calls_per_month,
            storage_gb: targetPlan.features.storage_gb,
            advanced_analytics: targetPlan.features.advanced_analytics,
            ai_assistant: targetPlan.features.ai_assistant,
            priority_support: targetPlan.features.priority_support,
          }
        },
        session,
      });

      // 12. AuditLog
      await createAuditLog({
        event:        'subscription.upgraded',
        resourceType: 'subscription',
        resourceId:   subscription._id,
        tenantId,
        actor:        actorUser,
        before:       { planId: fromPlanId, planVersionId: currentPlanVersion._id },
        after:        { planId: targetPlan._id, planVersionId: newPlanVersion._id },
      });

      result = { subscription: subscription.toObject(), proratedInvoice };
    });
  } finally {
    session.endSession();
  }

  // 13. Invalidate cache (after transaction commits)
  await invalidateTenantCache(tenantId.toString());

  // Emit Socket.IO: admin:subscription:upgraded (revenue change)
  try {
    const app = require('../../app');
    const io  = app.get('io');
    if (io) {
      const { emitToAdmins } = require('../../sockets/admin.namespace');
      emitToAdmins(io, 'admin:subscription:upgraded', {
        tenantId,
        toPlanId:   targetPlan._id,
        toPlanName: targetPlan.displayName,
        toPrice:    targetPlan.price,
        upgradedAt: new Date(),
      });
    }
  } catch (socketErr) {
    require('../../shared/utils/logger').warn({ err: socketErr.message }, 'Socket.IO subscription:upgraded emit failed (non-critical)');
  }

  return result;
};

/**
 * Schedule a downgrade to a lower-priced plan.
 * No charge. Status → pending_downgrade. Applies at currentPeriodEnd via billingRenew cron.
 *
 * @param {string} tenantId
 * @param {string} targetPlanId
 * @param {string} reason
 * @param {Object} actorUser
 * @param {Object} tenantContext
 */
const downgradeSubscription = async (tenantId, targetPlanId, reason, actorUser, tenantContext) => {
  const subscription = await Subscription.findOne({
    tenantId,
    status: { $ne: 'cancelled' },
  });
  if (!subscription) throw new AppError('No active subscription found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);

  validateTransition(subscription.status, 'pending_downgrade');

  const targetPlan = await identityFacade.getPlan(targetPlanId);
  if (!targetPlan || !targetPlan.isActive) throw new AppError('Target plan not available.', 422, ERROR_CODES.PLAN_ARCHIVED);

  const currentPlanVersion = await identityFacade.getPlanVersion(subscription.planVersionId);
  if (!currentPlanVersion) throw new AppError('Current plan version not found.', 500, ERROR_CODES.INTERNAL_ERROR);

  // Must be lower price
  if (targetPlan.price >= currentPlanVersion.price) {
    throw new AppError('Target plan price must be lower than the current plan for a downgrade.', 422, ERROR_CODES.DOWNGRADE_REQUIRED);
  }

  // Seat conflict — new plan must accommodate current members
  const usedSeats = tenantContext?.usedSeats
    ?? await identityFacade.getActiveUserCount(tenantId);

  if (targetPlan.features.max_seats < usedSeats) {
    throw new AppError(
      `Downgrade not possible: new plan allows only ${targetPlan.features.max_seats} seats but you have ${usedSeats} active members.`,
      422,
      ERROR_CODES.SEAT_CONFLICT,
      { maxSeats: targetPlan.features.max_seats, usedSeats }
    );
  }

  const fromStatus = subscription.status;
  subscription.status        = 'pending_downgrade';
  subscription.pendingPlanId = targetPlan._id;
  subscription.cancelReason  = reason || null;
  await subscription.save();

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:          'subscription.downgrade_scheduled',
      fromStatus,
      toStatus:       'pending_downgrade',
      fromPlanId:     subscription.planId,
      toPlanId:       targetPlan._id,
      triggeredBy:    { userId: actorUser.id, role: actorUser.role, source: 'user' },
    }),
    createAuditLog({
      event: 'subscription.downgrade_scheduled', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: 'pending_downgrade', pendingPlanId: targetPlan._id },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  // Emit Socket.IO: admin:subscription:downgraded (plan change signal)
  try {
    const app = require('../../app');
    const io  = app.get('io');
    if (io) {
      const { emitToAdmins } = require('../../sockets/admin.namespace');
      emitToAdmins(io, 'admin:subscription:downgraded', {
        tenantId,
        toPlanName:  targetPlan.displayName,
        scheduledAt: new Date(),
      });
    }
  } catch (socketErr) {
    require('../../shared/utils/logger').warn({ err: socketErr.message }, 'Socket.IO subscription:downgraded emit failed (non-critical)');
  }

  return {
    subscription: subscription.toObject(),
    message: `Downgrade to ${targetPlan.displayName} scheduled for ${subscription.currentPeriodEnd.toISOString().split('T')[0]}. Access continues until then.`,
  };
};

/**
 * Cancel a pending downgrade.
 * Restores status to 'active', clears pendingPlanId.
 */
const cancelDowngrade = async (tenantId, actorUser) => {
  const subscription = await Subscription.findOne({ tenantId, status: 'pending_downgrade' });
  if (!subscription) throw new AppError('No pending downgrade found.', 404, ERROR_CODES.NO_PENDING_DOWNGRADE);

  const fromStatus = subscription.status;
  subscription.status        = 'active';
  subscription.pendingPlanId = null;
  subscription.cancelReason  = null;
  await subscription.save();

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:          'subscription.downgrade_cancelled',
      fromStatus,
      toStatus:       'active',
      triggeredBy:    { userId: actorUser.id, role: actorUser.role, source: 'user' },
    }),
    createAuditLog({
      event: 'subscription.downgrade_cancelled', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: 'active' },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  return subscription.toObject();
};

/**
 * Cancel a subscription.
 *
 * Two modes:
 *   cancelAtPeriodEnd=true  → mark for cancellation; access continues until currentPeriodEnd
 *   cancelAtPeriodEnd=false → immediate; Tenant.status → 'cancelled'
 *
 * @param {string} tenantId
 * @param {{ cancelAtPeriodEnd: boolean, reason?: string }} options
 * @param {Object} actorUser
 */
const cancelSubscription = async (tenantId, { cancelAtPeriodEnd = true, reason }, actorUser) => {
  const subscription = await Subscription.findOne({
    tenantId,
    status: { $ne: 'cancelled' },
  });
  if (!subscription) throw new AppError('No active subscription found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);
  if (subscription.status === 'cancelled') {
    throw new AppError('Subscription is already cancelled.', 409, ERROR_CODES.SUBSCRIPTION_ALREADY_CANCELLED);
  }

  validateTransition(subscription.status, 'cancelled');

  const fromStatus = subscription.status;
  const now = new Date();

  subscription.cancelReason = reason || null;
  subscription.cancelledAt  = cancelAtPeriodEnd ? null : now;
  subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;

  if (!cancelAtPeriodEnd) {
    subscription.status = 'cancelled';
    // Immediate cancellation → update tenant status
    await identityFacade.updateTenantStatus(tenantId, 'cancelled');
  }

  await subscription.save();

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:          'subscription.cancelled',
      fromStatus,
      toStatus:       subscription.status,
      triggeredBy:    { userId: actorUser.id, role: actorUser.role, source: 'user' },
      metadata:       new Map([['cancelAtPeriodEnd', cancelAtPeriodEnd], ['reason', reason || '']]),
    }),
    createAuditLog({
      event: 'subscription.cancelled', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: subscription.status, cancelAtPeriodEnd },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  return subscription.toObject();
};

/**
 * Reactivate a cancelled subscription.
 * Creates a new trial period (or active if plan has no trial).
 *
 * @param {string} tenantId
 * @param {Object} actorUser
 */
const reactivateSubscription = async (tenantId, actorUser) => {
  const subscription = await Subscription.findOne({ tenantId }).sort({ createdAt: -1 });
  if (!subscription) throw new AppError('No subscription found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);

  validateTransition(subscription.status, 'active');

  const plan = await identityFacade.getPlan(subscription.planId);
  if (!plan || !plan.isActive) throw new AppError('Plan is no longer available.', 422, ERROR_CODES.PLAN_ARCHIVED);

  const now         = new Date();
  const newStatus   = plan.trialDays > 0 ? 'trialing' : 'active';
  const trialEnd    = plan.trialDays > 0 ? addDays(now, plan.trialDays) : null;
  const periodEnd   = trialEnd || getPeriodEnd(now, plan.interval);
  const fromStatus  = subscription.status;

  subscription.status             = newStatus;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd   = periodEnd;
  subscription.trialStart         = newStatus === 'trialing' ? now : null;
  subscription.trialEnd           = trialEnd;
  subscription.cancelledAt        = null;
  subscription.cancelAtPeriodEnd  = false;
  subscription.cancelReason       = null;
  subscription.billingCycleAnchor = now;

  await subscription.save();

  // Restore tenant status
  await identityFacade.updateTenantStatus(tenantId, 'active');

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:          'subscription.reactivated',
      fromStatus,
      toStatus:       newStatus,
      triggeredBy:    { userId: actorUser.id, role: actorUser.role, source: 'user' },
    }),
    createAuditLog({
      event: 'subscription.reactivated', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: newStatus },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  return subscription.toObject();
};

/**
 * Pause a subscription.
 * @param {string} tenantId
 * @param {Date|null} pauseEndsAt - Optional date when pause ends automatically
 * @param {Object} actorUser
 */
const pauseSubscription = async (tenantId, pauseEndsAt, actorUser) => {
  const subscription = await Subscription.findOne({ tenantId, status: { $ne: 'cancelled' } });
  if (!subscription) throw new AppError('No active subscription found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);

  validateTransition(subscription.status, 'paused');

  const fromStatus = subscription.status;
  const now        = new Date();

  subscription.status      = 'paused';
  subscription.pausedAt    = now;
  subscription.pauseEndsAt = pauseEndsAt || null;
  await subscription.save();

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:       'subscription.paused',
      fromStatus,
      toStatus:    'paused',
      triggeredBy: { userId: actorUser.id, role: actorUser.role, source: 'user' },
    }),
    createAuditLog({
      event: 'subscription.paused', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: 'paused', pauseEndsAt },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  return subscription.toObject();
};

/**
 * Resume a paused subscription.
 * @param {string} tenantId
 * @param {Object} actorUser
 */
const resumeSubscription = async (tenantId, actorUser) => {
  const subscription = await Subscription.findOne({ tenantId, status: 'paused' });
  if (!subscription) throw new AppError('Subscription is not paused.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);

  validateTransition(subscription.status, 'active');

  const fromStatus = subscription.status;
  subscription.status      = 'active';
  subscription.pausedAt    = null;
  subscription.pauseEndsAt = null;
  await subscription.save();

  await Promise.all([
    SubscriptionEvent.create({
      tenantId,
      subscriptionId: subscription._id,
      event:       'subscription.resumed',
      fromStatus,
      toStatus:    'active',
      triggeredBy: { userId: actorUser.id, role: actorUser.role, source: 'user' },
    }),
    createAuditLog({
      event: 'subscription.resumed', resourceType: 'subscription',
      resourceId: subscription._id, tenantId, actor: actorUser,
      before: { status: fromStatus }, after: { status: 'active' },
    }),
    invalidateTenantCache(tenantId.toString()),
  ]);

  return subscription.toObject();
};

/**
 * Get paginated subscription event history.
 * @param {string} tenantId
 * @param {{ page?, limit? }} options
 */
const getSubscriptionEvents = async (tenantId, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const filter = { tenantId };
  const [events, total] = await Promise.all([
    SubscriptionEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubscriptionEvent.countDocuments(filter),
  ]);

  return { events, pagination: paginationMeta(total, page, limit) };
};

module.exports = {
  createSubscription,
  getSubscription,
  upgradeSubscription,
  downgradeSubscription,
  cancelDowngrade,
  cancelSubscription,
  reactivateSubscription,
  pauseSubscription,
  resumeSubscription,
  getSubscriptionEvents,
};
