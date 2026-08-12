'use strict';

/**
 * Notification Worker
 *
 * BullMQ worker consuming 'notification-queue' jobs.
 * Concurrency: 10 (notification delivery is low-risk, high-throughput)
 *
 * For each job:
 *   1. Create Notification document in MongoDB
 *   2. Get io instance from app (set in server.js via app.set('io', io))
 *   3. emitToUser(io, userId, 'notification:new', notification)
 *   4. For admin-relevant events: emitToAdmins(io, event, payload)
 *
 * Admin-relevant events (emitted to /admin namespace):
 *   - account_suspended → dunning:exhausted event to admin:global
 *   - payment_failed    → payment:failed event to admin:global
 *
 * If io is not available (server restart during job):
 *   Notification is still persisted in DB — user sees it on next REST fetch.
 *
 * REF: docs/SYSTEM_DESIGN.md §8.4 — Notification Emission Pattern
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.3
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/notification.queue');

// Admin-relevant notification types and their Socket.IO event names
const ADMIN_EVENTS = {
  account_suspended: 'dunning:exhausted',
  payment_failed:    'payment:failed',
};

/**
 * @param {import('bullmq').Job} job
 */
const processNotificationJob = async (job) => {
  const { userId, tenantId, type, title, body, actionUrl, metadata } = job.data;

  logger.info({ jobId: job.id, userId, type }, 'Processing notification job');

  // 1. Create Notification document
  const Notification = require('../models/Notification.model');
  const notification = await Notification.create({
    userId,
    tenantId: tenantId || null,
    type,
    title,
    body,
    actionUrl:  actionUrl || null,
    metadata:   metadata || {},
  });

  logger.info({ notificationId: notification._id, userId, type }, 'Notification document created');

  // 2. Publish notification.created via Redis Streams
  const redisClient = require('../config/redis');
  
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const eventPayload = {
    eventId,
    eventType: 'notification.created',
    eventVersion: 'v1',
    producer: 'platform-service',
    aggregateType: 'notification',
    aggregateId: notification._id.toString(),
    timestamp: new Date().toISOString(),
    payload: JSON.stringify({
      notificationId: notification._id.toString(),
      userId,
      tenantId: tenantId || null,
      type,
      title,
      body,
      actionUrl: actionUrl || null,
      metadata: metadata || {},
    }),
  };

  try {
    await redisClient.xadd(
      'tenantflow:events',
      '*',
      'eventId', eventPayload.eventId,
      'eventType', eventPayload.eventType,
      'eventVersion', eventPayload.eventVersion,
      'producer', eventPayload.producer,
      'aggregateType', eventPayload.aggregateType,
      'aggregateId', eventPayload.aggregateId,
      'timestamp', eventPayload.timestamp,
      'payload', eventPayload.payload
    );
    logger.info({ eventId, notificationId: notification._id }, 'Published notification.created event');
  } catch (err) {
    logger.error({ err: err.message, notificationId: notification._id }, 'Failed to publish notification.created event');
    throw err;
  }

  logger.info({ jobId: job.id, notificationId: notification._id, userId, type }, 'Notification job completed');
};

// ── Worker Instance ───────────────────────────────────────────
const notificationWorker = new Worker(QUEUE_NAME, processNotificationJob, {
  connection:  bullmqConnection,
  concurrency: 10,
});

notificationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, type: job.data.type }, 'Notification delivered');
});

notificationWorker.on('failed', (job, err) => {
  logger.error(
    {
      jobId:    job?.id,
      userId:   job?.data?.userId,
      type:     job?.data?.type,
      err:      err.message,
      attempts: job?.attemptsMade,
    },
    'Notification delivery failed'
  );
});

notificationWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'Notification worker error');
});

module.exports = { notificationWorker, processNotificationJob };
