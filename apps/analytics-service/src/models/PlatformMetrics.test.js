'use strict';

const mongoose = require('mongoose');
const PlatformMetrics = require('./PlatformMetrics.model');

describe('PlatformMetrics Model', () => {
  it('should validate required fields', () => {
    const doc = new PlatformMetrics();
    const err = doc.validateSync();
    expect(err.errors.date).toBeDefined();
  });

  it('should apply defaults', () => {
    const doc = new PlatformMetrics({
      date: '2023-10-01'
    });
    expect(doc.activeTenants).toBe(0);
    expect(doc.totalMRR).toBe(0);
    expect(doc.churnedTenants).toBe(0);
    expect(doc.newSubscriptions).toBe(0);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
