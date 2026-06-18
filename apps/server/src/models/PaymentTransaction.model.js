'use strict';

/**
 * PaymentTransaction Model
 *
 * Records every Razorpay payment attempt against an invoice.
 * An invoice may have multiple PaymentTransactions (retries).
 *
 * CRITICAL:
 *   - razorpayPaymentId is null until payment is captured/failed (sparse index allows this).
 *   - razorpaySignature has select:false — NEVER returned in API responses.
 *   - All monetary amounts in integer paise.
 *
 * REF: docs/DATABASE_DESIGN.md §3.8 — payment_transactions schema
 * REF: docs/DATABASE_DESIGN.md §5.7 — payment_transactions indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentTransactionSchema = new Schema(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: true,
    },
    invoiceId: {
      type:     Schema.Types.ObjectId,
      ref:      'Invoice',
      required: true,
    },
    subscriptionId: {
      type:     Schema.Types.ObjectId,
      ref:      'Subscription',
      required: true,
    },
    razorpayOrderId: {
      type:     String,
      required: true,
    },
    razorpayPaymentId: {
      type:    String,
      default: null,
      sparse:  true,  // Allows multiple null values; unique when non-null
    },
    razorpaySignature: {
      type:   String,
      default: null,
      select: false,  // NEVER returned in API responses
    },
    amount:   { type: Number, required: true },  // paise
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'attempted', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
    },
    method: { type: String, default: null },  // 'card' | 'upi' | 'netbanking'

    errorCode:        { type: String, default: null },
    errorDescription: { type: String, default: null },

    refundId:     { type: String, default: null },
    refundAmount: { type: Number, default: 0 },   // paise
    refundReason: { type: String, default: null },
    refundedAt:   { type: Date, default: null },

    capturedAt: { type: Date, default: null },
    metadata:   { type: Map, of: Schema.Types.Mixed, default: {} },  // Raw Razorpay event data
  },
  { timestamps: true }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.7) ────────────────
paymentTransactionSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
paymentTransactionSchema.index({ razorpayOrderId: 1 });
paymentTransactionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });  // Payment history
paymentTransactionSchema.index({ invoiceId: 1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

module.exports = PaymentTransaction;
