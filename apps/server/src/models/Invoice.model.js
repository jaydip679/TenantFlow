'use strict';

/**
 * Invoice Model
 *
 * Tracks billing invoices generated for tenant subscriptions.
 * Invoices are NEVER hard-deleted (7-year regulatory requirement).
 * Only 'open' invoices can be voided.
 *
 * CRITICAL: All monetary values (subtotal, taxAmount, total, amountPaid, amountDue)
 * are stored in integer paise. No floats.
 *
 * lineItems — embedded sub-schema per DATABASE_DESIGN §3.7.
 * invoiceNumber — globally unique, sequential: INV-2024-00001 format.
 *
 * REF: docs/DATABASE_DESIGN.md §3.7 — invoices schema
 * REF: docs/DATABASE_DESIGN.md §5.6 — invoices indexes
 * REF: docs/DATABASE_DESIGN.md §9   — Data Retention Policy (7 years)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Line Item Sub-schema ───────────────────────────────────────
const lineItemSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity:    { type: Number, required: true, min: 1 },
    unitPrice:   { type: Number, required: true },  // paise; negative for credits
    amount:      { type: Number, required: true },  // paise; quantity * unitPrice
    type: {
      type: String,
      enum: ['plan', 'seat', 'proration_credit', 'proration_charge', 'credit', 'addon'],
      required: true,
    },
  },
  { _id: true }
);

// ── Invoice Schema ─────────────────────────────────────────────
const invoiceSchema = new Schema(
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
    invoiceNumber: {
      type:     String,
      required: [true, 'invoiceNumber is required'],
      unique:   true,
      trim:     true,
    },
    status: {
      type: String,
      enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
      default: 'draft',
    },
    periodStart: { type: Date, required: true },
    periodEnd:   { type: Date, required: true },
    dueDate:     { type: Date, required: true },
    lineItems:   [lineItemSchema],
    // All monetary fields are integer paise
    subtotal:   { type: Number, required: true },  // Sum of lineItems.amount (before tax)
    taxRate:    { type: Number, default: 18 },       // Percentage (18 for 18% GST)
    taxAmount:  { type: Number, required: true },   // Math.round(subtotal * taxRate / 100)
    total:      { type: Number, required: true },   // subtotal + taxAmount
    amountPaid: { type: Number, default: 0 },       // Updated on payment captured
    amountDue:  { type: Number, required: true },   // total - amountPaid
    currency:   { type: String, default: 'INR' },
    // PDF is generated asynchronously — null until pdf.worker completes
    pdfUrl:     { type: String, default: null },
    paidAt:     { type: Date, default: null },
    voidedAt:   { type: Date, default: null },
    voidReason: { type: String, default: null },
    metadata:   { type: Map, of: Schema.Types.Mixed, default: {} },
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
invoiceSchema.pre('save', function (next) {
  if (this.isModified()) {
    this.aggregateVersion = (this.aggregateVersion || 0) + 1;
  }
  next();
});

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.6) ────────────────
// Note: invoiceNumber unique index is implicitly created by { unique: true } on the field.
// Explicit compound/supporting indexes only:
invoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });         // Tenant invoice list
invoiceSchema.index({ tenantId: 1, periodStart: 1 });                   // Duplicate check
invoiceSchema.index({ status: 1, dueDate: 1 });                         // Past-due sweep
invoiceSchema.index({ subscriptionId: 1, periodStart: 1 });


const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;
