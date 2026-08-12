'use strict';

const mongoose = require('mongoose');

const analyticsProcessedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'analytics_processed_events',
  }
);

module.exports = mongoose.model('AnalyticsProcessedEvent', analyticsProcessedEventSchema);
