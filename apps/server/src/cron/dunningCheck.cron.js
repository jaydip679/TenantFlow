'use strict';

/**
 * Dunning Check Cron
 *
 * Schedule: 0 8 * * * (runs at 08:00 UTC every day)
 *
 * Responsibilities:
 *   1. Acquire Redis cron lock (prevents double-fire on restart)
 *   2. Find all DunningRecords where:
 *      - status = 'active'
 *      - nextRetryAt <= now
 *   3. Enqueue a dunning-queue job for each
 *
 * REF: docs/SRS.md §13.3 — dunningCheck.cron.js
 * REF: docs/IMPLEMENTATION_ROADMAP.md §9.1 T6.5
 */

const cron        = require('node-cron');
const DunningRecord       = require('../models/DunningRecord.model');
const { enqueueDunningStep } = require('../queues/dunning.queue');
const redisClient  = require('../config/redis');
const logger       = require('../shared/utils/logger');

const CRON_LOCK_KEY = 'cron:dunning-check';
const CRON_LOCK_TTL = 3600;  // 1 hour — prevents double-fire

const runDunningCheck = async () => {
  const now = new Date();
  logger.info('dunningCheck cron started');

  // Acquire cron-level lock
  const locked = await redisClient.set(CRON_LOCK_KEY, '1', 'NX', 'EX', CRON_LOCK_TTL);
  if (!locked) {
    logger.warn('dunningCheck cron lock held — skipping this run');
    return;
  }

  try {
    const dueRecords = await DunningRecord.find({
      status:      'active',
      nextRetryAt: { $lte: now },
    }).lean();

    logger.info({ count: dueRecords.length }, 'Found due DunningRecords');

    for (const record of dueRecords) {
      try {
        await enqueueDunningStep(record._id.toString());
        logger.info({ dunningId: record._id, tenantId: record.tenantId }, 'Dunning step enqueued');
      } catch (err) {
        logger.error({ err: err.message, dunningId: record._id }, 'Failed to enqueue dunning step');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'dunningCheck cron failed');
  } finally {
    await redisClient.del(CRON_LOCK_KEY).catch(() => {});
  }

  logger.info('dunningCheck cron finished');
};

/**
 * Initialize the dunning check cron.
 * Called from server.js after DB + Redis connect.
 */
const initDunningCheckCron = () => {
  const job = cron.schedule('0 8 * * *', runDunningCheck, {
    scheduled: true,
    timezone:  'UTC',
  });

  logger.info('dunningCheck cron scheduled: 0 8 * * * (daily at 08:00 UTC)');
  return job;
};

module.exports = { initDunningCheckCron, runDunningCheck };
