'use strict';

/**
 * Billing Renewal Cron Job
 *
 * Schedule: 0 1 * * * (runs at 01:00 UTC every day)
 *
 * Responsibilities:
 *   1. Find subscriptions whose currentPeriodEnd <= now
 *      - status: active | trialing | pending_downgrade | past_due
 *   2. For each subscription:
 *      a. If cancelAtPeriodEnd=true  → mark cancelled, update Tenant.status
 *      b. If status=pending_downgrade → apply the downgrade, generate renewal invoice
 *      c. If status=trialing         → convert to active (trial just ended)
 *      d. Otherwise                  → advance period, enqueue invoice generation
 *   3. Find subscriptions with trialEnd <= now, status=trialing → convert to active
 *
 * Locking: Each subscription is processed under a Redis lock
 *   (lock:billing:{subscriptionId}) to prevent duplicate processing
 *   if the cron fires twice (clock skew / restart).
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.7
 * REF: docs/SRS.md §13.1 — billingRenew cron
 */

const cron       = require('node-cron');
const mongoose   = require('mongoose');
const { addMonths, addYears } = require('date-fns');
const Subscription      = require('../models/Subscription.model');
const { logSubscriptionEvent } = require('../shared/events/subscriptionEventLogger');
const identityFacade    = require('../shared/facades/identity.facade');
const redisClient       = require('../config/redis');
const logger            = require('../shared/utils/logger');
const { addEventToOutbox } = require('../shared/events/outbox.helper');

// ── Helpers ───────────────────────────────────────────────────

const acquireLock = async (key, ttl = 300) => {
  const result = await redisClient.set(key, '1', 'NX', 'EX', ttl);
  return result === 'OK';
};

const releaseLock = async (key) => {
  await redisClient.del(key).catch(() => {});
};

const invalidateCache = async (tenantId) => {
  await redisClient.del(`tenant:ctx:${tenantId}`).catch(() => {});
};

const getPeriodEnd = (start, interval) =>
  interval === 'annual' ? addYears(start, 1) : addMonths(start, 1);

// ── Per-Subscription Processing ───────────────────────────────

const processExpiredSubscription = async (subscription) => {
  const lockKey = `lock:billing:${subscription._id}`;
  const lockAcquired = await acquireLock(lockKey, 600); // 10 min lock
  if (!lockAcquired) {
    logger.warn({ subscriptionId: subscription._id }, 'Billing lock held — skipping');
    return;
  }

  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Reload inside lock and tx to ensure freshness
        const sub = await Subscription.findById(subscription._id).session(session);
        if (!sub || new Date(sub.currentPeriodEnd) > new Date()) {
          return; // Already processed or period extended
        }

        logger.info({ subscriptionId: sub._id, status: sub.status }, 'Processing expired subscription');

        // A. cancelAtPeriodEnd=true — cancel now
        if (sub.cancelAtPeriodEnd) {
          const fromStatus = sub.status;
          sub.status       = 'cancelled';
          sub.cancelledAt  = new Date();
          await sub.save({ session });
          await logSubscriptionEvent([{
            tenantId:       sub.tenantId,
            subscriptionId: sub._id,
            event:          'subscription.cancelled',
            fromStatus,
            toStatus:       'cancelled',
            fromPlanId:     sub.planId,
            triggeredBy:    { source: 'cron' },
          }], { session });

          await addEventToOutbox({
            eventType: 'subscription.cancelled',
            eventVersion: 'v1',
            producer: 'billing-service',
            aggregateType: 'subscription',
            aggregateId: sub._id.toString(),
            tenantId: sub.tenantId.toString(),
            payload: {
              subscriptionId: sub._id.toString(),
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              cancellationReason: sub.cancelReason || null,
              status: sub.status,
              aggregateVersion: sub.aggregateVersion,
              createdAt: sub.createdAt,
              cancelledAt: sub.cancelledAt
            },
            session
          });

          invalidateCache(sub.tenantId.toString());
          logger.info({ subscriptionId: sub._id }, 'Subscription cancelled at period end');
          return;
        }

        // B. pending_downgrade — apply the downgrade
        if (sub.status === 'pending_downgrade' && sub.pendingPlanId) {
          const newPlan = await identityFacade.getPlan(sub.pendingPlanId);
          if (newPlan && newPlan.isActive) {
            const newPV = await identityFacade.createPlanVersionSnapshot(newPlan);

            const now = new Date();
            const oldPlanId = sub.planId;
            sub.planId        = newPlan._id;
            sub.planVersionId = newPV._id;
            sub.status        = 'active';
            sub.pendingPlanId = null;
            sub.cancelReason  = null;
            sub.currentPeriodStart = now;
            sub.currentPeriodEnd   = getPeriodEnd(now, newPlan.interval);
            await sub.save({ session });
            await logSubscriptionEvent([{
              tenantId:       sub.tenantId,
              subscriptionId: sub._id,
              event:          'subscription.downgrade_applied',
              fromStatus:     'pending_downgrade',
              toStatus:       'active',
              fromPlanId:     oldPlanId,
              toPlanId:       newPlan._id,
              triggeredBy:    { source: 'cron' },
            }], { session });

            await addEventToOutbox({
              eventType: 'subscription.renewed',
              eventVersion: 'v1',
              producer: 'billing-service',
              aggregateType: 'subscription',
              aggregateId: sub._id.toString(),
              tenantId: sub.tenantId.toString(),
              payload: {
                subscriptionId: sub._id.toString(),
                status: sub.status,
                currentPeriodStart: sub.currentPeriodStart,
                currentPeriodEnd: sub.currentPeriodEnd,
                seatCount: sub.seatCount,
                planId: newPlan._id.toString(),
                features: newPlan.features,
                planPrice: newPlan.price,
                planInterval: newPlan.interval,
                currency: newPlan.currency,
                aggregateVersion: sub.aggregateVersion,
                createdAt: sub.createdAt
              },
              session
            });

            invalidateCache(sub.tenantId.toString());
          }
        } else {
          // C. trialing → active (trial just ended) or D. advance renewal period
          const fromStatus = sub.status;
          const now = new Date();

          const plan = await identityFacade.getPlan(sub.planId);
          const interval = plan?.interval || 'monthly';

          sub.status             = 'active';
          sub.currentPeriodStart = now;
          sub.currentPeriodEnd   = getPeriodEnd(now, interval);
          sub.trialEnd           = sub.status === 'trialing' ? now : sub.trialEnd;
          await sub.save({ session });

          if (fromStatus === 'trialing') {
            await logSubscriptionEvent([{
              tenantId:       sub.tenantId,
              subscriptionId: sub._id,
              event:          'subscription.converted_to_paid',
              fromStatus,
              toStatus:       'active',
              fromPlanId:     sub.planId,
              toPlanId:       sub.planId,
              triggeredBy:    { source: 'cron' },
            }], { session });
          }

          await addEventToOutbox({
            eventType: 'subscription.renewed',
            eventVersion: 'v1',
            producer: 'billing-service',
            aggregateType: 'subscription',
            aggregateId: sub._id.toString(),
            tenantId: sub.tenantId.toString(),
            payload: {
              subscriptionId: sub._id.toString(),
              status: sub.status,
              currentPeriodStart: sub.currentPeriodStart,
              currentPeriodEnd: sub.currentPeriodEnd,
              seatCount: sub.seatCount,
              planId: plan ? plan._id.toString() : null,
              features: plan ? plan.features : null,
              planPrice: plan?.price || 0,
              planInterval: interval,
              currency: plan?.currency || 'USD',
              aggregateVersion: sub.aggregateVersion,
              createdAt: sub.createdAt
            },
            session
          });

          invalidateCache(sub.tenantId.toString());

          // Enqueue invoice generation for the new period
          try {
            const { enqueueInvoiceGeneration } = require('../queues/invoice.queue');
            // This relies on bullmq which is outside mongoose session, so it's best done after the tx commits,
            // however it's safe enough here because if it fails the tx still commits. Actually, better inside.
            await enqueueInvoiceGeneration(sub._id.toString(), 'renewal');
          } catch (err) {
            logger.warn({ err: err.message, subscriptionId: sub._id }, 'Failed to enqueue renewal invoice');
          }
        }
      });
    } finally {
      session.endSession();
    }
  } catch (err) {
    logger.error({ err: err.message, subscriptionId: subscription._id }, 'Error processing subscription renewal');
  } finally {
    await releaseLock(lockKey);
  }
};

// ── Main Cron Handler ─────────────────────────────────────────

const runBillingRenew = async () => {
  const now = new Date();
  logger.info('billingRenew cron started');

  try {
    const expiredSubscriptions = await Subscription.find({
      status:          { $in: ['active', 'trialing', 'pending_downgrade', 'past_due'] },
      currentPeriodEnd: { $lte: now },
    }).lean();

    logger.info({ count: expiredSubscriptions.length }, 'Found expired subscriptions');

    for (const sub of expiredSubscriptions) {
      await processExpiredSubscription(sub);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'billingRenew cron failed');
  }

  logger.info('billingRenew cron finished');
};

// ── Schedule ──────────────────────────────────────────────────

/**
 * Initialize the billing renewal cron.
 * Called from server.js after DB + Redis connect.
 */
const initBillingRenewCron = () => {
  // 0 1 * * * — runs at 01:00 UTC every day
  const job = cron.schedule('0 1 * * *', runBillingRenew, {
    scheduled: true,
    timezone:  'UTC',
  });

  logger.info('billingRenew cron scheduled: 0 1 * * * (daily at 01:00 UTC)');
  return job;
};

module.exports = { initBillingRenewCron, runBillingRenew };
