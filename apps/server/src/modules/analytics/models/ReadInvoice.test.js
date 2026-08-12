'use strict';

const mongoose = require('mongoose');
const ReadInvoice = require('./ReadInvoice.model');

describe('ReadInvoice Model', () => {
  it('should validate required fields', () => {
    const doc = new ReadInvoice();
    const err = doc.validateSync();
    expect(err.errors.invoiceId).toBeDefined();
    expect(err.errors.tenantId).toBeDefined();
    expect(err.errors.status).toBeDefined();
    expect(err.errors.amountDue).toBeDefined();
    expect(err.errors.dueDate).toBeDefined();
  });

  it('should apply defaults', () => {
    const doc = new ReadInvoice({
      invoiceId: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      invoiceNumber: 'INV-1000',
      status: 'open',
      amountDue: 5000,
      total: 5000,
      dueDate: new Date(),
    });
    expect(doc.amountPaid).toBe(0);
    expect(doc.paidAt).toBeNull();
    expect(doc.aggregateVersion).toBe(1);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
