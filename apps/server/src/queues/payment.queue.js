'use strict';

/**
 * Payment Queue
 *
 * BullMQ queue for payment verification jobs.
 * Both /payments/verify (client flow) and /payments/webhook (server flow)
 * route captured/failed payment events through this queue.
 *
 * Job payload: { event, razorpayOrderId, razorpayPaymentId, payload, source, webhookLogId? }
 *   event:     'payment.captured' | 'payment.failed' | 'subscription.charged'
 *   source:    'client' | 'webhook'
 *
 * Default job options:
 *   - attempts: 5 (payment verification failures are critical)
 *   - backoff: exponential, 5 seconds base
 *   - removeOnComplete: keep last 100
 *   - removeOnFail: keep last 500 (critical for audit)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.1 T5.4
 * REF: docs/SRS.md §7 — Payment Worker Processing
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'payment-verify-queue';

const paymentQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type:  'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  },
});

paymentQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Payment queue error');
});

/**
 * Enqueue a payment verification job.
 *
 * @param {string} event             - 'payment.captured' | 'payment.failed'
 * @param {string} razorpayOrderId
 * @param {string} razorpayPaymentId
 * @param {Object} payload           - Full Razorpay event payload
 * @param {string} source            - 'client' | 'webhook'
 * @param {string} [webhookLogId]    - WebhookLog._id if source='webhook'
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueuePaymentVerification = async (event, razorpayOrderId, razorpayPaymentId, payload, source, webhookLogId = null) => {
  const jobId = `payment:${razorpayOrderId}:${razorpayPaymentId}:${Date.now()}`;
  return paymentQueue.add(
    'verify-payment',
    { event, razorpayOrderId, razorpayPaymentId, payload, source, webhookLogId },
    { jobId }
  );
};

module.exports = { paymentQueue, enqueuePaymentVerification, QUEUE_NAME };
