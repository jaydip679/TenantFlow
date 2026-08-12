'use strict';

const mongoose = require('mongoose');

const platformProcessedEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
  },
  eventType: {
    type: String,
    required: true,
  },
  consumer: {
    type: String,
    required: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
  }
}, { timestamps: true });

// Ensure exact same event cannot be processed twice by the same consumer group
platformProcessedEventSchema.index({ eventId: 1, consumer: 1 }, { unique: true });

// Auto-delete records after 7 days (TTL Index) to prevent infinite growth
platformProcessedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const PlatformProcessedEvent = mongoose.model('PlatformProcessedEvent', platformProcessedEventSchema);
module.exports = PlatformProcessedEvent;
