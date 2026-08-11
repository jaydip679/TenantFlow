'use strict';

const mongoose = require('mongoose');

const ProcessedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    consumer: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, required: true },
  },
  {
    timestamps: true,
  }
);

// Unique compound index for consumer-side idempotency
ProcessedEventSchema.index({ eventId: 1, consumer: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedEvent', ProcessedEventSchema);
