'use strict';

/**
 * Crypto Utilities
 *
 * Pure cryptographic helper functions using Node.js built-in `crypto` module.
 * No external packages needed.
 *
 * REF: docs/SRS.md §2.1 — Refresh token stored as SHA-256(raw_token)
 * REF: docs/SRS.md §2.1 — JWT blacklist uses JTI
 */

const crypto = require('crypto');

/**
 * Compute a SHA-256 hex digest of the given input.
 * Used for:
 *   - Hashing refresh tokens before storing in DB
 *   - Verifying Razorpay HMAC signatures (via createHmac)
 *
 * @param {string} data - The raw string to hash
 * @returns {string} Lowercase hex SHA-256 digest
 */
const sha256 = (data) =>
  crypto.createHash('sha256').update(data).digest('hex');

/**
 * Compute an HMAC-SHA256 hex digest.
 * Used for Razorpay payment signature verification.
 *
 * @param {string} data   - The data to sign (e.g. "orderId|paymentId")
 * @param {string} secret - The signing secret
 * @returns {string} Lowercase hex HMAC-SHA256 digest
 */
const hmacSha256 = (data, secret) =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');

/**
 * Constant-time string comparison to prevent timing attacks.
 * Used when comparing HMAC signatures.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

module.exports = { sha256, hmacSha256, timingSafeEqual };
