'use strict';

/**
 * User Model
 *
 * Represents all platform users: super_admin, tenant_admin,
 * finance_member, and tenant_member.
 *
 * Security notes:
 *   - `passwordHash` is excluded from all queries by default (select: false)
 *   - `inviteToken` is excluded from all queries by default (select: false)
 *
 * Soft delete: users are never hard-deleted. Set status='deleted', deletedAt=now.
 *
 * REF: docs/DATABASE_DESIGN.md §3.1 — users schema
 * REF: docs/DATABASE_DESIGN.md §5.1 — users indexes
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    tenantId: {
      type:    Schema.Types.ObjectId,
      ref:     'Tenant',
      default: null,  // null for super_admin — index defined below via schema.index()
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      lowercase: true,
      trim:      true,
      maxlength: [255, 'Email must not exceed 255 characters'],
      // unique index defined below via userSchema.index({ email: 1 }, { unique: true })
    },
    passwordHash: {
      type:     String,
      required: [true, 'Password hash is required'],
      select:   false,  // Never returned in queries by default
    },
    firstName: {
      type:      String,
      required:  [true, 'First name is required'],
      trim:      true,
      minlength: [2, 'First name must be at least 2 characters'],
      maxlength: [50, 'First name must not exceed 50 characters'],
    },
    lastName: {
      type:      String,
      required:  [true, 'Last name is required'],
      trim:      true,
      minlength: [2, 'Last name must be at least 2 characters'],
      maxlength: [50, 'Last name must not exceed 50 characters'],
    },
    role: {
      type:     String,
      enum:     ['super_admin', 'tenant_admin', 'tenant_member', 'finance_member'],
      required: [true, 'Role is required'],
    },
    avatarUrl: {
      type:    String,
      default: null,
    },
    isEmailVerified: {
      type:    Boolean,
      default: false,
    },
    isMobileVerified: {
      type:    Boolean,
      default: false,
    },
    mobile: {
      type:    String,
      default: null,
    },
    status: {
      type:    String,
      enum:    ['active', 'invited', 'suspended', 'deleted'],
      default: 'invited',
    },
    lastLoginAt: {
      type:    Date,
      default: null,
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
    invitedBy: {
      type:    Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    inviteToken: {
      type:    String,
      default: null,
      select:  false,  // Never returned in queries by default
    },
    inviteExpiresAt: {
      type:    Date,
      default: null,
    },
    deletedAt: {
      type:    Date,
      default: null,
    },
    // Event ordering protection for Analytics projections
    aggregateVersion: {
      type:    Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Virtual Fields ────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.1) ──────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, status: 1 });
userSchema.index({ tenantId: 1, role: 1 });
userSchema.index({ inviteToken: 1 }, { sparse: true }); // sparse: only index non-null values
userSchema.index({ tenantId: 1, createdAt: -1 });       // Member list, paginated by date

// ── Pre-Save Hook — Tenant Isolation (Layer 3) ────────────────
// REF: docs/MASTER_AGENT_PROMPT.md §2.3 — Four-Layer Tenant Isolation
userSchema.pre('save', function (next) {
  if (this.isModified()) {
    this.aggregateVersion = (this.aggregateVersion || 0) + 1;
  }
  
  // Super admin legitimately has tenantId: null — skip assertion
  if (this.role === 'super_admin') return next();

  if (!this.tenantId) {
    return next(new Error('User.tenantId is required for non-super_admin users'));
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
