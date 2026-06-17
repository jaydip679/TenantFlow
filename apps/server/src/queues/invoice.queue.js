'use strict';

/**
 * Invoice Queue
 *
 * BullMQ queue for invoice generation jobs.
 * Each job triggers generateInvoice() in the invoice worker.
 *
 * Job payload: { subscriptionId, triggerReason, upgradeContext? }
 * triggerReason: 'renewal' | 'upgrade' | 'seat_addition' | 'manual'
 *
 * Default job options:
 *   - attempts: 3 (retry failed invoice generation)
 *   - backoff: exponential, 10 seconds base
 *   - removeOnComplete: keep last 50
 *   - removeOnFail: keep last 200 (for audit)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.4
 * REF: docs/SYSTEM_DESIGN.md §7 — BullMQ Queue Architecture
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'invoice-queue';

const invoiceQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 10000,  // 10s base, then 20s, 40s
    },
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 200 },
  },
});

invoiceQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Invoice queue error');
});

/**
 * Enqueue an invoice generation job.
 *
 * @param {string} subscriptionId
 * @param {string} triggerReason - 'renewal' | 'upgrade' | 'seat_addition' | 'manual'
 * @param {Object} [upgradeContext] - { oldPlanVersionId, newPlanVersionId, proration }
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueInvoiceGeneration = async (subscriptionId, triggerReason, upgradeContext = null) => {
  const jobId = `invoice:${subscriptionId}:${triggerReason}:${Date.now()}`;
  return invoiceQueue.add('generate-invoice', { subscriptionId, triggerReason, upgradeContext }, { jobId });
};

module.exports = { invoiceQueue, enqueueInvoiceGeneration, QUEUE_NAME };
