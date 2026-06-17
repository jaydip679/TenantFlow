'use strict';

/**
 * Invoice Worker
 *
 * BullMQ worker consuming 'invoice-queue' jobs.
 * Calls invoiceService.generateInvoice() for each job.
 *
 * Concurrency: 2 (keep MongoDB pressure low; invoice generation is DB-heavy)
 * Retry policy: 3 attempts, exponential backoff (defined on queue)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.4
 * REF: docs/SRS.md §6.2 — Invoice Generation Process
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/invoice.queue');

/**
 * Process a single invoice generation job.
 * @param {import('bullmq').Job} job
 */
const processInvoiceJob = async (job) => {
  const { subscriptionId, triggerReason, upgradeContext } = job.data;

  logger.info({ jobId: job.id, subscriptionId, triggerReason }, 'Processing invoice job');

  // Lazy-require the service to ensure DB is connected before first access
  const invoiceService = require('../modules/invoices/invoice.service');
  const invoice = await invoiceService.generateInvoice(subscriptionId, triggerReason, upgradeContext);

  logger.info(
    { jobId: job.id, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
    'Invoice job completed'
  );

  return { invoiceId: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber };
};

// ── Worker Instance ───────────────────────────────────────────
const invoiceWorker = new Worker(QUEUE_NAME, processInvoiceJob, {
  connection:  bullmqConnection,
  concurrency: 2,
});

invoiceWorker.on('completed', (job, result) => {
  logger.info(
    { jobId: job.id, subscriptionId: job.data.subscriptionId, ...result },
    'Invoice job completed'
  );
});

invoiceWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:          job?.id,
      subscriptionId: job?.data?.subscriptionId,
      triggerReason:  job?.data?.triggerReason,
      err:            err.message,
      attempts:       job?.attemptsMade,
    },
    'Invoice job failed'
  );
});

invoiceWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'Invoice worker error');
});

module.exports = { invoiceWorker };
