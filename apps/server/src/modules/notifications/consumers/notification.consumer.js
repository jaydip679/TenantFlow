'use strict';

const mongoose = require('mongoose');
const { RedisStreamsEventBus } = require('../../../shared/events/redisStreamsEventBus');
const ProcessedEvent = require('../../../models/ProcessedEvent.model');
const logger = require('../../../shared/utils/logger');
const { emitToUser, emitToTenant } = require('../../../sockets/notifications.namespace');
const { emitToAdmins } = require('../../../sockets/admin.namespace');

const eventBus = new RedisStreamsEventBus();

const CONSUMER_GROUP = 'monolith-notification-delivery';
const CONSUMER_NAME = `notification-consumer-${process.pid}`;

// Admin-relevant notification types and their Socket.IO event names
const ADMIN_EVENTS = {
  account_suspended: 'dunning:exhausted',
  payment_failed:    'payment:failed',
};

/**
 * Handle notification.created
 * Emits the notification over Socket.IO
 */
const handleNotificationCreated = async (envelope) => {
  const { eventId, payload } = envelope;
  const notificationData = JSON.parse(payload);
  const { notificationId, userId, tenantId, type, title, body, actionUrl, metadata } = notificationData;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Idempotency check via ProcessedEvent
      const existing = await ProcessedEvent.findOne({ eventId, consumer: CONSUMER_GROUP }).session(session);
      if (existing) {
        logger.info({ eventId, consumer: CONSUMER_GROUP }, 'Idempotent skip: notification already delivered');
        return;
      }

      await ProcessedEvent.create([{
        eventId,
        eventType: envelope.eventType,
        consumer: CONSUMER_GROUP,
      }], { session });

      // 2. Business Logic: Emit via Socket.IO
      let io;
      try {
        const app = require('../../../app');
        io = app.get('io');
      } catch (err) {
        logger.warn({ err: err.message }, 'Socket.IO io not available');
        return;
      }

      if (!io) {
        logger.warn('Socket.IO io instance is null');
        return;
      }

      const notificationObj = {
        id: notificationId,
        type,
        title,
        body,
        actionUrl,
        createdAt: new Date(),
        isRead: false,
      };

      // Emit to user's room
      emitToUser(io, userId, 'notification:new', notificationObj);

      // Emit to tenant room if applicable
      if (tenantId) {
        emitToTenant(io, tenantId, 'notification:new', notificationObj);
      }

      // Admin-relevant events
      const adminEventName = ADMIN_EVENTS[type];
      if (adminEventName) {
        emitToAdmins(io, adminEventName, {
          tenantId: tenantId || null,
          notificationId,
          ...metadata,
        });
        logger.info({ adminEventName, tenantId, type }, 'Admin Socket.IO event emitted');
      }

      logger.info({ eventId, notificationId, userId }, 'Successfully delivered notification via Socket.IO');
    });
  } catch (err) {
    logger.error({ err: err.message, eventId }, 'Error processing notification.created');
    throw err;
  } finally {
    session.endSession();
  }
};

let isRunning = false;

const startNotificationConsumer = async () => {
  if (isRunning) return;
  isRunning = true;

  logger.info({ consumer: CONSUMER_GROUP }, 'Starting notification delivery consumer');

  const router = {
    'notification.created': handleNotificationCreated,
  };

  eventBus.consumeEvents(CONSUMER_GROUP, CONSUMER_NAME, router).catch(err => {
    logger.error({ err: err.message }, 'Notification consumer failed');
  });
};

const stopNotificationConsumer = async () => {
  isRunning = false;
  logger.info('Notification consumer stopped');
};

module.exports = { startNotificationConsumer, stopNotificationConsumer };
