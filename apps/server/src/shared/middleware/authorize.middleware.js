'use strict';

/**
 * Authorize Middleware — STUB for Phase 0
 *
 * Full implementation in Phase 1 (T1.7).
 *
 * Phase 1 implementation will:
 *   1. Verify req.user is set (authenticate must run first)
 *   2. Check req.user.role against the allowed roles array
 *   3. Super admin bypasses all role checks
 *   4. Call next() or throw 403 AppError
 *
 * REF: docs/SRS.md §12 — Middleware Specifications
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.7
 */

/**
 * Middleware factory: Check user role against allowed roles.
 * @param {...string} roles - Allowed role strings (from roles.js constants)
 * @returns {Function} Express middleware
 */
const authorize = (...roles) => (req, res, next) => {
  // Phase 0 stub — will be fully implemented in Phase 1
  next();
};

module.exports = { authorize };
