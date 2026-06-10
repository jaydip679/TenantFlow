'use strict';

/**
 * Authenticate Middleware — STUB for Phase 0
 *
 * Full implementation in Phase 1 (T1.7).
 * This stub allows the app to boot without Phase 1 being complete.
 *
 * Phase 1 implementation will:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT signature using JWT_ACCESS_SECRET
 *   3. Check JTI against Redis blacklist (invalidated tokens)
 *   4. Attach req.user = { id, tenantId, role, email, jti }
 *   5. Call next() or throw AppError
 *
 * REF: docs/SYSTEM_DESIGN.md §4 — Authentication & Token Architecture
 * REF: docs/SRS.md §12.1 — authenticate.middleware.js specification
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.7
 */

const { AppError }    = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

/**
 * Middleware: Validate JWT access token and attach req.user.
 * @param {import('express').Request}    req
 * @param {import('express').Response}   res
 * @param {import('express').NextFunction} next
 */
const authenticate = (req, res, next) => {
  // Phase 0 stub — will be fully implemented in Phase 1
  next(
    new AppError(
      'Authentication not yet implemented. Phase 1 pending.',
      501,
      ERROR_CODES.INTERNAL_ERROR
    )
  );
};

module.exports = { authenticate };
