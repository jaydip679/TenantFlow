'use strict';

/**
 * DunningRecord Model
 *
 * Tracks the full 4-step dunning lifecycle for a failed payment.
 *
 * State machine:
 *   active → resolved (on payment success at any step)
 *   active → abandoned (on step 3 failure)
 *
 * Steps (0-indexed):
 *   Step 0: Immediate — triggered by payment.failed webhook
 *   Step 1: createdAt + 3 days
 *   Step 2: createdAt + 7 days  (subscription → past_due)
 *   Step 3: createdAt + 14 days (final notice)
 *   Step 3 FAIL → tenant suspended, invoice = uncollectible
 *
 * Embedded steps[] sub-schema records each retry attempt for full audit trail.
 *
 * REF: docs/DATABASE_DESIGN.md §3.9 — dunning_records schema
 * REF: docs/DATABASE_DESIGN.md §5.8 — dunning_records indexes
 * REF: docs/SRS.md §13.3 — dunningCheck cron
 * REF: docs/SRS.md §13.4 — dunning worker logic
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Step Sub-schema ───────────────────────────────────────────
const dunningStepSchema = new Schema(
  {
    step:        { type: Number, required: true },  // 0, 1, 2, 3
    scheduledAt: { type: Date, required: true },
    attemptedAt: { type: Date, default: null },
    outcome: {
      type:    String,
      enum:    ['pending', 'success', 'failed', 'skipped'],
      default: 'pending',
    },
    paymentTransactionId: {
      type:    Schema.Types.ObjectId,
      ref:     'PaymentTransaction',
      default: null,
    },
    errorCode: { type: String, default: null },
  },
  { _id: true }
);

// ── DunningRecord Schema ──────────────────────────────────────
const dunningRecordSchema = new Schema(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: true,
    },
    subscriptionId: {
      type:     Schema.Types.ObjectId,
      ref:      'Subscription',
      required: true,
    },
    invoiceId: {
      type:     Schema.Types.ObjectId,
      ref:      'Invoice',
      required: true,
    },
    status: {
      type:    String,
      enum:    ['active', 'resolved', 'abandoned'],
      default: 'active',
    },
    currentStep:  { type: Number, default: 0 },   // 0-3
    nextRetryAt:  { type: Date, required: true },  // When cron should next process this record
    steps:        [dunningStepSchema],
    resolvedAt:   { type: Date, default: null },
    abandonedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.8) ────────────────
dunningRecordSchema.index({ tenantId: 1, status: 1 });
dunningRecordSchema.index({ status: 1, nextRetryAt: 1 });           // Cron query
dunningRecordSchema.index({ subscriptionId: 1, status: 1 });
dunningRecordSchema.index({ invoiceId: 1 });                        // Resolve by invoice

const DunningRecord = mongoose.model('DunningRecord', dunningRecordSchema);

module.exports = DunningRecord;
