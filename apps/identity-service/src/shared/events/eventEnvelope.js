'use strict';

const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../errors/AppError');

/**
 * Standardized Event Envelope validator.
 */
const eventEnvelopeSchema = Joi.object({
  eventId:       Joi.string().uuid().required(),
  eventType:     Joi.string().required(),
  eventVersion:  Joi.string().required(),
  occurredAt:    Joi.date().iso().required(),
  tenantId:      Joi.string().allow(null).optional(), // Not all events are tenant-scoped (e.g. some admin events)
  producer:      Joi.string().required(),
  aggregateType: Joi.string().allow(null).optional(),
  aggregateId:   Joi.string().allow(null).optional(),
  correlationId: Joi.string().allow(null).optional(),
  payload:       Joi.object().required()
});

/**
 * Creates and validates a standardized event envelope.
 * 
 * @param {Object} params
 * @param {string} params.eventType - e.g., 'invoice.paid'
 * @param {string} params.eventVersion - e.g., 'v1'
 * @param {string} [params.tenantId] - Optional tenant context
 * @param {string} [params.producer] - Defaults to 'tenantflow-server'
 * @param {string} [params.aggregateType] - e.g., 'invoice'
 * @param {string} [params.aggregateId] - e.g., invoice _id
 * @param {string} [params.correlationId] - For distributed tracing
 * @param {Object} params.payload - Event specific data
 * @returns {Object} Validated event envelope
 */
const createEventEnvelope = ({
  eventType,
  eventVersion,
  tenantId = null,
  producer = 'tenantflow-server',
  aggregateType = null,
  aggregateId = null,
  correlationId = null,
  payload = {}
}) => {
  const envelope = {
    eventId: uuidv4(),
    eventType,
    eventVersion,
    occurredAt: new Date().toISOString(),
    tenantId,
    producer,
    aggregateType,
    aggregateId,
    correlationId,
    payload
  };

  const { error, value } = eventEnvelopeSchema.validate(envelope);
  if (error) {
    throw new AppError(`Invalid event envelope: ${error.message}`, 400, 'INVALID_EVENT_ENVELOPE');
  }

  return value;
};

/**
 * Validates an existing payload to ensure it conforms to the Event Envelope.
 * Useful for consumers to validate incoming messages.
 * 
 * @param {Object} envelope - The received event payload
 * @returns {Object} The validated envelope
 */
const validateEventEnvelope = (envelope) => {
  const { error, value } = eventEnvelopeSchema.validate(envelope, { allowUnknown: true });
  if (error) {
    throw new Error(`Invalid event envelope: ${error.message}`);
  }
  return value;
};

module.exports = {
  createEventEnvelope,
  validateEventEnvelope,
  eventEnvelopeSchema
};
