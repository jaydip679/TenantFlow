'use strict';

/**
 * AI Worker
 *
 * BullMQ worker consuming 'ai-queue' jobs.
 * Concurrency: 3 (limited by AI API rate limits)
 *
 * For each job:
 *   1. Destructure { tenantId, signals }
 *   2. Call aiService.runChurnAnalysis(tenantId, signals)
 *      - Calls AI provider (OpenAI/Gemini)
 *      - Parses JSON response
 *      - Upserts TenantChurnScore document
 *      - Caches in Redis ai:churn:{tenantId} (TTL 3600s)
 *      - Enqueues proactive outreach email if score > 75 and not sent
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.2
 * REF: docs/SRS.md §13.5 — churnAnalysis cron → ai-queue
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/ai.queue');

/**
 * @param {import('bullmq').Job} job
 */
const processAiJob = async (job) => {
  const { tenantId, signals } = job.data;

  logger.info({ jobId: job.id, tenantId }, 'Processing AI churn analysis job');

  const aiService = require('../modules/ai/ai.service');
  const score = await aiService.runChurnAnalysis(tenantId, signals);

  logger.info(
    { jobId: job.id, tenantId, churnRiskScore: score.churnRiskScore, riskLevel: score.riskLevel },
    'AI churn analysis job completed'
  );

  return { tenantId, churnRiskScore: score.churnRiskScore, riskLevel: score.riskLevel };
};

// ── Worker Instance ───────────────────────────────────────────
const aiWorker = new Worker(QUEUE_NAME, processAiJob, {
  connection:  bullmqConnection,
  concurrency: 3,
});

aiWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, tenantId: result.tenantId, churnRiskScore: result.churnRiskScore }, 'AI job completed');
});

aiWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:    job?.id,
      tenantId: job?.data?.tenantId,
      err:      err.message,
      attempts: job?.attemptsMade,
    },
    'AI job failed'
  );
});

aiWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'AI worker error');
});

module.exports = { aiWorker };
