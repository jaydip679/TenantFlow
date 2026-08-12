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
const { generateInvoicePdf } = require('./invoice.pdf.template');
const { cloudinaryUpload } = require('../config/cloudinary');
const redisClient = require('../config/redis');

/**
 * Upload a PDF buffer to Cloudinary.
 */
const uploadPdfToCloudinary = async (pdfBuffer, tenantId, invoiceId) => {
  return new Promise((resolve, reject) => {
    cloudinaryUpload(pdfBuffer, {
      folder: `tenantflow/invoices/${tenantId}`,
      public_id: invoiceId,
      format: 'pdf',
      resource_type: 'raw',
    })
      .then(res => resolve(res.secure_url))
      .catch(reject);
  });
};

/**
 * Process a single PDF generation job.
 */
const processPdfJob = async (job) => {
  const { invoiceId, invoiceData } = job.data;
  const { invoice, tenant, subscription } = invoiceData;

  logger.info({ jobId: job.id, invoiceId }, 'Processing PDF job');

  // 1. Render PDF buffer
  const pdfBuffer = await generateInvoicePdf(invoice, tenant, subscription);

  // 2. Upload to Cloudinary
  const pdfUrl = await uploadPdfToCloudinary(pdfBuffer, invoice.tenantId.toString(), invoice._id.toString());
  logger.info({ invoiceId, pdfUrl }, 'PDF generated and uploaded to Cloudinary');

  // 3. Emit pdf.generated event
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const eventPayload = {
    eventId,
    eventType: 'pdf.generated',
    eventVersion: 'v1',
    producer: 'platform-service',
    aggregateType: 'invoice',
    aggregateId: invoiceId.toString(),
    timestamp: new Date().toISOString(),
    payload: JSON.stringify({
      invoiceId: invoiceId.toString(),
      pdfUrl,
    }),
  };

  await redisClient.xadd(
    'tenantflow:events',
    '*',
    'eventId', eventPayload.eventId,
    'eventType', eventPayload.eventType,
    'eventVersion', eventPayload.eventVersion,
    'producer', eventPayload.producer,
    'aggregateType', eventPayload.aggregateType,
    'aggregateId', eventPayload.aggregateId,
    'timestamp', eventPayload.timestamp,
    'payload', eventPayload.payload
  );

  logger.info({ eventId, invoiceId }, 'Published pdf.generated event');

  return { invoiceId, pdfUrl };
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

module.exports = { pdfWorker, processPdfJob };
