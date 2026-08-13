'use strict';

/**
 * Authenticate Middleware — Full Implementation
 *
 * Validates JWT access tokens on every protected route.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT signature + expiry using JWT_ACCESS_SECRET
 *   3. Check JTI against Redis blacklist (invalidated on logout)
 *   4. Attach req.user = { id, tenantId, role, email, jti }
 *
 * REF: docs/SYSTEM_DESIGN.md §4 — Authentication & Token Architecture
 * REF: docs/SRS.md §12.1 — authenticate.middleware.js specification
 */

const redisClient           = require('../../config/redis');
const { verifyAccessToken } = require('../utils/jwtService');
const { AppError }          = require('../errors/AppError');
const { ERROR_CODES }       = require('../errors/errorCodes');

/**
 * @param {import('express').Request}      req
 * @param {import('express').Response}     res
 * @param {import('express').NextFunction} next
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        'Authentication token is required.',
        401,
        ERROR_CODES.AUTH_TOKEN_MISSING
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const decoded = verifyAccessToken(token); // Throws on invalid/expired

    // Check Redis blacklist — token invalidated on logout
    const blacklistKey  = `blacklist:at:${decoded.jti}`;
    const isBlacklisted = await redisClient.get(blacklistKey);

    if (isBlacklisted) {
      throw new AppError(
        'This session has been terminated. Please log in again.',
        401,
        ERROR_CODES.AUTH_TOKEN_BLACKLISTED
      );
    }

    // Attach clean user context to request — used by downstream middleware and controllers
    req.user = {
      id:       decoded.sub,
      tenantId: decoded.tenantId || null,
      role:     decoded.role,
      email:    decoded.email,
      jti:      decoded.jti,
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate };
