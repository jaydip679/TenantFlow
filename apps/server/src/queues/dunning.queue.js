'use strict';

/**
 * Dunning Queue
 *
 * BullMQ queue for dunning retry jobs.
 * Each job processes one retry step for a DunningRecord.
 * Concurrency: 1 (serialized — prevents concurrent dunning step processing
 * for the same tenant, in addition to per-record Redis lock).
 *
 * Job payload: { dunningRecordId }
 *
 * Default job options:
 *   - attempts: 3
 *   - backoff: exponential, 30 seconds base
 *   - removeOnComplete: keep last 100
 *   - removeOnFail: keep last 200
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §9.1 T6.2
 * REF: docs/SRS.md §13.3 — dunningCheck cron produces these jobs
 * REF: docs/SRS.md §13.4 — dunning worker logic
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'dunning-queue';

const dunningQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 30000,  // 30s base (dunning is not time-critical to the second)
    },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
  },
});

dunningQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Dunning queue error');
});

/**
 * Enqueue a dunning step job.
 * @param {string} dunningRecordId
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueDunningStep = async (dunningRecordId) => {
  const jobId = `dunning:${dunningRecordId}:${Date.now()}`;
  return dunningQueue.add('advance-dunning', { dunningRecordId }, { jobId });
};

module.exports = { dunningQueue, enqueueDunningStep, QUEUE_NAME };
