'use strict';

/**
 * Payment State Constants
 * REF: docs/PRD.md §F6 — Payment Processing
 * REF: docs/DATABASE_DESIGN.md §3.8 — payment_transactions schema
 */

const PAYMENT_STATES = {
  CREATED:             'created',
  ATTEMPTED:           'attempted',
  CAPTURED:            'captured',
  FAILED:              'failed',
  REFUNDED:            'refunded',
  PARTIALLY_REFUNDED:  'partially_refunded',
};

module.exports = { PAYMENT_STATES };
