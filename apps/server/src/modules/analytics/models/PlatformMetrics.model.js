'use strict';

const mongoose = require('mongoose');

const platformMetricsSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true, index: true }, // Format: YYYY-MM-DD
    activeTenants: { type: Number, default: 0 },
    totalMRR: { type: Number, default: 0 },
    churnedTenants: { type: Number, default: 0 },
    newSubscriptions: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'analytics_platform_metrics',
  }
);

module.exports = mongoose.model('PlatformMetrics', platformMetricsSchema);
