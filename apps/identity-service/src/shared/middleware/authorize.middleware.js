'use strict';

/**
 * Authorize Middleware — Full Implementation
 *
 * Role-Based Access Control (RBAC) for protected routes.
 * Must always run AFTER authenticate (req.user must be set).
 *
 * Super admin bypasses ALL role checks — always allowed.
 *
 * Usage:
 *   router.get('/', authenticate, authorize('tenant_admin', 'finance_member'), controller.list);
 *
 * REF: docs/SRS.md §12 — Middleware Specifications
 * REF: docs/MASTER_AGENT_PROMPT.md §1.3 — Stakeholder Roles
 */

const { ROLES }       = require('../constants/roles');
const { AppError }    = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

/**
 * Middleware factory — checks req.user.role against allowed roles.
 *
 * @param {...string} roles - Allowed role strings
 * @returns {import('express').RequestHandler}
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError(
        'You must be authenticated to access this resource.',
        401,
        ERROR_CODES.AUTH_TOKEN_MISSING
      )
    );
  }

  // Super admin bypasses all role restrictions
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return next();
  }

  if (!roles.includes(req.user.role)) {
    return next(
      new AppError(
        'You do not have permission to perform this action.',
        403,
        ERROR_CODES.FORBIDDEN
      )
    );
  }

  next();
};

module.exports = { authorize };
