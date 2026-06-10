'use strict';

/**
 * Rate Limiter Middleware
 *
 * Three independent tiers using express-rate-limit + rate-limit-redis.
 *
 * Tier 1 — Global:    100 requests / 15 minutes per IP (all routes)
 * Tier 2 — Auth:      10 requests / 15 minutes per IP (/api/v1/auth/*)
 * Tier 3 — OTP Resend: 1 request / 60 seconds per email (/api/v1/auth/resend-otp)
 *
 * REF: docs/SYSTEM_DESIGN.md §6.3 — Rate Limiting Configuration
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T1.7
 */

const rateLimit     = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient   = require('../../config/redis');
const { AppError }  = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

/**
 * Factory function for creating a Redis-backed rate limiter.
 * @param {Object} options
 * @param {number} options.windowMs   - Time window in milliseconds
 * @param {number} options.max        - Max requests per window
 * @param {string} options.prefix     - Redis key prefix for this limiter
 * @returns {Function} Express middleware
 */
const createRateLimiter = ({ windowMs, max, prefix }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // Return rate limit info in RateLimit-* headers
    legacyHeaders:   false,  // Disable X-RateLimit-* headers
    store: new RedisStore({
      // rate-limit-redis v4.x: use sendCommand
      sendCommand: (...args) => redisClient.call(...args),
      prefix,
    }),
    handler: (req, res, next) => {
      next(
        new AppError(
          `Too many requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`,
          429,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          {
            windowMs,
            retryAfter: Math.ceil(windowMs / 1000),
          }
        )
      );
    },
    skip: (req) => {
      // Super admins are exempt from rate limiting
      if (req.user?.role === 'super_admin') return true;
      return false;
    },
  });

/**
 * Tier 1: Global rate limit — applied to ALL routes in app.js
 * 100 requests per 15 minutes per IP address
 */
const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,
  prefix:   'rl:global:',
});

/**
 * Tier 2: Auth rate limit — applied to /api/v1/auth/* routes
 * 10 requests per 15 minutes per IP address
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      10,
  prefix:   'rl:auth:',
});

/**
 * Tier 3: OTP resend rate limit — applied to /api/v1/auth/resend-otp
 * 1 request per 60 seconds per email address
 * Key is based on email (from request body) rather than IP
 */
const otpResendLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max:      1,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => req.body?.email || req.ip,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rl:otp:',
  }),
  handler: (req, res, next) => {
    next(
      new AppError(
        'OTP resend rate limit exceeded. Please wait 60 seconds before requesting another OTP.',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        { retryAfter: 60 }
      )
    );
  },
});

module.exports = { globalRateLimiter, authRateLimiter, otpResendLimiter };
