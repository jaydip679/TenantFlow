'use strict';

/**
 * BullMQ Connection Configuration
 *
 * BullMQ requires its OWN ioredis connection instance — it must NOT
 * reuse the shared redisClient from config/redis.js. BullMQ manages
 * its own connection lifecycle internally.
 *
 * The connection is derived from REDIS_URL which may be:
 *   redis://localhost:6379
 *   redis://user:password@host:port
 *
 * REF: docs/SYSTEM_DESIGN.md §7 — BullMQ Queue Architecture
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T1.4
 */

const { URL } = require('url');

/**
 * Parse REDIS_URL into a BullMQ-compatible connection config object.
 * BullMQ accepts { host, port, password } rather than a connection string.
 */
const parseRedisUrl = (redisUrl) => {
  const parsed = new URL(redisUrl);
  return {
    host:     parsed.hostname || 'localhost',
    port:     parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    db:       parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck:     false, // Required by BullMQ
  };
};

const bullmqConnection = parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379');

module.exports = { bullmqConnection };
