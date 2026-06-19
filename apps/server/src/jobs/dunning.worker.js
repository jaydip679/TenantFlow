'use strict';

/**
 * Dunning Worker
 *
 * BullMQ worker consuming 'dunning-queue' jobs.
 * Concurrency: 1 (serialized — prevents concurrent step processing).
 *
 * Each job calls dunningService.advanceDunningStep(dunningRecordId).
 *
 * REF: docs/SRS.md §13.4 — Dunning Worker Logic
 * REF: docs/IMPLEMENTATION_ROADMAP.md §9.1 T6.2
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/dunning.queue');

/**
 * @param {import('bullmq').Job} job
 */
const processDunningJob = async (job) => {
  const { dunningRecordId } = job.data;

  logger.info({ jobId: job.id, dunningRecordId }, 'Processing dunning job');

  const dunningService = require('../modules/payments/dunning.service');
  await dunningService.advanceDunningStep(dunningRecordId);

  logger.info({ jobId: job.id, dunningRecordId }, 'Dunning job completed');
  return { dunningRecordId };
};

// ── Worker Instance ───────────────────────────────────────────
const dunningWorker = new Worker(QUEUE_NAME, processDunningJob, {
  connection:  bullmqConnection,
  concurrency: 1,  // Serialized — dunning steps must not run concurrently
});

dunningWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, dunningRecordId: result.dunningRecordId }, 'Dunning job completed');
});

dunningWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:           job?.id,
      dunningRecordId: job?.data?.dunningRecordId,
      err:             err.message,
      attempts:        job?.attemptsMade,
    },
    'Dunning job failed'
  );
});

dunningWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'Dunning worker error');
});

module.exports = { dunningWorker };
