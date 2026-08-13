'use strict';

/**
 * Notification Type Constants
 * REF: docs/PRD.md §F9 — Notification System
 * REF: docs/DATABASE_DESIGN.md §3.10 — notifications schema
 */

const NOTIFICATION_TYPES = {
  WELCOME:               'welcome',
  INVOICE_GENERATED:     'invoice_generated',
  PAYMENT_SUCCESS:       'payment_success',
  PAYMENT_FAILED:        'payment_failed',
  DUNNING_STEP:          'dunning_step',
  SUBSCRIPTION_CHANGED:  'subscription_changed',
  TRIAL_ENDING:          'trial_ending',
  SEAT_LIMIT_WARNING:    'seat_limit_warning',
  MEMBER_INVITED:        'member_invited',
  MEMBER_JOINED:         'member_joined',
  PLAN_CHANGED:          'plan_changed',
  ACCOUNT_SUSPENDED:     'account_suspended',
};

// Notifications that cannot be disabled by user preference
const MANDATORY_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPES.PAYMENT_FAILED,
  NOTIFICATION_TYPES.DUNNING_STEP,
  NOTIFICATION_TYPES.ACCOUNT_SUSPENDED,
];

module.exports = { NOTIFICATION_TYPES, MANDATORY_NOTIFICATION_TYPES };
