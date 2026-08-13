'use strict';

/**
 * IP Whitelist Middleware
 *
 * Restricts access to specific routes based on client IP.
 * Used on the Razorpay webhook endpoint to ensure only
 * Razorpay servers can POST to /api/v1/payments/webhook.
 *
 * In Docker/Nginx: X-Forwarded-For header is set by Nginx.
 * Trust proxy is enabled in app.js so Express reads this correctly.
 *
 * Razorpay IP ranges: https://razorpay.com/docs/webhooks/
 * (Update this list if Razorpay publishes new ranges)
 *
 * REF: docs/SYSTEM_DESIGN.md §9 — Razorpay Integration
 * REF: docker/nginx.conf — upstream IP whitelist (Layer 1)
 *
 * Note: Nginx handles the primary IP whitelist in production.
 * This middleware is the application-layer defence-in-depth fallback.
 */

const { AppError }    = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

// Razorpay IP CIDR ranges (application-layer fallback)
const RAZORPAY_IP_RANGES = [
  '34.93.228.',   // 34.93.228.0/24
  '34.93.40.',    // 34.93.40.0/24
  '35.200.12.',   // 35.200.12.0/24
  '15.207.47.',   // 15.207.47.0/24
];

/**
 * Check if the given IP falls within Razorpay's published ranges.
 * Simple prefix-match (production should use a proper CIDR library if needed).
 *
 * @param {string} ip
 * @returns {boolean}
 */
const isRazorpayIp = (ip) => {
  if (!ip) return false;
  // Strip IPv6 loopback wrapper ::ffff: prefix
  const cleanIp = ip.replace('::ffff:', '');
  // Allow localhost in development
  if (process.env.NODE_ENV === 'development' && (cleanIp === '127.0.0.1' || cleanIp === '::1')) {
    return true;
  }
  return RAZORPAY_IP_RANGES.some((range) => cleanIp.startsWith(range));
};

/**
 * Middleware: Allow only Razorpay IPs.
 * Apply to: POST /api/v1/payments/webhook
 */
const razorpayIpWhitelist = (req, res, next) => {
  const clientIp = req.ip || req.socket?.remoteAddress;

  if (!isRazorpayIp(clientIp)) {
    return next(
      new AppError(
        'Forbidden: IP not whitelisted.',
        403,
        ERROR_CODES.FORBIDDEN
      )
    );
  }

  next();
};

module.exports = { razorpayIpWhitelist };
