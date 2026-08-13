'use strict';

/**
 * JWT Service
 *
 * Handles all JWT access token operations.
 * Refresh tokens are opaque UUID v4 strings — NOT JWTs.
 * Only access tokens are JWTs.
 *
 * Access token payload:
 *   { sub: userId, tenantId, role, email, jti }
 *   sub (subject) = MongoDB user _id as string
 *   jti (JWT ID)  = UUID v4 — used for blacklisting on logout
 *
 * REF: docs/SYSTEM_DESIGN.md §4 — Authentication & Token Architecture
 * REF: docs/SRS.md §2.1 — Token lifecycle specifications
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.2
 */

const jwt          = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { AppError }   = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

const ACCESS_TOKEN_SECRET  = process.env.JWT_ACCESS_SECRET;
const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes in seconds

/**
 * Sign a JWT access token.
 *
 * @param {{ userId: string, tenantId: string|null, role: string, email: string }} payload
 * @returns {string} Signed JWT access token
 */
const signAccessToken = (payload) => {
  const jti = uuidv4(); // Unique token ID for blacklisting

  return jwt.sign(
    {
      sub:      String(payload.userId),
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
      role:     payload.role,
      email:    payload.email,
      jti,
    },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn:  ACCESS_TOKEN_TTL_SEC,
      algorithm:  'HS256',
      issuer:     'tenantflow',
      audience:   'tenantflow-client',
    }
  );
};

/**
 * Generate an opaque refresh token.
 * Refresh tokens are UUID v4 strings — NOT JWTs.
 * The SHA-256 hash of this value is stored in the DB (see cryptoUtils.sha256).
 *
 * @returns {string} Raw UUID v4 refresh token (returned to client, never stored as-is)
 */
const signRefreshToken = () => uuidv4();

/**
 * Verify and decode a JWT access token.
 * Throws AppError for all failure modes.
 *
 * @param {string} token - Raw JWT string from Authorization header
 * @returns {{ sub: string, tenantId: string|null, role: string, email: string, jti: string }} Decoded payload
 * @throws {AppError} AUTH_TOKEN_EXPIRED if token expired
 * @throws {AppError} AUTH_TOKEN_INVALID if token malformed or signature invalid
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer:     'tenantflow',
      audience:   'tenantflow-client',
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(
        'Your session has expired. Please log in again.',
        401,
        ERROR_CODES.AUTH_TOKEN_EXPIRED
      );
    }
    throw new AppError(
      'Invalid authentication token.',
      401,
      ERROR_CODES.AUTH_TOKEN_INVALID
    );
  }
};

/**
 * Decode a JWT without verifying — used to extract JTI from an expired token
 * during logout flow (we still need to blacklist it).
 *
 * @param {string} token
 * @returns {Object|null} Decoded payload or null
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, decodeToken, ACCESS_TOKEN_TTL_SEC };
