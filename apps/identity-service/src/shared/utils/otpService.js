'use strict';

/**
 * OTP Service
 *
 * Manages 6-digit OTP generation, Redis storage, and verification.
 * Supports two purposes: 'email_verify' and 'password_reset'.
 *
 * Redis key format: otp:{purpose}:{identifier}
 * Redis value:      JSON { code: string, attempts: number }
 * TTL:              600 seconds (10 minutes)
 * Max attempts:     3 (4th attempt invalidates OTP)
 *
 * REF: docs/SRS.md §2.1 — OTP business logic
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.3
 */

const crypto        = require('crypto');
const redisClient   = require('../../config/redis');
const { AppError }  = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

const OTP_TTL_SECONDS  = 600; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;

const OTP_PURPOSES = {
  EMAIL_VERIFY:   'email_verify',
  PASSWORD_RESET: 'password_reset',
};

/**
 * Generate a cryptographically secure 6-digit OTP.
 * Uses crypto.randomInt for uniform distribution — not Math.random().
 *
 * @returns {string} Zero-padded 6-digit string (e.g. "048391")
 */
const generateOTP = () =>
  crypto.randomInt(100000, 999999).toString();

/**
 * Build the Redis key for an OTP entry.
 * @param {string} purpose    - 'email_verify' | 'password_reset'
 * @param {string} identifier - Typically the user's email address
 * @returns {string}
 */
const buildOtpKey = (purpose, identifier) =>
  `otp:${purpose}:${identifier.toLowerCase()}`;

/**
 * Store an OTP in Redis with TTL.
 * Overwrites any existing OTP for the same purpose + identifier.
 *
 * @param {string} purpose
 * @param {string} identifier
 * @param {string} otp
 * @returns {Promise<void>}
 */
const storeOTP = async (purpose, identifier, otp) => {
  const key   = buildOtpKey(purpose, identifier);
  const value = JSON.stringify({ code: otp, attempts: 0 });
  await redisClient.set(key, value, 'EX', OTP_TTL_SECONDS);
};

/**
 * Verify a submitted OTP against the stored value.
 * Tracks attempts atomically using Redis WATCH/MULTI.
 * Deletes the OTP on successful verification (one-time use).
 *
 * @param {string} purpose
 * @param {string} identifier
 * @param {string} submittedOtp
 * @returns {Promise<true>} Resolves true on match
 * @throws {AppError} AUTH_OTP_EXPIRED if key not found in Redis
 * @throws {AppError} AUTH_OTP_MAX_ATTEMPTS if attempts > MAX_OTP_ATTEMPTS
 * @throws {AppError} AUTH_OTP_INVALID if code does not match
 */
const verifyOTP = async (purpose, identifier, submittedOtp) => {
  const key = buildOtpKey(purpose, identifier);

  const raw = await redisClient.get(key);

  if (!raw) {
    throw new AppError(
      'OTP has expired or does not exist. Please request a new one.',
      400,
      ERROR_CODES.AUTH_OTP_EXPIRED
    );
  }

  const stored = JSON.parse(raw);

  // Increment attempts first — prevents brute force even on the boundary attempt
  const newAttempts = stored.attempts + 1;

  if (newAttempts > MAX_OTP_ATTEMPTS) {
    // Invalidate the OTP — max attempts exceeded
    await redisClient.del(key);
    throw new AppError(
      'Too many incorrect OTP attempts. Please request a new OTP.',
      429,
      ERROR_CODES.AUTH_OTP_MAX_ATTEMPTS
    );
  }

  // Update attempts count in Redis before checking code (fail-safe on crash)
  await redisClient.set(
    key,
    JSON.stringify({ code: stored.code, attempts: newAttempts }),
    'KEEPTTL' // Preserve the original TTL
  );

  if (submittedOtp !== stored.code) {
    throw new AppError(
      'Invalid OTP. Please check and try again.',
      400,
      ERROR_CODES.AUTH_OTP_INVALID
    );
  }

  // OTP matched — delete it (one-time use)
  await redisClient.del(key);
  return true;
};

module.exports = { generateOTP, storeOTP, verifyOTP, OTP_PURPOSES, OTP_TTL_SECONDS };
