'use strict';

/**
 * Plan Validators — Joi Schemas
 * REF: docs/SRS.md §4 — Plans Module
 */

const Joi = require('joi');

const featuresSchema = Joi.object({
  max_seats:           Joi.number().integer().min(1),
  api_calls_per_month: Joi.number().integer().min(0),
  storage_gb:          Joi.number().min(0),
  advanced_analytics:  Joi.boolean(),
  ai_assistant:        Joi.boolean(),
  priority_support:    Joi.boolean(),
});

const createPlanSchema = Joi.object({
  name:        Joi.string().trim().min(2).max(50).required(),
  displayName: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().max(500).allow('').optional(),
  price:       Joi.number().integer().min(0).required()
    .messages({ 'number.integer': 'Price must be an integer (paise). No decimals allowed.' }),
  currency:  Joi.string().length(3).uppercase().default('INR'),
  interval:  Joi.string().valid('monthly', 'annual').required(),
  trialDays: Joi.number().integer().min(0).default(14),
  features:  featuresSchema.optional(),
  isPublic:  Joi.boolean().default(true),
  sortOrder: Joi.number().integer().default(0),
});

const updatePlanSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(100),
  description: Joi.string().max(500).allow(''),
  price:       Joi.number().integer().min(0)
    .messages({ 'number.integer': 'Price must be an integer (paise). No decimals allowed.' }),
  trialDays: Joi.number().integer().min(0),
  features:  featuresSchema,
  isPublic:  Joi.boolean(),
  sortOrder: Joi.number().integer(),
}).min(1); // At least one field required

module.exports = { createPlanSchema, updatePlanSchema };
