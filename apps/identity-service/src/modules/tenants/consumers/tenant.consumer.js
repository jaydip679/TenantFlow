'use strict';

const mongoose = require('mongoose');
const { RedisStreamsEventBus } = require('../../../shared/events/redisStreamsEventBus');
const ProcessedEvent = require('../../../models/ProcessedEvent.model');
const Tenant = require('../../../models/Tenant.model');
const { addEventToOutbox } = require('../../../shared/events/outbox.helper');
const logger = require('../../../shared/utils/logger');

const eventBus = new RedisStreamsEventBus();

const CONSUMER_GROUP = 'identity-tenant-manager';
const CONSUMER_NAME = `tenant-consumer-${process.pid}`;

/**
 * Handle subscription.created
 */
const handleSubscriptionCreated = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  
  const tenant = await Tenant.findById(tenantId).session(session);
  if (!tenant) return;

  tenant.currentPlanId = payload.planId;
  tenant.features = payload.features || tenant.features;
  await tenant.save({ session });

  await emitTenantEvent('tenant.plan_updated', tenantId, {
    reason: 'subscription_created',
    planId: payload.planId,
  }, session);
};

/**
 * Handle subscription.upgraded
 */
const handleSubscriptionUpgraded = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  
  const tenant = await Tenant.findById(tenantId).session(session);
  if (!tenant) return;

  tenant.currentPlanId = payload.newPlanId || payload.planId;
  tenant.features = payload.features || tenant.features;
  await tenant.save({ session });

  await emitTenantEvent('tenant.plan_updated', tenantId, {
    reason: 'subscription_upgraded',
    planId: tenant.currentPlanId,
  }, session);
};

/**
 * Handle subscription.renewed (which handles downgrades)
 */
const handleSubscriptionRenewed = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  
  const tenant = await Tenant.findById(tenantId).session(session);
  if (!tenant) return;

  let changed = false;
  if (payload.planId && tenant.currentPlanId?.toString() !== payload.planId) {
    tenant.currentPlanId = payload.planId;
    changed = true;
  }
  if (payload.features) {
    tenant.features = payload.features;
    changed = true;
  }
  
  if (changed) {
    await tenant.save({ session });
    await emitTenantEvent('tenant.plan_updated', tenantId, {
      reason: 'subscription_downgraded',
      planId: tenant.currentPlanId,
    }, session);
  }
};

/**
 * Handle subscription.cancelled
 */
const handleSubscriptionCancelled = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  
  const tenant = await Tenant.findById(tenantId).session(session);
  if (!tenant) return;

  // Immediate cancellation or cron expiration
  if (payload.cancelAtPeriodEnd === false || payload.status === 'cancelled') {
    tenant.status = 'cancelled';
    await tenant.save({ session });

    await emitTenantEvent('tenant.cancelled', tenantId, {
      reason: 'subscription_cancelled',
    }, session);
  }
};

/**
 * Handle subscription.reactivated
 */
const handleSubscriptionReactivated = async (envelope, session) => {
  const { tenantId } = envelope;
  
  const tenant = await Tenant.findById(tenantId).session(session);
  if (!tenant) return;

  tenant.status = 'active';
  await tenant.save({ session });

  await emitTenantEvent('tenant.restored', tenantId, {
    reason: 'subscription_reactivated',
  }, session);
};

/**
 * Handle dunning.abandoned -> Suspend Tenant
 */
const handleDunningAbandoned = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const tenant = await Tenant.findById(tenantId).session(session);
  if (tenant && tenant.status !== 'suspended') {
    tenant.status = 'suspended';
    await tenant.save({ session });

    await emitTenantEvent('tenant.suspended', tenantId, {
      reason: 'dunning_abandoned',
      dunningRecordId: payload.dunningRecordId,
    }, session);
  }
};

/**
 * Handle invoice.paid -> Restore Tenant
 */
const handleInvoicePaid = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const tenant = await Tenant.findById(tenantId).session(session);
  // Only restore if currently suspended by dunning. Ignore if cancelled!
  if (tenant && tenant.status === 'suspended') {
    tenant.status = 'active';
    await tenant.save({ session });

    await emitTenantEvent('tenant.restored', tenantId, {
      reason: 'invoice_paid',
      invoiceId: payload.invoiceId,
      paymentId: payload.paymentId,
    }, session);
  }
};

const emitTenantEvent = async (eventType, tenantId, payload, session) => {
  await addEventToOutbox({
    eventType,
    eventVersion: 'v1',
    producer: 'identity-service',
    aggregateType: 'tenant',
    aggregateId: tenantId.toString(),
    tenantId: tenantId.toString(),
    payload: {
      ...payload,
      aggregateVersion: 1, // Base version
    },
    session,
  });
};

const router = {
  'subscription.created': handleSubscriptionCreated,
  'subscription.upgraded': handleSubscriptionUpgraded,
  'subscription.renewed': handleSubscriptionRenewed,
  'subscription.cancelled': handleSubscriptionCancelled,
  'subscription.reactivated': handleSubscriptionReactivated,
  'dunning.abandoned': handleDunningAbandoned,
  'invoice.paid': handleInvoicePaid,
};

let isRunning = false;

const startTenantConsumer = async () => {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting Identity Tenant Consumer');

  try {
    await eventBus.subscribe({
      groupName: CONSUMER_GROUP,
      consumerName: CONSUMER_NAME,
      eventTypes: Object.keys(router),
      handler: async (envelope) => {
        const { eventId, eventType } = envelope;
        
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const existing = await ProcessedEvent.findOne({ eventId, consumer: CONSUMER_GROUP }).session(session);
            if (existing) {
              logger.info({ eventId, consumer: CONSUMER_GROUP }, 'Idempotent skip: event already processed');
              return;
            }

            await ProcessedEvent.create([{
              eventId,
              eventType,
              consumer: CONSUMER_GROUP,
            }], { session });

            const route = router[eventType];
            if (route) {
              await route(envelope, session);
            }
          });
        } catch (err) {
          logger.error({ err: err.message, eventId }, `Failed to process ${eventType}`);
          throw err; // Re-throw to prevent ACK
        } finally {
          session.endSession();
        }
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Identity Tenant Consumer');
  }
};

const stopTenantConsumer = async () => {
  isRunning = false;
  logger.info('Shutting down Identity Tenant Consumer');
  await eventBus.close();
};

module.exports = {
  startTenantConsumer,
  stopTenantConsumer,
};
