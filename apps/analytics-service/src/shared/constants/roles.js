'use strict';

/**
 * Role Constants
 * REF: docs/PRD.md §4 — User Personas
 * REF: docs/DATABASE_DESIGN.md §3.1 — users schema
 */

const ROLES = {
  SUPER_ADMIN:    'super_admin',
  TENANT_ADMIN:   'tenant_admin',
  TENANT_MEMBER:  'tenant_member',
  FINANCE_MEMBER: 'finance_member',
};

module.exports = { ROLES };
