'use strict';

/**
 * SubscriptionEvent Model
 *
 * Immutable append-only log of every subscription state transition.
 * Used for:
 *   - Audit trail (who changed what, when)
 *   - Analytics (churn rate, upgrade paths, conversion funnels)
 *   - Customer timeline display in admin dashboard
 *
 * IMPORTANT: updatedAt is DISABLED — this document is immutable.
 * Never update a SubscriptionEvent document.
 *
 * REF: docs/DATABASE_DESIGN.md §3.6 — subscription_events schema
 * REF: docs/DATABASE_DESIGN.md §5.5 — subscription_events indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionEventSchema = new Schema(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: [true, 'tenantId is required'],
    },
    subscriptionId: {
      type:     Schema.Types.ObjectId,
      ref:      'Subscription',
      required: [true, 'subscriptionId is required'],
    },
    event: {
      type: String,
      enum: [
        'subscription.created',
        'subscription.trial_started',
        'subscription.converted_to_paid',
        'subscription.upgraded',
        'subscription.downgrade_scheduled',
        'subscription.downgrade_applied',
        'subscription.cancelled',
        'subscription.reactivated',
        'subscription.paused',
        'subscription.resumed',
        'subscription.past_due',
        'subscription.suspended',
        'subscription.restored',
        'subscription.downgrade_cancelled',
      ],
      required: [true, 'event is required'],
    },
    fromStatus: { type: String, default: null },
    toStatus:   { type: String, required: [true, 'toStatus is required'] },
    fromPlanId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
    toPlanId:   { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
    triggeredBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      role:   { type: String, default: null },
      source: {
        type:    String,
        enum:    ['user', 'system', 'webhook', 'cron'],
        default: 'user',
      },
    },
    metadata: {
      type:    Map,
      of:      Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // createdAt only — updatedAt disabled (immutable event log)
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.5) ────────────────
subscriptionEventSchema.index({ tenantId: 1, createdAt: -1 });
subscriptionEventSchema.index({ subscriptionId: 1, createdAt: -1 });
subscriptionEventSchema.index({ event: 1, createdAt: -1 });

const SubscriptionEvent = mongoose.model('SubscriptionEvent', subscriptionEventSchema);

module.exports = SubscriptionEvent;
