'use strict';

const mongoose = require('mongoose');
const ReadTenant = require('./ReadTenant.model');

describe('ReadTenant Model', () => {
  it('should validate required fields', () => {
    const doc = new ReadTenant();
    const err = doc.validateSync();
    expect(err.errors.tenantId).toBeDefined();
    expect(err.errors.name).toBeDefined();
    expect(err.errors.status).toBeDefined();
    expect(err.errors.ownerEmail).toBeDefined();
  });

  it('should apply defaults', () => {
    const doc = new ReadTenant({
      tenantId: new mongoose.Types.ObjectId().toString(),
      name: 'Tenant 1',
      slug: 'tenant-1',
      status: 'active',
      ownerEmail: 'owner@t.com',
      createdAt: new Date(),
    });
    expect(doc.mrr).toBe(0);
    expect(doc.healthScore).toBeNull();
    expect(doc.aggregateVersion).toBe(1);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
