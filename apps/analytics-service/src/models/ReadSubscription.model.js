'use strict';

const mongoose = require('mongoose');

const readSubscriptionSchema = new mongoose.Schema(
  {
    subscriptionId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    planId: { type: String, required: true },
    status: { type: String, required: true },
    seatCount: { type: Number, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    planName: { type: String },
    planPrice: { type: Number },
    planInterval: { type: String },
    currency: { type: String, default: 'INR' },
    maxSeats: { type: Number },
    subscriptionCreatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    aggregateVersion: { type: Number, required: true, default: 1 },
  },
  {
    timestamps: true,
    collection: 'analytics_read_subscriptions',
  }
);

module.exports = mongoose.model('ReadSubscription', readSubscriptionSchema);
