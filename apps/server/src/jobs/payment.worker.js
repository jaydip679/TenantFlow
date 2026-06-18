'use strict';

/**
 * Payment Worker
 *
 * BullMQ worker consuming 'payment-verify-queue' jobs.
 * Handles payment.captured and payment.failed events from both:
 *   - Client (POST /payments/verify)
 *   - Webhook (POST /payments/webhook via Razorpay)
 *
 * Concurrency: 5 (payment processing is critical but idempotent)
 * Retry policy: 5 attempts, exponential backoff
 *
 * payment.captured flow:
 *   1. Find PaymentTransaction by razorpayOrderId
 *   2. Update status='captured', razorpayPaymentId, capturedAt=now
 *   3. Mark Invoice paid: amountPaid=total, amountDue=0, paidAt=now, status='paid'
 *   4. If Tenant.status='past_due' → restore to 'active'
 *   5. Resolve active DunningRecord for invoice (Phase 6 stub)
 *   6. Create AuditLog
 *   7. Update WebhookLog: status='processed' (if webhook source)
 *   8. Enqueue email: type='payment_success'
 *   9. Emit Socket.IO: payment:success (Phase 7 stub: log only)
 *
 * payment.failed flow:
 *   1. Update PaymentTransaction: status='failed', errorCode, errorDescription
 *   2. Create/advance DunningRecord (Phase 6 stub: log only)
 *   3. Update WebhookLog: status='processed' (if webhook source)
 *   4. Enqueue email: type='payment_failed'
 *   5. Emit Socket.IO: payment:failed (Phase 7 stub: log only)
 *
 * REF: docs/SRS.md §7 — Payment Worker Processing
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.1 T5.4
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/payment.queue');

/**
 * @param {import('bullmq').Job} job
 */
const processPaymentJob = async (job) => {
  const { event, razorpayOrderId, razorpayPaymentId, payload, source, webhookLogId } = job.data;

  logger.info({ jobId: job.id, event, razorpayOrderId, razorpayPaymentId, source }, 'Processing payment job');

  // Lazy-require ensures DB is connected before first use
  const PaymentTransaction = require('../models/PaymentTransaction.model');
  const Invoice            = require('../models/Invoice.model');
  const Tenant             = require('../models/Tenant.model');
  const WebhookLog         = require('../models/WebhookLog.model');
  const { createAuditLog } = require('../shared/utils/auditLogService');
  const { enqueueEmail }   = require('../queues/email.queue');

  // ── Find PaymentTransaction ───────────────────────────────────
  const transaction = await PaymentTransaction.findOne({ razorpayOrderId });
  if (!transaction) {
    logger.warn({ razorpayOrderId }, 'PaymentTransaction not found — skipping');
    return;
  }

  if (event === 'payment.captured' || event === 'subscription.charged') {
    // ── Idempotency: already captured? ───────────────────────
    if (transaction.status === 'captured') {
      logger.info({ razorpayOrderId, razorpayPaymentId }, 'Payment already captured — idempotent skip');
      return;
    }

    // ── 1. Update PaymentTransaction ──────────────────────────
    const prevTransactionStatus = transaction.status;
    transaction.status            = 'captured';
    transaction.razorpayPaymentId = razorpayPaymentId;
    transaction.capturedAt        = new Date();
    transaction.method            = payload?.payment?.entity?.method || null;
    await transaction.save();

    // ── 2. Mark Invoice paid ──────────────────────────────────
    const invoice = await Invoice.findById(transaction.invoiceId);
    if (invoice && invoice.status !== 'paid') {
      const invoiceBefore = invoice.toObject();

      invoice.status     = 'paid';
      invoice.amountPaid = invoice.total;
      invoice.amountDue  = 0;
      invoice.paidAt     = new Date();
      await invoice.save();

      // ── 3. Restore past_due tenant to active ─────────────
      const tenant = await Tenant.findById(invoice.tenantId).select('status');
      if (tenant && tenant.status === 'past_due') {
        await Tenant.findByIdAndUpdate(invoice.tenantId, { status: 'active' });
        logger.info({ tenantId: invoice.tenantId }, 'Tenant restored from past_due to active after payment');
      }

      // ── 4. Resolve DunningRecord (Phase 6 stub) ───────────
      try {
        const DunningRecord = require('../models/DunningRecord.model');
        await DunningRecord.findOneAndUpdate(
          { invoiceId: invoice._id, status: 'active' },
          { status: 'resolved', resolvedAt: new Date() }
        );
      } catch (err) {
        logger.warn({ err: err.message }, 'DunningRecord resolve skipped (Phase 6 stub)');
      }

      // ── 5. Audit Log ─────────────────────────────────────
      await createAuditLog({
        event:        'invoice.paid',
        resourceType: 'invoice',
        resourceId:   invoice._id,
        tenantId:     invoice.tenantId,
        actor:        { id: null, role: 'system', email: 'system' },
        before:       invoiceBefore,
        after:        invoice.toObject(),
      }).catch((err) => logger.warn({ err: err.message }, 'AuditLog failed for invoice.paid'));

      // ── 6. Enqueue payment success email ──────────────────
      try {
        const billingTenant = await Tenant.findById(invoice.tenantId).select('name billingEmail').lean();
        if (billingTenant?.billingEmail) {
          await enqueueEmail({
            type:      'payment_success',
            to:        billingTenant.billingEmail,
            firstName: billingTenant.name,
            templateVars: {
              invoiceNumber: invoice.invoiceNumber,
              amountPaid:    invoice.amountPaid,
              paidAt:        invoice.paidAt,
              tenantName:    billingTenant.name,
            },
          });
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Payment success email enqueue failed');
      }
    }

    // ── 7. Phase 7 stub: Socket.IO ────────────────────────────
    logger.info(
      { tenantId: transaction.tenantId, event: 'payment:success' },
      '[Phase 7 stub] Socket.IO emit: payment:success'
    );

  } else if (event === 'payment.failed') {
    // ── payment.failed flow ───────────────────────────────────

    transaction.status            = 'failed';
    transaction.razorpayPaymentId = razorpayPaymentId || transaction.razorpayPaymentId;
    transaction.errorCode         = payload?.payment?.entity?.error_code || null;
    transaction.errorDescription  = payload?.payment?.entity?.error_description || null;
    await transaction.save();

    // Phase 6 stub: create/advance DunningRecord (log only)
    logger.info(
      { invoiceId: transaction.invoiceId, tenantId: transaction.tenantId },
      '[Phase 6 stub] payment.failed — DunningRecord creation/advance will be here'
    );

    // Enqueue payment failed email
    try {
      const failedTenant = await Tenant.findById(transaction.tenantId).select('name billingEmail').lean();
      if (failedTenant?.billingEmail) {
        await enqueueEmail({
          type:      'payment_failed',
          to:        failedTenant.billingEmail,
          firstName: failedTenant.name,
          templateVars: {
            tenantName:       failedTenant.name,
            errorDescription: transaction.errorDescription || 'Payment could not be processed',
          },
        });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Payment failed email enqueue failed');
    }

    // Phase 7 stub: Socket.IO
    logger.info(
      { tenantId: transaction.tenantId, event: 'payment:failed' },
      '[Phase 7 stub] Socket.IO emit: payment:failed'
    );
  }

  // ── Update WebhookLog if from webhook source ──────────────────
  if (source === 'webhook' && webhookLogId) {
    try {
      await WebhookLog.findByIdAndUpdate(webhookLogId, {
        status:      'processed',
        processedAt: new Date(),
      });
    } catch (err) {
      logger.warn({ err: err.message, webhookLogId }, 'WebhookLog update failed');
    }
  }

  logger.info({ jobId: job.id, event, razorpayOrderId, razorpayPaymentId }, 'Payment job completed');
};

// ── Worker Instance ───────────────────────────────────────────
const paymentWorker = new Worker(QUEUE_NAME, processPaymentJob, {
  connection:  bullmqConnection,
  concurrency: 5,
});

paymentWorker.on('completed', (job) => {
  logger.info(
    { jobId: job.id, event: job.data.event, razorpayOrderId: job.data.razorpayOrderId },
    'Payment job completed'
  );
});

paymentWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:           job?.id,
      event:           job?.data?.event,
      razorpayOrderId: job?.data?.razorpayOrderId,
      err:             err.message,
      attempts:        job?.attemptsMade,
    },
    'Payment job failed'
  );
});

paymentWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'Payment worker error');
});

module.exports = { paymentWorker };
