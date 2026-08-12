'use strict';

/**
 * PDF Queue
 *
 * BullMQ queue for PDF generation and Cloudinary upload jobs.
 * Each job triggers generatePdf() in the pdf worker.
 *
 * Job payload: { invoiceId }
 *
 * Default job options:
 *   - attempts: 3
 *   - backoff: exponential, 15 seconds base (PDFKit + Cloudinary can be slow)
 *   - removeOnComplete: keep last 50
 *   - removeOnFail: keep last 200
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.4
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'pdf-queue';

const pdfQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 15000,  // 15s base (Cloudinary upload can take several seconds)
    },
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 200 },
  },
});

pdfQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'PDF queue error');
});

/**
 * Enqueue a PDF generation job for an invoice.
 *
 * @param {string} invoiceId
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueuePdfGeneration = async (invoiceId) => {
  const Invoice = require('../modules/invoices/Invoice.model');
  const Subscription = require('../modules/subscriptions/Subscription.model');
  const identityFacade = require('../modules/admin/identity.facade');

  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

  const [tenant, subscription] = await Promise.all([
    identityFacade.getTenantBillingProfile(invoice.tenantId),
    Subscription.findById(invoice.subscriptionId).lean(),
  ]);

  const invoiceData = { invoice, tenant, subscription };
  const jobId = `pdf:${invoiceId}:${Date.now()}`;
  return pdfQueue.add('generate-pdf', { invoiceId, invoiceData }, { jobId });
};

module.exports = { pdfQueue, enqueuePdfGeneration, QUEUE_NAME };
