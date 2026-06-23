'use strict';

/**
 * Churn Analysis Cron
 *
 * Schedule: 0 3 * * * (runs at 03:00 UTC every day)
 *
 * Responsibilities:
 *   1. Acquire Redis cron lock (prevents double-fire on restart)
 *   2. Find all active/trialing/past_due subscriptions with their tenantIds
 *   3. For each tenant: call aiService.triggerChurnAnalysis(tenantId)
 *   4. Process in batches of 10 with 1-second delay between batches
 *      (to avoid overwhelming the AI API rate limits)
 *
 * REF: docs/SRS.md §13.5 — churnAnalysis.cron.js
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.4
 */

const cron         = require('node-cron');
const Subscription = require('../models/Subscription.model');
const aiService    = require('../modules/ai/ai.service');
const redisClient  = require('../config/redis');
const logger       = require('../shared/utils/logger');

const CRON_LOCK_KEY = 'cron:churn-analysis';
const CRON_LOCK_TTL = 7200;  // 2 hours — analysis of all tenants may take a while
const BATCH_SIZE    = 10;
const BATCH_DELAY   = 1000;  // 1 second between batches

/**
 * Helper: sleep for ms milliseconds
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runChurnAnalysis = async () => {
  logger.info('churnAnalysis cron started');

  // Acquire cron-level Redis lock
  const locked = await redisClient.set(CRON_LOCK_KEY, '1', 'NX', 'EX', CRON_LOCK_TTL);
  if (!locked) {
    logger.warn('churnAnalysis cron lock held — skipping this run');
    return;
  }

  try {
    // Find all active, trialing, and past_due subscriptions
    const subscriptions = await Subscription.find({
      status: { $in: ['active', 'trialing', 'past_due'] },
    })
      .select('tenantId')
      .lean();

    const tenantIds = [...new Set(subscriptions.map((s) => s.tenantId.toString()))];

    logger.info({ count: tenantIds.length }, 'Starting churn analysis for tenants');

    // Process in batches of BATCH_SIZE
    let successCount = 0;
    let errorCount   = 0;

    for (let i = 0; i < tenantIds.length; i += BATCH_SIZE) {
      const batch = tenantIds.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map((tenantId) => aiService.triggerChurnAnalysis(tenantId))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
          logger.error(
            { tenantId: batch[idx], err: result.reason?.message },
            'churnAnalysis: failed to trigger analysis for tenant'
          );
        }
      });

      // Delay between batches to respect API rate limits
      if (i + BATCH_SIZE < tenantIds.length) {
        await sleep(BATCH_DELAY);
      }
    }

    logger.info(
      { total: tenantIds.length, successCount, errorCount },
      'churnAnalysis cron finished'
    );
  } catch (err) {
    logger.error({ err: err.message }, 'churnAnalysis cron failed');
  } finally {
    await redisClient.del(CRON_LOCK_KEY).catch(() => {});
  }
};

/**
 * Initialize the churn analysis cron.
 * Called from server.js after DB + Redis connect.
 */
const initChurnAnalysisCron = () => {
  const job = cron.schedule('0 3 * * *', runChurnAnalysis, {
    scheduled: true,
    timezone:  'UTC',
  });

  logger.info('churnAnalysis cron scheduled: 0 3 * * * (daily at 03:00 UTC)');
  return job;
};

module.exports = { initChurnAnalysisCron, runChurnAnalysis };
