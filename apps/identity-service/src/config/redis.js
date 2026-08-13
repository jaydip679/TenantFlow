'use strict';

const Redis = require('ioredis');
const logger = require('../shared/utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const isTLS = redisUrl && redisUrl.startsWith('rediss://');

const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: isTLS ? { rejectUnauthorized: false } : undefined,
});

redisClient.on('connect', () => logger.info(`Redis connected to ${redisUrl}`));
redisClient.on('error', (err) => logger.error({ err: err.message }, 'Redis connection error'));

module.exports = redisClient;
