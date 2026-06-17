'use strict';

/**
 * PDF Worker
 *
 * BullMQ worker consuming 'pdf-queue' jobs.
 * Calls invoiceService.generatePdf() for each job.
 *
 * Concurrency: 2 (Cloudinary upload is I/O-bound; moderate parallelism is fine)
 * Retry policy: 3 attempts, exponential backoff (defined on queue)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.4
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/pdf.queue');

/**
 * Process a single PDF generation job.
 * @param {import('bullmq').Job} job
 */
const processPdfJob = async (job) => {
  const { invoiceId } = job.data;

  logger.info({ jobId: job.id, invoiceId }, 'Processing PDF job');

  const invoiceService = require('../modules/invoices/invoice.service');
  const invoice = await invoiceService.generatePdf(invoiceId);

  logger.info(
    { jobId: job.id, invoiceId, pdfUrl: invoice.pdfUrl },
    'PDF job completed'
  );

  return { invoiceId, pdfUrl: invoice.pdfUrl };
};

// ── Worker Instance ───────────────────────────────────────────
const pdfWorker = new Worker(QUEUE_NAME, processPdfJob, {
  connection:  bullmqConnection,
  concurrency: 2,
});

pdfWorker.on('completed', (job, result) => {
  logger.info(
    { jobId: job.id, invoiceId: job.data.invoiceId, pdfUrl: result.pdfUrl },
    'PDF job completed'
  );
});

pdfWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, invoiceId: job?.data?.invoiceId, err: err.message, attempts: job?.attemptsMade },
    'PDF job failed'
  );
});

pdfWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'PDF worker error');
});

module.exports = { pdfWorker };
