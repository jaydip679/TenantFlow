'use strict';

const ReadInvoice = require('../models/ReadInvoice.model');
const logger = require('../shared/utils/logger');

const handleInvoiceCreated = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const existing = await ReadInvoice.findOne({ invoiceId: payload.invoiceId }).session(session);
  if (!existing) {
    await ReadInvoice.create(
      [
        {
          invoiceId: payload.invoiceId,
          tenantId,
          status: payload.status,
          total: payload.amount,
          amountDue: payload.amount,
          invoiceNumber: payload.invoiceNumber,
          currency: payload.currency,
          dueDate: payload.dueDate,
          amountPaid: 0,
          paidAt: null,
          aggregateVersion: payload.aggregateVersion,
        },
      ],
      { session }
    );
  } else if (payload.aggregateVersion > existing.aggregateVersion) {
    existing.tenantId = tenantId;
    existing.status = payload.status;
    if (payload.total !== undefined) existing.total = payload.total;
    existing.amountDue = payload.amount;
    existing.invoiceNumber = payload.invoiceNumber;
    existing.currency = payload.currency;
    existing.dueDate = payload.dueDate;
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  }
};

const handleInvoiceVoided = async (envelope, session) => {
  const { payload } = envelope;

  const existing = await ReadInvoice.findOne({ invoiceId: payload.invoiceId }).session(session);
  if (existing && payload.aggregateVersion > existing.aggregateVersion) {
    existing.status = 'void';
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  } else if (!existing) {
    logger.warn({ invoiceId: payload.invoiceId }, 'Received invoice.voided for unknown invoice');
  }
};

const handleInvoicePaid = async (envelope, session) => {
  const { payload } = envelope;

  const existing = await ReadInvoice.findOne({ invoiceId: payload.invoiceId }).session(session);
  if (existing && payload.aggregateVersion > existing.aggregateVersion) {
    existing.status = 'paid';
    existing.amountPaid = payload.amountPaid;
    existing.paidAt = payload.paidAt;
    existing.aggregateVersion = payload.aggregateVersion;
    await existing.save({ session });
  } else if (!existing) {
    logger.warn({ invoiceId: payload.invoiceId }, 'Received invoice.paid for unknown invoice');
  }
};

module.exports = {
  handleInvoiceCreated,
  handleInvoiceVoided,
  handleInvoicePaid,
};
