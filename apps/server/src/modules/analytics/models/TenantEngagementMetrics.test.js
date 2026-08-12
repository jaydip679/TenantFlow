'use strict';

const mongoose = require('mongoose');
const TenantEngagementMetrics = require('./TenantEngagementMetrics.model');

describe('TenantEngagementMetrics Model', () => {
  it('should validate required fields', () => {
    const doc = new TenantEngagementMetrics();
    const err = doc.validateSync();
    expect(err.errors.tenantId).toBeDefined();
  });

  it('should apply defaults', () => {
    const doc = new TenantEngagementMetrics({
      tenantId: 't-1'
    });
    expect(doc.totalLogins).toBe(0);
    expect(doc.lastLoginAt).toBeNull();
    expect(doc.failedPaymentsCount).toBe(0);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
