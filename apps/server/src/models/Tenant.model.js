'use strict';

/**
 * Tenant Model
 *
 * Represents a B2B customer organization subscribing to TenantFlow.
 * Root document in the tenant hierarchy — all other tenant-scoped
 * documents reference this document's _id as tenantId.
 *
 * Soft delete only — financial audit requirements prohibit hard deletion.
 *
 * REF: docs/DATABASE_DESIGN.md §3.2 — tenants schema
 * REF: docs/DATABASE_DESIGN.md §5.2 — tenants indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const billingAddressSchema = new Schema(
  {
    line1:      { type: String, default: null },
    line2:      { type: String, default: null },
    city:       { type: String, default: null },
    state:      { type: String, default: null },
    country:    { type: String, default: 'IN' },
    postalCode: { type: String, default: null },
  },
  { _id: false }
);

const tenantSchema = new Schema(
  {
    name: {
      type:     String,
      required: [true, 'Tenant name is required'],
      trim:     true,
      maxlength: [100, 'Tenant name must not exceed 100 characters'],
    },
    slug: {
      type:      String,
      required:  [true, 'Tenant slug is required'],
      lowercase: true,
      trim:      true,
      // unique index defined below via tenantSchema.index({ slug: 1 }, { unique: true })
    },
    logoUrl: {
      type:    String,
      default: null,
    },
    billingEmail: {
      type:      String,
      required:  [true, 'Billing email is required'],
      lowercase: true,
      trim:      true,
    },
    billingAddress: {
      type:    billingAddressSchema,
      default: () => ({}),
    },
    taxId: {
      type:    String,
      default: null,  // GSTIN or VAT ID
    },
    timezone: {
      type:    String,
      default: 'Asia/Kolkata',
    },
    currency: {
      type:    String,
      default: 'INR',
    },
    status: {
      type:    String,
      enum:    ['trialing', 'active', 'past_due', 'suspended', 'cancelled'],
      default: 'trialing',
    },
    trialEndsAt: {
      type:    Date,
      default: null,
    },
    // Razorpay customer and subscription references
    razorpayCustomerId: {
      type:    String,
      default: null,
    },
    razorpaySubscriptionId: {
      type:    String,
      default: null,
    },
    currentPlanId: {
      type:    Schema.Types.ObjectId,
      ref:     'Plan',
      default: null,
    },
    currentSubscriptionId: {
      type:    Schema.Types.ObjectId,
      ref:     'Subscription',
      default: null,
    },
    ownerId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Tenant owner is required'],
    },
    // Cached feature flags from current plan for fast access
    features: {
      type:    Map,
      of:      Schema.Types.Mixed,
      default: {},
    },
    deletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.2) ──────────────
tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ status: 1, createdAt: -1 });     // Admin tenant list
tenantSchema.index({ ownerId: 1 });
tenantSchema.index({ razorpayCustomerId: 1 }, { sparse: true });

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;
