'use strict';

const mongoose = require('mongoose');

const readTenantSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    status: { type: String, required: true },
    ownerEmail: { type: String, required: true },
    currentPlanId: { type: String, default: null },
    mrr: { type: Number, default: 0 },
    healthScore: { type: Number, default: null },
    hasActiveDunning: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    aggregateVersion: { type: Number, required: true, default: 1 },
  },
  {
    timestamps: true,
    collection: 'analytics_read_tenants',
  }
);

module.exports = mongoose.model('ReadTenant', readTenantSchema);
