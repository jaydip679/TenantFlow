'use strict';

const mongoose = require('mongoose');

const OutboxEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    eventVersion: { type: String, required: true, default: 'v1' },
    occurredAt: { type: Date, required: true },
    tenantId: { type: String, default: null },
    producer: { type: String, required: true },
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    correlationId: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ['pending', 'publishing', 'published', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: Date.now },
    leaseUntil: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Index for polling publisher to quickly claim available events
OutboxEventSchema.index({ status: 1, availableAt: 1, leaseUntil: 1 });

module.exports = mongoose.model('OutboxEvent', OutboxEventSchema);
