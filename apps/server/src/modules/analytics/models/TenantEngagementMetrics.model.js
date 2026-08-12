'use strict';

const mongoose = require('mongoose');

const tenantEngagementMetricsSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    totalLogins: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
    failedPaymentsCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'analytics_tenant_engagement_metrics',
  }
);

module.exports = mongoose.model('TenantEngagementMetrics', tenantEngagementMetricsSchema);
