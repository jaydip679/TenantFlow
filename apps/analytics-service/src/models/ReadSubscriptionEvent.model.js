'use strict';

const mongoose = require('mongoose');

const readSubscriptionEventSchema = new mongoose.Schema(
  {
    // Race-safe idempotency key (the _id of the SubscriptionEvent in the billing database)
    sourceEventId: { type: String, required: true, unique: true, index: true },
    
    subscriptionId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    
    event: { type: String, required: true, index: true },
    
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    
    fromPlanId: { type: String, default: null },
    toPlanId: { type: String, default: null },
    
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    triggeredBy: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    createdAt: { type: Date, required: true },
  },
  {
    timestamps: true, // adds local _createdAt and _updatedAt
    collection: 'analytics_read_subscription_events',
  }
);

// Indexes required for sorting and filtering in the MRR and Timeline queries
readSubscriptionEventSchema.index({ tenantId: 1, createdAt: -1 });
readSubscriptionEventSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('ReadSubscriptionEvent', readSubscriptionEventSchema);
