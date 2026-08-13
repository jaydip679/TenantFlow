'use strict';

/**
 * PlanVersion Model
 *
 * Immutable snapshot of a plan's state at a point in time.
 * Created whenever a Plan is updated OR when a new Subscription is created.
 * Subscriptions reference planVersionId (snapshot), NOT the live Plan.
 *
 * This ensures existing subscribers are never affected by plan price/feature changes.
 *
 * IMPORTANT: updatedAt is DISABLED — this document is immutable.
 * Never update a PlanVersion document.
 *
 * REF: docs/DATABASE_DESIGN.md §3.4 — plan_versions schema
 * REF: docs/SRS.md §4 — Plans Module (updatePlan business logic)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const planVersionSchema = new Schema(
  {
    planId: {
      type:     Schema.Types.ObjectId,
      ref:      'Plan',
      required: [true, 'planId is required'],
    },
    // Monotonically incrementing version number. Service layer reads current max and adds 1.
    version: {
      type:     Number,
      required: [true, 'version number is required'],
    },
    // Snapshot of plan fields at version time
    name:        { type: String },
    displayName: { type: String },
    price:       { type: Number }, // in paise — immutable snapshot
    currency:    { type: String },
    interval:    { type: String },
    features:    { type: Map, of: Schema.Types.Mixed },
    snapshotAt:  { type: Date, default: Date.now },
  },
  {
    // createdAt only — updatedAt disabled (immutable document)
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Ensure unique version per plan
planVersionSchema.index({ planId: 1, version: -1 });

const PlanVersion = mongoose.model('PlanVersion', planVersionSchema);

module.exports = PlanVersion;
