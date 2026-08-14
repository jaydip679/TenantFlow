'use strict';

const SubscriptionEvent = require('../../models/SubscriptionEvent.model');
const identityFacade = require('../facades/identity.facade');
const { addEventToOutbox } = require('./outbox.helper');
const { AppError } = require('../errors/AppError');

/**
 * Wraps SubscriptionEvent.create to automatically enrich with historical plan pricing
 * and emit the analytics.subscription_event.logged outbox event.
 * 
 * @param {Array<Object>} eventsArray - Array of event payloads to create
 * @param {Object} options - Mongoose options { session }
 * @returns {Promise<Array<Object>>} The created SubscriptionEvent documents
 */
const logSubscriptionEvent = async (eventsArray, options = {}) => {
  const { session } = options;

  // 1. Collect unique plan IDs
  const uniquePlanIds = new Set();
  for (const ev of eventsArray) {
    if (ev.fromPlanId) uniquePlanIds.add(ev.fromPlanId.toString());
    if (ev.toPlanId) uniquePlanIds.add(ev.toPlanId.toString());
  }

  // 2. Fetch each required plan exactly once
  const planMap = new Map();
  await Promise.all(
    Array.from(uniquePlanIds).map(async (planId) => {
      const plan = await identityFacade.getPlan(planId);
      if (!plan) {
        throw new AppError(`Failed to retrieve required historical plan ${planId} for financial metadata`, 500);
      }
      planMap.set(planId, plan);
    })
  );

  // 3. Enrich events with strictly typed metadata
  const enrichedEvents = eventsArray.map(ev => {
    const enriched = { ...ev };
    
    // Convert to plain object for Map compatibility if needed, though Mongoose handles objects well for Maps
    enriched.metadata = enriched.metadata instanceof Map 
      ? Object.fromEntries(enriched.metadata) 
      : (enriched.metadata || {});

    if (ev.fromPlanId) {
      const plan = planMap.get(ev.fromPlanId.toString());
      enriched.metadata.fromPlanPrice = plan.price;
      enriched.metadata.fromPlanInterval = plan.interval;
      enriched.metadata.fromPlanName = plan.displayName || plan.name;
    }

    if (ev.toPlanId) {
      const plan = planMap.get(ev.toPlanId.toString());
      enriched.metadata.toPlanPrice = plan.price;
      enriched.metadata.toPlanInterval = plan.interval;
      enriched.metadata.toPlanName = plan.displayName || plan.name;
    }

    return enriched;
  });

  // 4. Create SubscriptionEvent documents
  let createdDocs = await SubscriptionEvent.create(enrichedEvents, { session });
  if (!Array.isArray(createdDocs)) {
    createdDocs = [createdDocs];
  }

  // 5. Emit Outbox events for Analytics
  for (const doc of createdDocs) {
    // Explicitly define sourceEventId from the DB _id to prevent confusion with Outbox Envelope ID
    const sourceEventId = doc._id ? doc._id.toString() : 'mock-id';
    
    const payload = {
      sourceEventId,
      subscriptionId: doc.subscriptionId.toString(),
      tenantId: doc.tenantId.toString(),
      event: doc.event,
      fromStatus: doc.fromStatus,
      toStatus: doc.toStatus,
      fromPlanId: doc.fromPlanId ? doc.fromPlanId.toString() : null,
      toPlanId: doc.toPlanId ? doc.toPlanId.toString() : null,
      metadata: doc.metadata ? Object.fromEntries(doc.metadata) : {},
      triggeredBy: doc.triggeredBy,
      createdAt: doc.createdAt
    };

    await addEventToOutbox({
      eventType: 'analytics.subscription_event.logged',
      eventVersion: 'v1',
      producer: 'billing-service',
      aggregateType: 'subscription_event',
      aggregateId: sourceEventId,
      tenantId: doc.tenantId.toString(),
      payload,
      session
    });
  }

  return createdDocs;
};

module.exports = {
  logSubscriptionEvent
};
