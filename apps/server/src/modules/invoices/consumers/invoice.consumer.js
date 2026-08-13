'use strict';

const mongoose = require('mongoose');
const { RedisStreamsEventBus } = require('../../../shared/events/redisStreamsEventBus');
const ProcessedEvent = require('../../../models/ProcessedEvent.model');
const Invoice = require('../../../models/Invoice.model');
const identityFacade = require('../../../shared/facades/identity.facade');
const { enqueueEmail } = require('../../../queues/email.queue');
const logger = require('../../../shared/utils/logger');

const eventBus = new RedisStreamsEventBus();

const CONSUMER_GROUP = 'billing-invoice-manager';
const CONSUMER_NAME = `invoice-consumer-${process.pid}`;

/**
 * Handle pdf.generated
 */
const handlePdfGenerated = async (envelope) => {
  const { eventId, aggregateId, payload } = envelope;
  const invoiceId = aggregateId;
  const { pdfUrl } = JSON.parse(payload);

  const session = await mongoose.startSession();
  let emailEnqueued = false;

  try {
    await session.withTransaction(async () => {
      // 1. Idempotency check via ProcessedEvent
      const existing = await ProcessedEvent.findOne({ eventId, consumer: CONSUMER_GROUP }).session(session);
      if (existing) {
        logger.info({ eventId, consumer: CONSUMER_GROUP }, 'Idempotent skip: event already processed');
        return;
      }

      await ProcessedEvent.create([{
        eventId,
        eventType: envelope.eventType,
        consumer: CONSUMER_GROUP,
      }], { session });

      // 2. Business Logic: Update Invoice pdfUrl
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) {
        logger.warn({ invoiceId }, 'Invoice not found for pdf.generated event');
        return;
      }

      if (invoice.pdfUrl !== pdfUrl) {
        invoice.pdfUrl = pdfUrl;
        await invoice.save({ session });
      }

      // 3. Enqueue Email
      const tenant = await identityFacade.getTenantBillingProfile(invoice.tenantId);
      const billingEmail = tenant?.billingEmail || tenant?.email;
      
      if (billingEmail) {
        await enqueueEmail({
          type: 'invoice_generated',
          to: billingEmail,
          tenantId: invoice.tenantId.toString(),
          templateVars: {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.total,
            pdfUrl,
          }
        });
        emailEnqueued = true;
      }
    });
  } catch (err) {
    logger.error({ err: err.message, eventId }, 'Error processing pdf.generated');
    throw err;
  } finally {
    session.endSession();
  }

  if (emailEnqueued) {
    logger.info({ eventId, invoiceId }, 'Successfully processed pdf.generated and enqueued email');
  }
};

let isRunning = false;

const startInvoiceConsumer = async () => {
  if (isRunning) return;
  isRunning = true;

  logger.info({ consumer: CONSUMER_GROUP }, 'Starting invoice consumer');

  const router = {
    'pdf.generated': handlePdfGenerated,
  };

  eventBus.subscribe({
    groupName: CONSUMER_GROUP,
    consumerName: CONSUMER_NAME,
    eventTypes: Object.keys(router),
    handler: async (envelope) => {
      const route = router[envelope.eventType];
      if (route) await route(envelope);
    }
  }).catch(err => {
    logger.error({ err: err.message }, 'Invoice consumer failed');
  });
};

const stopInvoiceConsumer = async () => {
  isRunning = false;
  logger.info('Invoice consumer stopped');
};

module.exports = { startInvoiceConsumer, stopInvoiceConsumer };
