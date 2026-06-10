'use strict';

/**
 * Subscription State Constants
 * REF: docs/PRD.md §F4 — Subscription Lifecycle
 * REF: docs/DATABASE_DESIGN.md §3.5 — subscriptions schema
 * REF: docs/SRS.md §5 — Subscription State Machine
 */

const SUBSCRIPTION_STATES = {
  TRIALING:          'trialing',
  ACTIVE:            'active',
  PAST_DUE:          'past_due',
  CANCELLED:         'cancelled',
  PAUSED:            'paused',
  SUSPENDED:         'suspended',
  PENDING_DOWNGRADE: 'pending_downgrade',
};

module.exports = { SUBSCRIPTION_STATES };
