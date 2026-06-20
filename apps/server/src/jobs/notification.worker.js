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

  // 2. Get io instance — set on app in server.js after Socket.IO initialization
  let io;
  try {
    // app is available via module require in server context
    const app = require('../app');
    io = app.get('io');
  } catch (err) {
    // Graceful degradation: notification is persisted, Socket.IO delivery not possible
    logger.warn({ err: err.message, userId, type }, 'Socket.IO io not available — notification persisted but not emitted');
    return;
  }

  if (!io) {
    logger.warn({ userId, type }, 'Socket.IO io instance is null — notification persisted, no real-time delivery');
    return;
  }

  // 3. Emit to user's room
  const { emitToUser, emitToTenant } = require('../sockets/notifications.namespace');
  const { emitToAdmins }             = require('../sockets/admin.namespace');

  emitToUser(io, userId, 'notification:new', notification.toObject());

  // Also emit to tenant room if tenantId is set (broadcast to all tenant members)
  if (tenantId) {
    emitToTenant(io, tenantId, 'notification:new', notification.toObject());
  }

  // 4. Admin-relevant events → emit to admin:global
  const adminEventName = ADMIN_EVENTS[type];
  if (adminEventName) {
    emitToAdmins(io, adminEventName, {
      tenantId:       tenantId || null,
      notificationId: notification._id,
      ...metadata,
    });
    logger.info({ adminEventName, tenantId, type }, 'Admin Socket.IO event emitted');
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

module.exports = { notificationWorker };
