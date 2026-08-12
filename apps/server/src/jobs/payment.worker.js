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
const { addEventToOutbox } = require('../shared/events/outbox.helper');

/**
 * @param {import('bullmq').Job} job
 */
const processPaymentJob = async (job) => {
  const { event, razorpayOrderId, razorpayPaymentId, payload, source, webhookLogId } = job.data;

  logger.info({ jobId: job.id, event, razorpayOrderId, razorpayPaymentId, source }, 'Processing payment job');

  // Lazy-require ensures DB is connected before first use
  const mongoose           = require('mongoose');
  const PaymentTransaction = require('../models/PaymentTransaction.model');
  const Invoice            = require('../models/Invoice.model');
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

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // ── 1. Update PaymentTransaction ──────────────────────────
        transaction.status            = 'captured';
        transaction.razorpayPaymentId = razorpayPaymentId;
        transaction.capturedAt        = new Date();
        transaction.method            = payload?.payment?.entity?.method || null;
        await transaction.save({ session });

        // ── 2. Mark Invoice paid ──────────────────────────────────
        let invoiceBefore = null;
        const invoice = await Invoice.findById(transaction.invoiceId).session(session);
        if (invoice && invoice.status !== 'paid') {
          invoiceBefore = invoice.toObject();
          invoice.status     = 'paid';
          invoice.amountPaid = invoice.total;
          invoice.amountDue  = 0;
          invoice.paidAt     = new Date();
          await invoice.save({ session });

          // ── 3. Resolve DunningRecord (Phase 6) ─────────────────
          try {
            const dunningService = require('../modules/payments/dunning.service');
            const DunningRecord = require('../models/DunningRecord.model');
            const activeDunning = await DunningRecord.findOne({ invoiceId: invoice._id, status: 'active' }).session(session);
            if (activeDunning) {
              await dunningService.resolveDunning(activeDunning._id.toString(), transaction.razorpayPaymentId, session);
            }
          } catch (err) {
            logger.warn({ err: err.message }, 'DunningRecord resolve failed');
          }

          // ── 4. Outbox Events: invoice.paid & payment.succeeded ────
          await addEventToOutbox({
            eventType: 'invoice.paid',
            eventVersion: 'v1',
            producer: 'billing-service',
            aggregateType: 'invoice',
            aggregateId: invoice._id.toString(),
            tenantId: invoice.tenantId.toString(),
            payload: {
              invoiceId: invoice._id.toString(),
              amountPaid: invoice.amountPaid,
              paidAt: invoice.paidAt,
              paymentId: transaction._id.toString(),
              aggregateVersion: invoice.aggregateVersion,
            },
            session,
          });

          await addEventToOutbox({
            eventType: 'payment.succeeded',
            eventVersion: 'v1',
            producer: 'billing-service',
            aggregateType: 'payment',
            aggregateId: transaction._id.toString(),
            tenantId: invoice.tenantId.toString(),
            payload: {
              orderId: transaction.razorpayOrderId,
              invoiceId: invoice._id.toString(),
              amount: transaction.amount,
              method: transaction.method,
            },
            session,
          });
        }

        // ── Update WebhookLog if from webhook source ──────────────────
        if (source === 'webhook' && webhookLogId) {
          await WebhookLog.findByIdAndUpdate(webhookLogId, {
            status:      'processed',
            processedAt: new Date(),
          }, { session });
        }
      });
    } finally {
      session.endSession();
    }

    // ── Post-transaction Operations ────────────────────────────────
    const invoice = await Invoice.findById(transaction.invoiceId);
    if (invoice) {
      // Audit Log
      await createAuditLog({
        event:        'invoice.paid',
        resourceType: 'invoice',
        resourceId:   invoice._id,
        tenantId:     invoice.tenantId,
        actor:        { id: null, role: 'system', email: 'system' },
      }).catch((err) => logger.warn({ err: err.message }, 'AuditLog failed for invoice.paid'));

      // Enqueue payment success email
      try {
        const Tenant = require('../models/Tenant.model');
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

    // ── 7. Emit Socket.IO: payment:success ───────────────────
    try {
      const app = require('../app');
      const io  = app.get('io');
      if (io) {
        const { emitToAdmins } = require('../sockets/admin.namespace');
        emitToAdmins(io, 'admin:payment:success', {
          tenantId:      transaction.tenantId,
          invoiceId:     transaction.invoiceId,
          amountPaid:    invoice?.amountPaid || transaction.amount,
          paidAt:        transaction.capturedAt,
          razorpayPaymentId,
        });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Socket.IO payment:success emit failed (non-critical)');
    }

  } else if (event === 'payment.failed') {
    // ── payment.failed flow ───────────────────────────────────
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        transaction.status            = 'failed';
        transaction.razorpayPaymentId = razorpayPaymentId || transaction.razorpayPaymentId;
        transaction.errorCode         = payload?.payment?.entity?.error_code || null;
        transaction.errorDescription  = payload?.payment?.entity?.error_description || null;
        await transaction.save({ session });

        // Phase 6: initiate dunning workflow
        try {
          const dunningService = require('../modules/payments/dunning.service');
          await dunningService.initiateDunning(
            transaction.tenantId.toString(),
            transaction.subscriptionId.toString(),
            transaction.invoiceId.toString(),
            session
          );
        } catch (err) {
          logger.warn({ err: err.message, invoiceId: transaction.invoiceId }, 'Dunning initiation failed');
        }

        // ── Outbox Event: payment.failed ───────────────────────
        await addEventToOutbox({
          eventType: 'payment.failed',
          eventVersion: 'v1',
          producer: 'billing-service',
          aggregateType: 'payment',
          aggregateId: transaction._id.toString(),
          tenantId: transaction.tenantId.toString(),
          payload: {
            orderId: transaction.razorpayOrderId,
            invoiceId: transaction.invoiceId.toString(),
            errorCode: transaction.errorCode,
            errorDescription: transaction.errorDescription,
          },
          session,
        });

        // ── Update WebhookLog if from webhook source ───────────
        if (source === 'webhook' && webhookLogId) {
          await WebhookLog.findByIdAndUpdate(webhookLogId, {
            status:      'processed',
            processedAt: new Date(),
          }, { session });
        }
      });
    } finally {
      session.endSession();
    }

    // Enqueue payment failed email
    try {
      const Tenant = require('../models/Tenant.model');
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

    // ── Emit Socket.IO: payment:failed ──────────────────────
    try {
      const app = require('../app');
      const io  = app.get('io');
      if (io) {
        const { emitToAdmins } = require('../sockets/admin.namespace');
        emitToAdmins(io, 'admin:payment:failed', {
          tenantId:         transaction.tenantId,
          invoiceId:        transaction.invoiceId,
          errorDescription: transaction.errorDescription,
        });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Socket.IO payment:failed emit failed (non-critical)');
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
