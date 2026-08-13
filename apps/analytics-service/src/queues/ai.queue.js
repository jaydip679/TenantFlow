'use strict';

/**
 * AI Queue
 *
 * BullMQ queue for churn analysis jobs.
 * Jobs are enqueued by:
 *   - churnAnalysis.cron.js (nightly at 03:00 UTC)
 *   - POST /ai/churn/trigger/:tenantId (manual trigger endpoint)
 *
 * Job payload: { tenantId, signals }
 *
 * Concurrency: 3 (AI API calls are rate-limited; 3 simultaneous is safe)
 * Retries: 2 (AI calls are expensive; don't retry too aggressively)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.2
 * REF: docs/SRS.md §13.5 — churnAnalysis cron
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'ai-queue';

const aiQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type:  'exponential',
      delay: 60000,  // 60s — AI API rate limits need time to reset
    },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
});

aiQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'AI queue error');
});

/**
 * Enqueue a churn analysis job.
 * @param {Object} payload - { tenantId, signals }
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueAiJob = async (payload) => {
  const jobId = `ai:churn:${payload.tenantId}:${Date.now()}`;
  return aiQueue.add('analyze-churn', payload, { jobId });
};

module.exports = { aiQueue, enqueueAiJob, QUEUE_NAME };
