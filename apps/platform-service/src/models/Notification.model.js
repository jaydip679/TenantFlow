'use strict';

/**
 * Notification Model
 *
 * Persisted in-app notifications displayed in the notification bell.
 * TTL: Auto-deleted after 90 days (expireAfterSeconds on createdAt).
 *
 * Delivery flow:
 *   1. notification.worker.js creates a Notification document
 *   2. Worker emits Socket.IO 'notification:new' to the user's room
 *   3. On reconnect, frontend fetches unread notifications from REST API
 *
 * REF: docs/DATABASE_DESIGN.md §3.10 — notifications schema
 * REF: docs/DATABASE_DESIGN.md §5.9 — notifications indexes
 * REF: docs/SRS.md §9 — Notifications Module
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    tenantId: {
      type:    Schema.Types.ObjectId,
      ref:     'Tenant',
      default: null,
    },
    type: {
      type: String,
      enum: [
        'welcome',
        'invoice_generated',
        'payment_success',
        'payment_failed',
        'dunning_step',
        'subscription_changed',
        'trial_ending',
        'seat_limit_warning',
        'member_invited',
        'member_joined',
        'plan_changed',
        'account_suspended',
      ],
      required: true,
    },
    title:     { type: String, required: true },
    body:      { type: String, required: true },
    isRead:    { type: Boolean, default: false },
    readAt:    { type: Date, default: null },
    actionUrl: { type: String, default: null },  // Deep link to relevant page
    metadata:  { type: Map, of: Schema.Types.Mixed, default: {} },
    // TTL: auto-deleted after 90 days (see index below)
  },
  { timestamps: true }
);

// ── Indexes (REF: docs/DATABASE_DESIGN.md §5.9) ────────────────
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });  // Notification bell query
notificationSchema.index({ tenantId: 1, createdAt: -1 });
// TTL: auto-delete after 90 days (7776000 seconds)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
