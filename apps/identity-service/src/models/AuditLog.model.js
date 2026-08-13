'use strict';

/**
 * AuditLog Model
 *
 * Immutable event trail for all significant state changes.
 * Every write to a financial document, every auth event, and every
 * subscription change must create an AuditLog entry at the service layer.
 *
 * IMPORTANT: This document is IMMUTABLE — updatedAt is disabled.
 * No business logic should ever update an existing AuditLog record.
 *
 * Retention: 7 years (enforced at infrastructure level — no TTL index here
 * as 7 years exceeds the MongoDB TTL index limit).
 *
 * REF: docs/DATABASE_DESIGN.md §3.12 — audit_logs schema
 * REF: docs/DATABASE_DESIGN.md §5.10 — audit_logs indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    // null for super_admin actions that aren't tenant-specific
    tenantId: {
      type:    Schema.Types.ObjectId,
      ref:     'Tenant',
      default: null,
    },
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      role:   { type: String, default: null },
      email:  { type: String, default: null },
    },
    // e.g. 'user.registered', 'user.login', 'subscription.upgraded', 'invoice.paid'
    event: {
      type:     String,
      required: [true, 'event is required'],
    },
    // 'user' | 'tenant' | 'subscription' | 'invoice' | 'payment' | 'plan'
    resourceType: {
      type:     String,
      required: [true, 'resourceType is required'],
    },
    resourceId: {
      type:     Schema.Types.ObjectId,
      required: [true, 'resourceId is required'],
    },
    // Document state before change (null for creation events)
    before: {
      type:    Schema.Types.Mixed,
      default: null,
    },
    // Document state after change (null for deletion events)
    after: {
      type:    Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type:    String,
      default: null,
    },
    userAgent: {
      type:    String,
      default: null,
    },
    requestId: {
      type:    String,
      default: null,
    },
  },
  {
    // Immutable — createdAt only, no updatedAt
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.10) ──────────────
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ event: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ 'actor.userId': 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
