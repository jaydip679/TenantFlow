'use strict';

/**
 * Subscription Validators
 * REF: docs/SRS.md §5 — Subscriptions Module
 */

const Joi = require('joi');

const upgradeSchema = Joi.object({
  body: Joi.object({
    targetPlanId: Joi.string().length(24).hex().required()
      .messages({ 'string.length': 'targetPlanId must be a valid MongoDB ObjectId' }),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const downgradeSchema = Joi.object({
  body: Joi.object({
    targetPlanId: Joi.string().length(24).hex().required(),
    reason:       Joi.string().max(500).allow('', null).optional(),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const cancelSchema = Joi.object({
  body: Joi.object({
    cancelAtPeriodEnd: Joi.boolean().required(),
    reason:            Joi.string().max(500).allow('', null).optional(),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const pauseSchema = Joi.object({
  body: Joi.object({
    pauseEndsAt: Joi.date().iso().min('now').allow(null).optional(),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const paginationSchema = Joi.object({
  body:   Joi.object(),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
});

module.exports = {
  upgradeSchema,
  downgradeSchema,
  cancelSchema,
  pauseSchema,
  paginationSchema,
};
