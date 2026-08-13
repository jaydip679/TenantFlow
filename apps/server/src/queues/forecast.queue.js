'use strict';

/**
 * Forecast Queue
 *
 * BullMQ queue for revenue forecast jobs.
 * Jobs are enqueued by:
 *   - POST /admin/metrics/forecast/trigger (manual admin trigger)
 *   - (Optional) A nightly cron
 *
 * Job payload: {} (no input needed — aggregates platform-wide data)
 *
 * Concurrency: 1 (forecast is platform-wide, not tenant-scoped; no parallel runs)
 * Retries: 2 (AI narrative generation may occasionally fail; regression is local)
 *
 * REF: docs/SYSTEM_DESIGN.md — Revenue Forecasting
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'forecast-queue';

const forecastQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type:  'exponential',
      delay: 30000,
    },
    removeOnComplete: { count: 20 },
    removeOnFail:     { count: 10 },
  },
});

forecastQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Forecast queue error');
});

/**
 * Enqueue a forecast computation job.
 * Uses a fixed jobId so duplicate triggers within the same minute are deduplicated.
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueForecastJob = async (data = {}) => {
  const jobId = `forecast:${new Date().toISOString().slice(0, 13)}`; // Deduplicate within same hour
  return forecastQueue.add('compute-forecast', data, { jobId });
};

module.exports = { forecastQueue, enqueueForecastJob, QUEUE_NAME };
