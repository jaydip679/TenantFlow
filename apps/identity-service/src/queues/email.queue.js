'use strict';

/**
 * Email Queue
 *
 * BullMQ queue for all outbound email delivery.
 * Workers process jobs from this queue via jobs/email.worker.js.
 *
 * Queue name: 'email-queue'
 * Job types: welcome, email_otp, password_reset, invoice_generated,
 *            payment_success, payment_failed, dunning_step_1/2/3,
 *            account_suspended, trial_ending_soon, member_invite
 *
 * Job ID format: email:{type}:{recipientEmail}:{Date.now()}
 * (ensures deduplication within the same second for the same type+recipient)
 *
 * Default job options:
 *   - attempts: 3 (retry failed email delivery up to 3 times)
 *   - backoff: exponential, 5 seconds base
 *   - removeOnComplete: keep last 100 completed jobs for debugging
 *   - removeOnFail: keep last 500 failed jobs for audit
 *
 * REF: docs/SRS.md §14.1 — email-queue job payload contract
 * REF: docs/SYSTEM_DESIGN.md §7 — BullMQ Queue Architecture
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.4
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'email-queue';

const emailQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 5000, // 5 second base, then 10s, 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  },
});

emailQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Email queue error');
});

/**
 * Enqueue an email delivery job.
 *
 * @param {Object} jobData
 * @param {string} jobData.type          - Email template type (e.g. 'welcome', 'email_otp')
 * @param {string} jobData.to            - Recipient email address
 * @param {string} [jobData.firstName]   - Recipient first name (for personalization)
 * @param {Object} [jobData.templateVars] - Template-specific variables
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueEmail = async (jobData) => {
  const jobId = `email_${jobData.type}_${jobData.to}_${Date.now()}`;
  return emailQueue.add(jobData.type, jobData, { jobId });
};

module.exports = { emailQueue, enqueueEmail, QUEUE_NAME };
