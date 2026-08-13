'use strict';

const mongoose = require('mongoose');
const ReadSubscription = require('./ReadSubscription.model');

describe('ReadSubscription Model', () => {
  it('should validate required fields', () => {
    const doc = new ReadSubscription();
    const err = doc.validateSync();
    expect(err.errors.subscriptionId).toBeDefined();
    expect(err.errors.tenantId).toBeDefined();
    expect(err.errors.planId).toBeDefined();
    expect(err.errors.status).toBeDefined();
    expect(err.errors.seatCount).toBeDefined();
    expect(err.errors.currentPeriodEnd).toBeDefined();
  });

  it('should apply defaults', () => {
    const doc = new ReadSubscription({
      subscriptionId: 'sub-1',
      tenantId: 't-1',
      planId: 'plan-1',
      status: 'active',
      seatCount: 5,
      currentPeriodEnd: new Date()
    });
    expect(doc.cancelAtPeriodEnd).toBe(false);
    expect(doc.aggregateVersion).toBe(1);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
