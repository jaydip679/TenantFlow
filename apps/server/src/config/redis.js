'use strict';

/**
 * Redis Client (ioredis)
 *
 * Single shared ioredis instance for:
 *   - OTP storage
 *   - JWT blacklist
 *   - Refresh token family tracking
 *   - Tenant context cache
 *   - Rate limiting
 *   - Distributed locks (invoice generation, dunning)
 *   - AI churn score cache
 *   - Invoice number sequence
 *
 * IMPORTANT: Do NOT create additional Redis connections.
 *            BullMQ uses its own connection (see config/bullmq.js).
 *
 * REF: docs/SYSTEM_DESIGN.md §6 — Redis Architecture
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.5
 */

const Redis  = require('ioredis');
const logger = require('../shared/utils/logger');

const REDIS_URL = process.env.REDIS_URL;

/**
 * Exponential backoff retry strategy for ioredis.
 * Retries up to 10 times with increasing delay.
 * Returns -1 to stop retrying after 10 attempts.
 *
 * @param {number} times - Number of retries attempted so far
 * @returns {number|null} Milliseconds to wait before next retry, or null to stop
 */
const retryStrategy = (times) => {
  if (times > 10) {
    logger.error('Redis: Max reconnection attempts reached. Giving up.');
    return null; // Stop retrying
  }
  const delay = Math.min(times * 200, 5000); // Cap at 5 seconds
  logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${times})`);
  return delay;
};

const redisClient = new Redis(REDIS_URL, {
  retryStrategy,
  maxRetriesPerRequest: null, // Required for BullMQ compat if ever shared — null disables per-request limit
  enableReadyCheck:     true,
  lazyConnect:          false,
});

redisClient.on('ready', () => {
  logger.info('Redis connected and ready');
});

redisClient.on('error', (err) => {
  // Log error but do not crash — Redis may be temporarily unavailable.
  // The retry strategy handles reconnection.
  logger.error({ err: err.message }, 'Redis client error');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis reconnecting...');
});

redisClient.on('close', () => {
  logger.warn('Redis connection closed');
});

module.exports = redisClient;
