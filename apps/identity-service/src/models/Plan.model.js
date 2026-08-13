'use strict';

/**
 * Plan Model
 *
 * Global plan catalog — NOT tenant-isolated.
 * All monetary values in paise (integer). No floats.
 *
 * Plan lifecycle:
 *   isActive=true, isPublic=true  → visible in public catalog, new subscriptions allowed
 *   isActive=true, isPublic=false → hidden (grandfathered plans), no new subscriptions
 *   isActive=false                → archived; no new subscriptions; existing unaffected
 *
 * REF: docs/DATABASE_DESIGN.md §3.3 — plans schema
 * REF: docs/DATABASE_DESIGN.md §5.3 — plans indexes
 * REF: docs/PRD.md §5.3 — Plan Catalog feature flags
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const planSchema = new Schema(
  {
    name: {
      type:     String,
      required: [true, 'Plan name is required'],
      trim:     true,
      unique:   true,
    },
    displayName: {
      type:     String,
      required: [true, 'Display name is required'],
    },
    description: {
      type:    String,
      default: '',
    },
    // CRITICAL: All monetary values in paise (integer). No floats.
    price: {
      type:     Number,
      required: [true, 'Price is required'],
      min:      [0, 'Price cannot be negative'],
    },
    currency: {
      type:    String,
      default: 'INR',
    },
    interval: {
      type:     String,
      enum:     ['monthly', 'annual'],
      required: [true, 'Billing interval is required'],
    },
    trialDays: {
      type:    Number,
      default: 14,
      min:     0,
    },
    features: {
      max_seats: {
        type:    Number,
        default: 5,
        min:     1,
      },
      api_calls_per_month: {
        type:    Number,
        default: 10000,
      },
      storage_gb: {
        type:    Number,
        default: 5,
      },
      advanced_analytics: {
        type:    Boolean,
        default: false,
      },
      ai_assistant: {
        type:    Boolean,
        default: false,
      },
      priority_support: {
        type:    Boolean,
        default: false,
      },
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    isPublic: {
      type:    Boolean,
      default: true,
    },
    sortOrder: {
      type:    Number,
      default: 0,
    },
    metadata: {
      type:    Map,
      of:      Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.3) ───────────────
planSchema.index({ isActive: 1, isPublic: 1, sortOrder: 1 });
// Note: name uniqueness enforced by `unique: true` on the field — no separate index needed

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
