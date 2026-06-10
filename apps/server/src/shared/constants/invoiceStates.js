'use strict';

/**
 * Invoice State Constants
 * REF: docs/PRD.md §F5 — Billing & Invoicing
 * REF: docs/DATABASE_DESIGN.md §3.7 — invoices schema
 */

const INVOICE_STATES = {
  DRAFT:          'draft',
  OPEN:           'open',
  PAID:           'paid',
  VOID:           'void',
  UNCOLLECTIBLE:  'uncollectible',
};

module.exports = { INVOICE_STATES };
