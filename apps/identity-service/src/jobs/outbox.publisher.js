'use strict';

const mongoose = require('mongoose');
const OutboxEvent = require('../models/OutboxEvent.model');
const { RedisStreamsEventBus } = require('../shared/events/redisStreamsEventBus');
const logger = require('../shared/utils/logger');

const POLLING_INTERVAL_MS = parseInt(process.env.OUTBOX_POLLING_INTERVAL || '2000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE || '10', 10);
const MAX_ATTEMPTS = 5;

let isShuttingDown = false;
let pollingTimer = null;
let activeProcessPromise = null;
const eventBus = new RedisStreamsEventBus();

/**
 * Safely atomic claims up to BATCH_SIZE events.
 * It claims `pending` events that are ready, OR `publishing` events whose lease has expired.
 */
const claimEvents = async () => {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 30000); // 30 second lease

  // We must claim events one by one to ensure atomicity and get the updated docs,
  // or use an updateMany followed by a find, but updateMany doesn't return the docs.
  // We will loop up to BATCH_SIZE times to findAndModify.
  const claimedEvents = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const event = await OutboxEvent.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', availableAt: { $lte: now } },
          { status: 'publishing', leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: { status: 'publishing', leaseUntil },
      },
      { new: true, sort: { availableAt: 1 } } // Oldest available first
    );

    if (!event) break; // No more eligible events
    claimedEvents.push(event);
  }

  return claimedEvents;
};

/**
 * Publishes a claimed event via EventBus.
 */
const publishEvent = async (event) => {
  try {
    // We pass the event as an envelope directly.
    // The EventBus must accept this object and NOT regenerate the eventId.
    const envelope = {
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      occurredAt: event.occurredAt,
      tenantId: event.tenantId,
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      payload: event.payload,
    };

    await eventBus.publish(envelope);

    event.status = 'published';
    event.publishedAt = new Date();
    event.leaseUntil = null;
    await event.save();
    
    logger.debug({ eventId: event.eventId, eventType: event.eventType }, 'OutboxEvent successfully published');
  } catch (err) {
    logger.warn({ eventId: event.eventId, err: err.message }, 'Failed to publish OutboxEvent');
    
    event.attempts += 1;
    event.lastError = err.message;
    
    if (event.attempts >= MAX_ATTEMPTS) {
      event.status = 'failed';
      event.leaseUntil = null;
      event.availableAt = null;
      logger.error({ eventId: event.eventId }, 'OutboxEvent permanently failed after max attempts');
    } else {
      event.status = 'pending';
      event.leaseUntil = null;
      // Exponential backoff
      event.availableAt = new Date(Date.now() + Math.pow(2, event.attempts) * 1000);
    }
    
    await event.save();
  }
};

/**
 * Main polling loop.
 */
const processOutbox = async () => {
  if (isShuttingDown) return;

  activeProcessPromise = (async () => {
    try {
      const events = await claimEvents();
      if (events.length > 0) {
        logger.debug(`Claimed ${events.length} outbox events for publishing`);
        await Promise.allSettled(events.map(publishEvent));
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Error in Outbox Publisher polling loop');
    }
  })();

  await activeProcessPromise;
  activeProcessPromise = null;

  if (!isShuttingDown) {
    pollingTimer = setTimeout(processOutbox, POLLING_INTERVAL_MS);
  }
};

const startPublisher = () => {
  logger.info('Starting Outbox Publisher daemon');
  isShuttingDown = false;
  processOutbox();
};

const stopPublisher = async () => {
  logger.info('Shutting down Outbox Publisher daemon');
  isShuttingDown = true;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
  }
  if (activeProcessPromise) {
    await activeProcessPromise;
  }
  await eventBus.close();
};

module.exports = {
  startPublisher,
  stopPublisher,
};
