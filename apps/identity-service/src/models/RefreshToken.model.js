'use strict';

/**
 * RefreshToken Model
 *
 * Stores SHA-256 hashes of refresh tokens — the raw token is never persisted.
 * Supports the refresh token rotation + family-based reuse detection pattern.
 *
 * TTL: documents auto-deleted 7 days after `expiresAt` via TTL index.
 * Soft-invalidation: status='invalidated' used for reuse detection (token still
 * exists in DB so we can detect the reuse attempt and invalidate the whole family).
 *
 * REF: docs/DATABASE_DESIGN.md §3.13 — refresh_tokens schema
 * REF: docs/DATABASE_DESIGN.md §5.11 — refresh_tokens indexes
 * REF: docs/SRS.md §2.1 — POST /auth/refresh business logic
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'userId is required'],
    },
    // SHA-256 hash of the raw UUID token — never store raw tokens
    tokenHash: {
      type:     String,
      required: [true, 'tokenHash is required'],
    },
    // UUID shared across all tokens in the same rotation chain.
    // When reuse is detected, ALL tokens with this familyId are invalidated.
    familyId: {
      type:     String,
      required: [true, 'familyId is required'],
    },
    status: {
      type:    String,
      enum:    ['active', 'invalidated'],
      default: 'active',
    },
    expiresAt: {
      type:     Date,
      required: [true, 'expiresAt is required'],
    },
    userAgent: {
      type:    String,
      default: null,
    },
    ip: {
      type:    String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.11) ──────────────
refreshTokenSchema.index({ tokenHash: 1 });
refreshTokenSchema.index({ userId: 1, status: 1 });
refreshTokenSchema.index({ familyId: 1 });
// Auto-delete 7 days after token expiry (post-expiry retention for reuse detection)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
