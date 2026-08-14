'use strict';

/**
 * TenantHealthScore Model
 *
 * Stores the computed customer health score per tenant.
 * One document per tenant — upserted on each compute run.
 *
 * Health Score is distinct from TenantChurnScore:
 *   - ChurnScore: AI prediction (will the tenant churn?)
 *   - HealthScore: Operational snapshot (is the tenant healthy RIGHT NOW?)
 *
 * Components:
 *   paymentHealth      (30%) — On-time invoice payment rate over last 6 months
 *   seatUtilization    (20%) — Seat fill rate (sweet spot: 60–90%)
 *   planLongevity      (20%) — How long the tenant has been subscribed
 *   invoicePaymentSpeed(20%) — Average days to pay after invoice issuance
 *   dunningRisk        (10%) — No active dunning = 100, active dunning = 0
 *
 * Grade thresholds:
 *   80–100 = A (Excellent)
 *   65–79  = B (Good)
 *   50–64  = C (Fair)
 *   35–49  = D (At Risk)
 *   0–34   = F (Critical)
 *
 * REF: docs/DATABASE_DESIGN.md — TenantHealthScore schema
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const componentSchema = new Schema(
  {
    score:  { type: Number, required: true, min: 0, max: 100 },
    weight: { type: Number, required: true },  // decimal 0–1
    signal: { type: String },                   // human-readable explanation
  },
  { _id: false }
);

const healthScoreSchema = new Schema(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: true,
      unique:   true,
    },
    score: {
      type:     Number,
      required: true,
      min:      0,
      max:      100,
    },
    grade: {
      type:     String,
      enum:     ['A', 'B', 'C', 'D', 'F'],
      required: true,
    },
    components: {
      paymentHealth:       { type: componentSchema },
      seatUtilization:     { type: componentSchema },
      planLongevity:       { type: componentSchema },
      invoicePaymentSpeed: { type: componentSchema },
      dunningRisk:         { type: componentSchema },
    },
    computedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Sorted by worst health first for admin alert views
healthScoreSchema.index({ score: 1 });
// Note: tenantId unique index is declared via `unique: true` on the field — no schema.index() needed.

const TenantHealthScore = mongoose.model('TenantHealthScore', healthScoreSchema);

module.exports = TenantHealthScore;
