'use strict';

/**
 * Subscription Model
 *
 * Tracks the billing relationship between a tenant and a plan.
 * Every tenant has at most ONE non-cancelled subscription at a time
 * (enforced at the application/service layer, not by DB unique index,
 * because a tenant can cancel and create a new one).
 *
 * CRITICAL: All monetary values in paise (integer). No floats.
 *
 * References:
 *   planVersionId — the IMMUTABLE PlanVersion snapshot at time of sub creation/change
 *   planId        — the live Plan (for display/upgrade comparison only)
 *
 * State machine → see subscription.statemachine.js
 *
 * REF: docs/DATABASE_DESIGN.md §3.5 — subscriptions schema
 * REF: docs/DATABASE_DESIGN.md §5.4 — subscriptions indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionSchema = new Schema(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: [true, 'tenantId is required'],
    },
    planId: {
      type:     Schema.Types.ObjectId,
      ref:      'Plan',
      required: [true, 'planId is required'],
    },
    planVersionId: {
      type:     Schema.Types.ObjectId,
      ref:      'PlanVersion',
      required: [true, 'planVersionId is required'],
    },
    status: {
      type: String,
      enum: [
        'trialing',
        'active',
        'past_due',
        'cancelled',
        'paused',
        'pending_downgrade',
      ],
      default: 'trialing',
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd:   { type: Date, required: true },
    trialStart:         { type: Date, default: null },
    trialEnd:           { type: Date, default: null },
    cancelledAt:        { type: Date, default: null },
    cancelAtPeriodEnd:  { type: Boolean, default: false },
    cancelReason:       { type: String, default: null },
    pausedAt:           { type: Date, default: null },
    pauseEndsAt:        { type: Date, default: null },
    // Scheduled downgrade — set by downgradeSubscription(), applied by billingRenew cron
    pendingPlanId: {
      type:    Schema.Types.ObjectId,
      ref:     'Plan',
      default: null,
    },
    // Seat count as of this subscription (not derived — stored for billing purposes)
    seatCount: {
      type:     Number,
      required: true,
      min:      1,
    },
    // The day of the month that billing anchors to (for consistent renewal dates)
    billingCycleAnchor: {
      type:     Date,
      required: true,
    },
    // Razorpay identifiers (populated in Phase 5)
    razorpayPlanId: { type: String, default: null },
    metadata: {
      type:    Map,
      of:      Schema.Types.Mixed,
      default: {},
    },
    // Event ordering protection for Analytics projections
    aggregateVersion: {
      type:    Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// ── Hooks ───────────────────────────────────────────────────────
subscriptionSchema.pre('save', function (next) {
  if (this.isModified()) {
    this.aggregateVersion = (this.aggregateVersion || 0) + 1;
  }
  next();
});

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.4) ────────────────
subscriptionSchema.index({ tenantId: 1 });
// Billing cron: find subscriptions due for renewal
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
// Trial expiry cron
subscriptionSchema.index({ status: 1, trialEnd: 1 });
// Downgrade applications
subscriptionSchema.index({ status: 1, cancelAtPeriodEnd: 1, currentPeriodEnd: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
