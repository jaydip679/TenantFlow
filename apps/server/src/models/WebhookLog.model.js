'use strict';

/**
 * WebhookLog Model
 *
 * Immutable log of every Razorpay webhook received.
 * Used for:
 *   1. Idempotency — prevents processing the same event twice
 *   2. Debugging — full rawPayload stored for replay
 *   3. Audit — processedAt, errorMessage logged
 *
 * TTL: Auto-deleted after 30 days (expireAfterSeconds on createdAt index).
 *
 * IMPORTANT: razorpayPaymentId is unique — if a webhook arrives twice,
 * the second insertion fails → idempotency enforced at DB level.
 *
 * REF: docs/DATABASE_DESIGN.md §3.14 — webhook_logs schema
 * REF: docs/DATABASE_DESIGN.md §5.12 — webhook_logs indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const webhookLogSchema = new Schema(
  {
    razorpayPaymentId: {
      type:     String,
      required: true,
      unique:   true,   // DB-level idempotency guard
    },
    razorpayOrderId: { type: String, default: null },
    event: {
      type:     String,
      required: true,  // e.g. 'payment.captured', 'payment.failed'
    },
    status: {
      type:    String,
      enum:    ['queued', 'processing', 'processed', 'failed'],
      default: 'queued',
    },
    processedAt:  { type: Date, default: null },
    errorMessage: { type: String, default: null },
    rawPayload:   { type: Schema.Types.Mixed },  // Full Razorpay webhook body (for replay)
  },
  {
    timestamps: true,
    // updatedAt is enabled — status will change from queued → processed/failed
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.12) ─────────────
// razorpayPaymentId unique index already created by { unique: true } on field
webhookLogSchema.index({ status: 1, createdAt: -1 });
// TTL: auto-delete after 30 days (2592000 seconds)
webhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog;
