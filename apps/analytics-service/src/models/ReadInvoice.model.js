'use strict';

const mongoose = require('mongoose');

const readInvoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true },
    status: { type: String, required: true },
    total: { type: Number, required: true },
    amountDue: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    amountPaid: { type: Number, default: 0 },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    aggregateVersion: { type: Number, required: true, default: 1 },
  },
  {
    timestamps: true,
    collection: 'analytics_read_invoices',
  }
);

module.exports = mongoose.model('ReadInvoice', readInvoiceSchema);
