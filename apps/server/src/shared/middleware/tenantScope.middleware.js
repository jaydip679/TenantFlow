'use strict';

/**
 * Tenant Scope Middleware — STUB for Phase 0
 *
 * Full implementation in Phase 2 (T2.3).
 *
 * Phase 2 implementation will:
 *   1. Skip for super_admin (bypass)
 *   2. Validate URL :tenantId param matches req.user.tenantId (JWT)
 *   3. Check Redis cache: tenant:ctx:{tenantId} (TTL 300s)
 *   4. On cache miss: parallel DB queries for Tenant + Subscription + user count
 *   5. Check suspended tenant status (block unless allowSuspended option set)
 *   6. Attach req.tenantContext = { tenantId, planId, subscriptionStatus, seatLimit, usedSeats, features }
 *   7. Cache the context in Redis
 *
 * REF: docs/SYSTEM_DESIGN.md §5 — Tenant Isolation Strategy
 * REF: docs/SRS.md §12.2 — tenantScope.middleware.js specification
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.3
 */

/**
 * Middleware factory: Validate tenant scope and attach tenant context.
 * @param {Object} [options]
 * @param {boolean} [options.allowSuspended=false] - Allow suspended tenants (for payment routes)
 * @returns {Function} Express middleware
 */
const tenantScope = (options = {}) => (req, res, next) => {
  // Phase 0 stub — will be fully implemented in Phase 2
  next();
};

module.exports = { tenantScope };
