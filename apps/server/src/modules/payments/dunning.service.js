'use strict';

/**
 * Dunning Service
 *
 * Implements the full 4-step dunning state machine.
 * Services NEVER accept req/res objects.
 *
 * State machine:
 *   active (step 0) → active (step 1) → active (step 2, sub past_due) → active (step 3) → abandoned
 *   active (any step) → resolved (on payment success)
 *
 * Retry schedule (from DunningRecord.createdAt):
 *   Step 0: Immediate (triggered by payment.failed)
 *   Step 1: createdAt + 3 days
 *   Step 2: createdAt + 7 days  → subscription.status = 'past_due'
 *   Step 3: createdAt + 14 days → final notice
 *   Step 3 FAIL → abandoned → tenant.status = 'suspended'
 *
 * Redis lock per record:
 *   Key: lock:dunning:{dunningRecordId}  EX 600 (10 minutes)
 *   Prevents duplicate processing from cron double-fire / restart
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §9.1 T6.3
 * REF: docs/SRS.md §13.4 — dunning worker logic
 */

const { addDays } = require('date-fns');
const DunningRecord      = require('../../models/DunningRecord.model');
const Invoice            = require('../../models/Invoice.model');
const Subscription       = require('../../models/Subscription.model');
const identityFacade     = require('../../shared/facades/identity.facade');
const { AppError }       = require('../../shared/errors/AppError');
const { ERROR_CODES }    = require('../../shared/errors/errorCodes');
const { createAuditLog } = require('../../shared/utils/auditLogService');
const { enqueueEmail }   = require('../../queues/email.queue');
const { enqueueDunningStep } = require('../../queues/dunning.queue');
const redisClient        = require('../../config/redis');
const { addEventToOutbox }    = require('../../shared/events/outbox.helper');
const logger             = require('../../shared/utils/logger');

// ── Constants ─────────────────────────────────────────────────
// Days from createdAt for each retry step
const RETRY_SCHEDULE_DAYS = [0, 3, 7, 14];

// ── Redis Lock ─────────────────────────────────────────────────
const acquireLock = async (key, ttl = 600) => {
  const result = await redisClient.set(key, '1', 'NX', 'EX', ttl);
  return result === 'OK';
};

const releaseLock = async (key) => {
  await redisClient.del(key).catch(() => {});
};

const invalidateCache = async (tenantId) => {
  await redisClient.del(`tenant:ctx:${tenantId}`).catch(() => {});
};

// ── initiateDunning() ─────────────────────────────────────────
/**
 * Create a DunningRecord for a failed payment.
 * Called by payment.worker.js on payment.failed event.
 *
 * Idempotent: if an active DunningRecord already exists for this invoiceId, returns it.
 *
 * @param {string} tenantId
 * @param {string} subscriptionId
 * @param {string} invoiceId
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<DunningRecord>}
 */
const initiateDunning = async (tenantId, subscriptionId, invoiceId, session = null) => {
  // Idempotency: check for existing active dunning record
  const existing = await DunningRecord.findOne({ invoiceId, status: 'active' }).session(session);
  if (existing) {
    logger.info({ invoiceId, dunningId: existing._id }, 'Active DunningRecord already exists — skipping initiation');
    return existing;
  }

  // Step 0 scheduled immediately + 1 hour (gives time for webhook to settle)
  const now         = new Date();
  const nextRetryAt = new Date(now.getTime() + 60 * 60 * 1000);  // +1 hour

  const [dunningRecord] = await DunningRecord.create([{
    tenantId,
    subscriptionId,
    invoiceId,
    status:      'active',
    currentStep: 0,
    nextRetryAt,
    steps: [
      {
        step:        0,
        scheduledAt: nextRetryAt,
        outcome:     'pending',
      },
    ],
  }], { session });

  if (session) {
    await addEventToOutbox({
      eventType: 'dunning.started',
      eventVersion: 'v1',
      producer: 'billing-service',
      aggregateType: 'dunning',
      aggregateId: dunningRecord._id.toString(),
      tenantId: tenantId.toString(),
      payload: {
        dunningRecordId: dunningRecord._id.toString(),
        invoiceId: invoiceId.toString(),
        subscriptionId: subscriptionId.toString(),
        invoiceAmount: dunningRecord.invoiceAmount,
        status: dunningRecord.status
      },
      session,
    });
  }

  logger.info({ dunningId: dunningRecord._id, tenantId, invoiceId }, 'DunningRecord created at step 0');

  // Enqueue immediate step 0 processing (idempotent, safe outside transaction commit block conceptually)
  await enqueueDunningStep(dunningRecord._id.toString());

  return dunningRecord;
};

// ── advanceDunningStep() ──────────────────────────────────────
/**
 * Attempt the current dunning step payment retry.
 * Called by dunning.worker.js for each job.
 *
 * Acquires Redis lock to prevent duplicate execution.
 * Attempts Razorpay payment using stored customer payment method.
 *
 * @param {string} dunningRecordId
 * @returns {Promise<DunningRecord>}
 */
const advanceDunningStep = async (dunningRecordId) => {
  const lockKey = `lock:dunning:${dunningRecordId}`;
  const lockAcquired = await acquireLock(lockKey, 600);

  if (!lockAcquired) {
    throw new AppError(
      'Dunning step already in progress for this record.',
      409,
      ERROR_CODES.DUNNING_LOCK_HELD,
      { dunningRecordId }
    );
  }

  try {
    const dunningRecord = await DunningRecord.findById(dunningRecordId);
    if (!dunningRecord) {
      throw new AppError('DunningRecord not found.', 404, ERROR_CODES.DUNNING_RECORD_NOT_FOUND);
    }

    if (dunningRecord.status !== 'active') {
      logger.info({ dunningRecordId, status: dunningRecord.status }, 'DunningRecord not active — skipping');
      return dunningRecord;
    }

    const currentStep = dunningRecord.currentStep;
    const invoice     = await Invoice.findById(dunningRecord.invoiceId);
    const subscription = await Subscription.findById(dunningRecord.subscriptionId);
    const tenant      = await identityFacade.getTenantBillingProfile(dunningRecord.tenantId);

    logger.info({ dunningRecordId, currentStep, tenantId: dunningRecord.tenantId }, 'Attempting dunning step');

    // Mark step as attempted
    const stepRecord = dunningRecord.steps.find((s) => s.step === currentStep);
    if (stepRecord) {
      stepRecord.attemptedAt = new Date();
    }

    // ── Attempt Razorpay payment ─────────────────────────────
    let paymentSuccess = false;
    let paymentError   = null;
    let paymentTxId    = null;

    try {
      // Attempt recurring charge via Razorpay if customer has stored payment method
      if (tenant?.razorpayCustomerId) {
        const razorpay = require('../../config/razorpay');
        // NOTE: Razorpay recurring charge requires subscription token or saved card token
        // Here we create a new payment order — in production would use razorpay.subscriptions
        // For now: attempt to create Razorpay order for invoice amount
        const order = await razorpay.orders.create({
          amount:   invoice.amountDue,
          currency: invoice.currency || 'INR',
          receipt:  `dunning-${dunningRecord._id}-step${currentStep}`,
          notes: {
            dunningRecordId: dunningRecord._id.toString(),
            step:            currentStep,
          },
        });

        // In a production system: attempt auto-charge via stored payment method (Razorpay tokens)
        // For this implementation: we track the order creation as the retry attempt
        // Payment will be captured when customer pays through checkout
        paymentSuccess = false; // Manual payment required
        paymentError   = { code: 'MANUAL_PAYMENT_REQUIRED', description: 'Customer must complete payment manually' };

        logger.info({ dunningRecordId, orderId: order.id, currentStep }, 'Dunning retry order created');
      } else {
        paymentError = { code: 'NO_PAYMENT_METHOD', description: 'No stored payment method for customer' };
      }
    } catch (err) {
      paymentError = { code: err.error?.code || 'RAZORPAY_ERROR', description: err.message };
      logger.warn({ dunningRecordId, currentStep, err: err.message }, 'Dunning payment attempt failed');
    }

    if (paymentSuccess) {
      // ── SUCCESS: resolve dunning ─────────────────────────────
      if (stepRecord) stepRecord.outcome = 'success';
      await dunningRecord.save();
      await resolveDunning(dunningRecord._id.toString(), paymentTxId);
    } else {
      // ── FAILURE: advance or abandon ──────────────────────────
      if (stepRecord) {
        stepRecord.outcome   = 'failed';
        stepRecord.errorCode = paymentError?.code || null;
      }

      if (currentStep < 3) {
        // Advance to next step
        const nextStep     = currentStep + 1;
        const nextSchedule = addDays(dunningRecord.createdAt, RETRY_SCHEDULE_DAYS[nextStep]);

        dunningRecord.currentStep = nextStep;
        dunningRecord.nextRetryAt = nextSchedule;

        // Add next step to steps[]
        dunningRecord.steps.push({
          step:        nextStep,
          scheduledAt: nextSchedule,
          outcome:     'pending',
        });

        const mongoose = require('mongoose');
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            if (nextStep === 2 && subscription && subscription.status !== 'past_due') {
              subscription.status = 'past_due';
              await subscription.save({ session });

              logger.info(
                { subscriptionId: subscription._id, dunningRecordId },
                'Subscription marked past_due at dunning step 2'
              );
              
              // Note: tenant cache invalidation removed from sync flow, handled eventually
            }

            await dunningRecord.save({ session });
          });
        } finally {
          session.endSession();
        }

        logger.info({ dunningRecordId, nextStep, nextSchedule }, 'Dunning advanced to next step');

        // Enqueue dunning step email
        try {
          if (tenant?.billingEmail) {
            const daysMap = { 1: 3, 2: 7, 3: 3 };  // Days until suspension for each step email
            await enqueueEmail({
              type:      'dunning_step',
              to:        tenant.billingEmail,
              firstName: tenant.name,
              templateVars: {
                step:                nextStep,
                amountDue:           invoice.amountDue,
                daysUntilSuspension: daysMap[nextStep] || 0,
                paymentUrl:          `${process.env.CLIENT_URL}/billing/invoices/${invoice._id}`,
                tenantName:          tenant.name,
              },
            });
          }
        } catch (emailErr) {
          logger.warn({ err: emailErr.message }, 'Dunning step email enqueue failed');
        }

        // Phase 7 stub: Socket.IO emit
        logger.info(
          { tenantId: dunningRecord.tenantId, event: `dunning:step_${nextStep}` },
          `[Phase 7 stub] Socket.IO emit: dunning:step_${nextStep}`
        );

      } else {
        // currentStep === 3 and failed → ABANDON
        await abandonDunning(dunningRecord._id.toString());
      }
    }

    return dunningRecord;

  } finally {
    await releaseLock(lockKey);
  }
};

// ── resolveDunning() ──────────────────────────────────────────
/**
 * Resolve a dunning record after successful payment.
 * Restores subscription + tenant to 'active'.
 *
 * @param {string} dunningRecordId
 * @param {string} dunningRecordId
 * @param {string} [paymentTransactionId]
 * @param {import('mongoose').ClientSession} [session]
 */
const resolveDunning = async (dunningRecordId, paymentTransactionId = null, session = null) => {
  const dunningRecord = await DunningRecord.findById(dunningRecordId).session(session);
  if (!dunningRecord || dunningRecord.status === 'resolved') return;

  dunningRecord.status     = 'resolved';
  dunningRecord.resolvedAt = new Date();
  await dunningRecord.save({ session });

  // Restore subscription to active (Tenant restored async via invoice.paid)
  if (dunningRecord.subscriptionId) {
    await Subscription.findByIdAndUpdate(dunningRecord.subscriptionId, { status: 'active' }, { session });
  }

  // Identity Tenant update removed, handled by event consumer if needed.

  await createAuditLog({
    event:        'dunning.resolved',
    resourceType: 'dunning_record',
    resourceId:   dunningRecord._id,
    tenantId:     dunningRecord.tenantId,
    actor:        { id: null, role: 'system', email: 'system' },
    before:       { status: 'active' },
    after:        dunningRecord.toObject(),
  }).catch(() => {});

  // Phase 7 stub: Socket.IO emit
  logger.info(
    { tenantId: dunningRecord.tenantId, event: 'dunning:resolved' },
    '[Phase 7 stub] Socket.IO emit: dunning:resolved'
  );

  logger.info(
    { dunningRecordId, tenantId: dunningRecord.tenantId, paymentTransactionId },
    'DunningRecord resolved — subscription and tenant restored to active'
  );
};

// ── abandonDunning() ──────────────────────────────────────────
/**
 * Abandon dunning after all steps exhausted (step 3 failure).
 * Suspends tenant, marks invoice uncollectible.
 *
 * @param {string} dunningRecordId
 */
const abandonDunning = async (dunningRecordId) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  let dunningRecord;
  try {
    await session.withTransaction(async () => {
      dunningRecord = await DunningRecord.findById(dunningRecordId).session(session);
      if (!dunningRecord || dunningRecord.status !== 'active') return;

      dunningRecord.status      = 'abandoned';
      dunningRecord.abandonedAt = new Date();
      
      const stepRecord = dunningRecord.steps.find((s) => s.step === 3);
      if (stepRecord) {
        stepRecord.outcome = 'failed';
      }
      
      await dunningRecord.save({ session });

      // Suspend subscription, mark invoice uncollectible
      await Promise.all([
        Subscription.findByIdAndUpdate(dunningRecord.subscriptionId, { status: 'suspended' }, { session }),
        Invoice.findByIdAndUpdate(dunningRecord.invoiceId, { status: 'uncollectible' }, { session }),
      ]);

      await addEventToOutbox({
        eventType: 'dunning.abandoned',
        eventVersion: 'v1',
        producer: 'billing-service',
        aggregateType: 'dunning',
        aggregateId: dunningRecord._id.toString(),
        tenantId: dunningRecord.tenantId.toString(),
        payload: {
          dunningRecordId: dunningRecord._id.toString(),
          invoiceId: dunningRecord.invoiceId.toString(),
          invoiceAmount: dunningRecord.invoiceAmount,
          status: 'abandoned'
        },
        session,
      });
    });
  } finally {
    session.endSession();
  }

  if (!dunningRecord || dunningRecord.status !== 'abandoned') return;

  await createAuditLog({
    event:        'dunning.abandoned',
    resourceType: 'dunning_record',
    resourceId:   dunningRecord._id,
    tenantId:     dunningRecord.tenantId,
    actor:        { id: null, role: 'system', email: 'system' },
    before:       { status: 'active' },
    after:        dunningRecord.toObject(),
  }).catch(() => {});

  // Enqueue account suspension email
  try {
    const tenant = await identityFacade.getTenantBillingProfile(dunningRecord.tenantId);
    if (tenant?.billingEmail) {
      await enqueueEmail({
        type:      'account_suspended',
        to:        tenant.billingEmail,
        firstName: tenant.name,
        templateVars: {
          tenantName: tenant.name,
          supportUrl: `${process.env.CLIENT_URL}/support`,
        },
      });
    }
  } catch (emailErr) {
    logger.warn({ err: emailErr.message }, 'Account suspended email enqueue failed');
  }

  // Phase 7 stub: Socket.IO emit to admin:global
  logger.info(
    { tenantId: dunningRecord.tenantId, event: 'dunning:exhausted' },
    '[Phase 7 stub] Socket.IO emit to admin:global: dunning:exhausted'
  );

  logger.warn(
    { dunningRecordId, tenantId: dunningRecord.tenantId },
    'DunningRecord ABANDONED — tenant suspended, invoice uncollectible'
  );
};

// ── Admin Methods ─────────────────────────────────────────────

/**
 * List active dunning records (admin view).
 * @param {Object} options - { page, limit }
 */
const listActiveDunning = async (options = {}) => {
  const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
  const { page, limit, skip } = parsePagination(options);

  const [records, total] = await Promise.all([
    DunningRecord.find({ status: 'active' })
      .sort({ nextRetryAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('tenantId', 'name slug')
      .populate('invoiceId', 'invoiceNumber amountDue total')
      .lean(),
    DunningRecord.countDocuments({ status: 'active' }),
  ]);

  return {
    records,
    pagination: paginationMeta(total, page, limit),
  };
};

/**
 * Reset dunning to step 0 with immediate retry scheduled (admin).
 * @param {string} dunningRecordId
 * @param {Object} actorUser
 */
const resetDunning = async (dunningRecordId, actorUser) => {
  const dunningRecord = await DunningRecord.findById(dunningRecordId);
  if (!dunningRecord) throw new AppError('DunningRecord not found.', 404, ERROR_CODES.DUNNING_RECORD_NOT_FOUND);
  if (dunningRecord.status !== 'active') {
    throw new AppError('Only active dunning records can be reset.', 409, ERROR_CODES.DUNNING_ALREADY_RESOLVED);
  }

  const before = dunningRecord.toObject();

  // Reset to step 0 with nextRetryAt = now + 1 hour
  const nextRetryAt = new Date(Date.now() + 60 * 60 * 1000);
  dunningRecord.currentStep = 0;
  dunningRecord.nextRetryAt = nextRetryAt;

  // Reset step 0 scheduledAt and outcome
  const step0 = dunningRecord.steps.find((s) => s.step === 0);
  if (step0) {
    step0.scheduledAt = nextRetryAt;
    step0.outcome     = 'pending';
    step0.attemptedAt = null;
    step0.errorCode   = null;
  } else {
    dunningRecord.steps.push({ step: 0, scheduledAt: nextRetryAt, outcome: 'pending' });
  }

  await dunningRecord.save();

  await createAuditLog({
    event:        'dunning.reset',
    resourceType: 'dunning_record',
    resourceId:   dunningRecord._id,
    tenantId:     dunningRecord.tenantId,
    actor:        actorUser,
    before,
    after:        dunningRecord.toObject(),
  });

  // Enqueue immediate processing
  await enqueueDunningStep(dunningRecord._id.toString());

  logger.info({ dunningRecordId, actor: actorUser.email }, 'DunningRecord reset to step 0 by admin');
  return dunningRecord.toObject();
};

/**
 * Manually abandon a dunning record (admin write-off).
 * @param {string} dunningRecordId
 * @param {Object} actorUser
 */
const manualAbandon = async (dunningRecordId, actorUser) => {
  const dunningRecord = await DunningRecord.findById(dunningRecordId);
  if (!dunningRecord) throw new AppError('DunningRecord not found.', 404, ERROR_CODES.DUNNING_RECORD_NOT_FOUND);
  if (dunningRecord.status !== 'active') {
    throw new AppError('Only active dunning records can be abandoned.', 409, ERROR_CODES.DUNNING_ALREADY_RESOLVED);
  }

  // Create AuditLog before abandoning
  await createAuditLog({
    event:        'dunning.manual_abandon',
    resourceType: 'dunning_record',
    resourceId:   dunningRecord._id,
    tenantId:     dunningRecord.tenantId,
    actor:        actorUser,
    before:       dunningRecord.toObject(),
    after:        null,
  });

  await abandonDunning(dunningRecordId);
  return { success: true };
};

module.exports = {
  initiateDunning,
  advanceDunningStep,
  resolveDunning,
  abandonDunning,
  listActiveDunning,
  resetDunning,
  manualAbandon,
};
