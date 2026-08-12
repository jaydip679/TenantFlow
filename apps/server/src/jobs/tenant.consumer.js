'use strict';

const mongoose = require('mongoose');
const { RedisStreamsEventBus } = require('../shared/events/redisStreamsEventBus');
const ProcessedEvent = require('../models/ProcessedEvent.model');
const Tenant = require('../models/Tenant.model');
const { addEventToOutbox } = require('../shared/events/outbox.helper');
const logger = require('../shared/utils/logger');

const eventBus = new RedisStreamsEventBus();

const CONSUMER_GROUP = 'identity-tenant-manager';
const CONSUMER_NAME = `tenant-consumer-${process.pid}`;

/**
 * Handle dunning.abandoned -> Suspend Tenant
 */
const handleDunningAbandoned = async (envelope) => {
  const { eventId, tenantId, payload } = envelope;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Idempotency check via ProcessedEvent
      const existing = await ProcessedEvent.findOne({ eventId, consumer: CONSUMER_GROUP }).session(session);
      if (existing) {
        logger.info({ eventId, consumer: CONSUMER_GROUP }, 'Idempotent skip: event already processed');
        return;
      }

      await ProcessedEvent.create([{
        eventId,
        eventType: envelope.eventType,
        consumer: CONSUMER_GROUP,
      }], { session });

      // 2. Business Logic: Suspend Tenant
      const tenant = await Tenant.findById(tenantId).session(session);
      if (tenant && tenant.status !== 'suspended') {
        tenant.status = 'suspended';
        await tenant.save({ session });

        // 3. Emit Domain Event: tenant.suspended
        await addEventToOutbox({
          eventType: 'tenant.suspended',
          eventVersion: 'v1',
          producer: 'identity-service',
          aggregateType: 'tenant',
          aggregateId: tenantId,
          tenantId,
          payload: {
            reason: 'dunning_abandoned',
            dunningRecordId: payload.dunningRecordId,
            aggregateVersion: tenant.aggregateVersion,
          },
          session,
        });

        logger.info({ tenantId }, 'Tenant suspended via dunning.abandoned event');
      }
    });
  } finally {
    session.endSession();
  }

  // Cache invalidation (eventual, outside tx)
  const redisClient = require('../config/redis');
  await redisClient.del(`tenant:ctx:${tenantId}`).catch(() => {});
};

/**
 * Handle invoice.paid -> Restore Tenant
 */
const handleInvoicePaid = async (envelope) => {
  const { eventId, tenantId, payload } = envelope;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Idempotency check
      const existing = await ProcessedEvent.findOne({ eventId, consumer: CONSUMER_GROUP }).session(session);
      if (existing) {
        logger.info({ eventId, consumer: CONSUMER_GROUP }, 'Idempotent skip: event already processed');
        return;
      }

      await ProcessedEvent.create([{
        eventId,
        eventType: envelope.eventType,
        consumer: CONSUMER_GROUP,
      }], { session });

      // 2. Business Logic: Restore Tenant if past_due
      const tenant = await Tenant.findById(tenantId).session(session);
      if (tenant && tenant.status === 'past_due') {
        tenant.status = 'active';
        await tenant.save({ session });

        // 3. Emit Domain Event: tenant.restored
        await addEventToOutbox({
          eventType: 'tenant.restored',
          eventVersion: 'v1',
          producer: 'identity-service',
          aggregateType: 'tenant',
          aggregateId: tenantId,
          tenantId,
          payload: {
            reason: 'invoice_paid',
            invoiceId: payload.invoiceId,
            paymentId: payload.paymentId,
            aggregateVersion: tenant.aggregateVersion,
          },
          session,
        });

        logger.info({ tenantId }, 'Tenant restored via invoice.paid event');
      }
    });
  } finally {
    session.endSession();
  }

  // Cache invalidation (eventual, outside tx)
  const redisClient = require('../config/redis');
  await redisClient.del(`tenant:ctx:${tenantId}`).catch(() => {});
};

const startTenantConsumer = async () => {
  logger.info('Starting Identity Tenant Consumer');

  try {
    await eventBus.subscribe({
      groupName: CONSUMER_GROUP,
      consumerName: CONSUMER_NAME,
      eventTypes: ['dunning.abandoned', 'invoice.paid'],
      handler: async (envelope) => {
        logger.debug({ eventId: envelope.eventId, eventType: envelope.eventType }, 'Received event in tenant consumer');
        
        if (envelope.eventType === 'dunning.abandoned') {
          await handleDunningAbandoned(envelope);
        } else if (envelope.eventType === 'invoice.paid') {
          await handleInvoicePaid(envelope);
        }
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Identity Tenant Consumer');
  }
};

const stopTenantConsumer = async () => {
  logger.info('Shutting down Identity Tenant Consumer');
  await eventBus.close();
};

module.exports = {
  startTenantConsumer,
  stopTenantConsumer,
};
