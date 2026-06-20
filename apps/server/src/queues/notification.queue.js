'use strict';

/**
 * Notification Queue
 *
 * BullMQ queue for creating and delivering in-app notifications.
 * Jobs are enqueued by services (payment.worker, dunning.service, etc.)
 * and processed by notification.worker.js.
 *
 * Job payload:
 * {
 *   userId:    string   — MongoDB User._id
 *   tenantId:  string?  — MongoDB Tenant._id (null for super_admin)
 *   type:      string   — Notification type enum
 *   title:     string   — Notification title
 *   body:      string   — Notification body text
 *   actionUrl: string?  — Deep link URL
 *   metadata:  Object?  — Additional data (invoiceId, dunningId, etc.)
 * }
 *
 * Concurrency: 10 (notification delivery is low-risk, high-throughput)
 * Retries: 3 (notification delivery is best-effort)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.3
 */

const { Queue } = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger = require('../shared/utils/logger');

const QUEUE_NAME = 'notification-queue';

const notificationQueue = new Queue(QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

notificationQueue.on('error', (err) => {
  logger.error({ err: err.message, queue: QUEUE_NAME }, 'Notification queue error');
});

/**
 * Enqueue a notification for delivery.
 *
 * @param {Object} payload
 * @param {string}  payload.userId
 * @param {string?} payload.tenantId
 * @param {string}  payload.type
 * @param {string}  payload.title
 * @param {string}  payload.body
 * @param {string?} payload.actionUrl
 * @param {Object?} payload.metadata
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueueNotification = async (payload) => {
  const jobId = `notification:${payload.userId}:${payload.type}:${Date.now()}`;
  return notificationQueue.add('deliver-notification', payload, { jobId });
};

module.exports = { notificationQueue, enqueueNotification, QUEUE_NAME };
