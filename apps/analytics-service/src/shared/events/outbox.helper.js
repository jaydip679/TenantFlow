'use strict';

const OutboxEvent = require('../../models/OutboxEvent.model');
const { createEventEnvelope } = require('./eventEnvelope');
const logger = require('../utils/logger');

/**
 * Creates an OutboxEvent inside a MongoDB transaction.
 * 
 * @param {Object} params
 * @param {string} params.eventType
 * @param {string} [params.eventVersion='v1']
 * @param {string} [params.tenantId]
 * @param {string} params.aggregateType
 * @param {string} params.aggregateId
 * @param {string} [params.correlationId]
 * @param {Object} params.payload
 * @param {import('mongoose').ClientSession} params.session - Required. Must be the active transaction session.
 * @returns {Promise<Object>} The created OutboxEvent document.
 */
const addEventToOutbox = async ({
  eventType,
  eventVersion = 'v1',
  tenantId,
  aggregateType,
  aggregateId,
  correlationId,
  payload,
  session,
}) => {
  if (!session) {
    throw new Error('A MongoDB transaction session is strictly required to add an OutboxEvent.');
  }

  // Delegate event formatting and UUID generation to the standard envelope factory
  const envelope = createEventEnvelope({
    eventType,
    eventVersion,
    tenantId,
    aggregateType,
    aggregateId,
    correlationId,
    payload,
  });

  // Create the OutboxEvent atomically within the active session
  const [outboxDoc] = await OutboxEvent.create(
    [
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        eventVersion: envelope.eventVersion,
        occurredAt: envelope.occurredAt,
        tenantId: envelope.tenantId,
        producer: envelope.producer,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        correlationId: envelope.correlationId,
        payload: envelope.payload,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
      },
    ],
    { session }
  );

  logger.debug(
    { eventId: envelope.eventId, eventType },
    'OutboxEvent added to transaction'
  );

  return outboxDoc;
};

module.exports = {
  addEventToOutbox,
};
