'use strict';

const mongoose = require('mongoose');
const { RedisStreamsEventBus } = require('../shared/events/redisStreamsEventBus');
const AnalyticsProcessedEvent = require('../models/AnalyticsProcessedEvent.model');
const logger = require('../shared/utils/logger');

// Projections
const { handleTenantCreated, handleTenantSuspended, handleTenantRestored, handleDunningStarted, handleDunningAbandoned } = require('../projections/tenant.projection');
const { handleUserLogin, handlePaymentFailed } = require('../projections/engagement.projection');
const { handleSubscriptionCreated, handleSubscriptionUpgraded, handleSubscriptionRenewed,
  handleSubscriptionReactivated, handleSubscriptionCancelled, handleSubscriptionEventLogged } = require('../projections/subscription.projection');
const { handleInvoiceCreated, handleInvoiceVoided, handleInvoicePaid } = require('../projections/invoice.projection');

const eventBus = new RedisStreamsEventBus();
const CONSUMER_GROUP = 'analytics-projection';
const CONSUMER_NAME = `analytics-consumer-${process.pid}`;

const projectionMap = {
  'tenant.created': handleTenantCreated,
  'tenant.suspended': handleTenantSuspended,
  'tenant.restored': handleTenantRestored,
  'dunning.started': handleDunningStarted,
  'dunning.abandoned': handleDunningAbandoned,
  'user.login': handleUserLogin,
  'subscription.created': handleSubscriptionCreated,
  'subscription.upgraded': handleSubscriptionUpgraded,
  'subscription.renewed': handleSubscriptionRenewed,
  'subscription.reactivated': handleSubscriptionReactivated,
  'subscription.cancelled': handleSubscriptionCancelled,
  'invoice.created': handleInvoiceCreated,
  'invoice.voided': handleInvoiceVoided,
  'invoice.paid': handleInvoicePaid,
  'payment.failed': handlePaymentFailed,
  'analytics.subscription_event.logged': handleSubscriptionEventLogged,
};

const handleAnalyticsEvent = async (envelope) => {
  const { eventId, eventType } = envelope;

  const handler = projectionMap[eventType];
  if (!handler) {
    logger.debug({ eventType }, 'Analytics consumer skipping unhandled event');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Idempotency Check
      const existing = await AnalyticsProcessedEvent.findOne({ eventId }).session(session);
      if (existing) {
        logger.info({ eventId, eventType }, 'Idempotent skip: event already processed in Analytics');
        return;
      }

      // 2. Delegate to projection logic
      await handler(envelope, session);

      // 3. Mark processed
      await AnalyticsProcessedEvent.create([{
        eventId,
        eventType,
      }], { session });
    });
  } catch (err) {
    logger.error({ err: err.message, eventId, eventType }, 'Failed to project analytics event');
    throw err; // Re-throw to prevent EventBus ACK
  } finally {
    session.endSession();
  }
};

const startAnalyticsConsumer = async () => {
  try {
    await eventBus.subscribe(
      CONSUMER_GROUP,
      CONSUMER_NAME,
      Object.keys(projectionMap),
      handleAnalyticsEvent
    );
    logger.info({ group: CONSUMER_GROUP }, 'Analytics Consumer started');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Analytics Consumer');
    throw err;
  }
};

const stopAnalyticsConsumer = async () => {
  await eventBus.unsubscribe(CONSUMER_GROUP, CONSUMER_NAME);
  logger.info({ group: CONSUMER_GROUP }, 'Analytics Consumer stopped');
};

module.exports = {
  startAnalyticsConsumer,
  stopAnalyticsConsumer,
  handleAnalyticsEvent,
};
