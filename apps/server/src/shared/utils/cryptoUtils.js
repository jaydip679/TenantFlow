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

/**
 * Verify Razorpay payment signature (client checkout flow).
 * Signature = HMAC-SHA256(orderId + "|" + paymentId, RAZORPAY_KEY_SECRET)
 * @param {string} orderId   - razorpayOrderId
 * @param {string} paymentId - razorpayPaymentId
 * @param {string} signature - razorpaySignature from client
 * @returns {boolean}
 */
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const expected = hmacSha256(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET);
  return timingSafeEqual(expected, signature);
};

/**
 * Verify Razorpay webhook signature.
 * Signature = HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 * rawBody MUST be the exact Buffer/string before JSON.parse (use express.raw()).
 * @param {Buffer|string} rawBody
 * @param {string}        signature - X-Razorpay-Signature header
 * @returns {boolean}
 */
const verifyRazorpayWebhookSignature = (rawBody, signature) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqual(expected, signature);
};

/**
 * Hash a token using SHA-256 (semantic alias for sha256).
 * Used for refresh token storage (store hash, not raw token).
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => sha256(token);

module.exports = { sha256, hmacSha256, timingSafeEqual, verifyRazorpaySignature, verifyRazorpayWebhookSignature, hashToken };
