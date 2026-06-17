'use strict';

/**
 * Invoice Validators — Joi schemas
 * REF: docs/SRS.md §6 — Invoices Module
 */

const Joi = require('joi');

const listInvoicesSchema = Joi.object({
  params: Joi.object({ tenantId: Joi.string().required() }),
  body:   Joi.object(),
  query:  Joi.object({
    status:               Joi.string().valid('draft', 'open', 'paid', 'void', 'uncollectible').optional(),
    'periodStart[gte]':   Joi.string().isoDate().optional(),
    'periodStart[lte]':   Joi.string().isoDate().optional(),
    page:                 Joi.number().integer().min(1).default(1),
    limit:                Joi.number().integer().min(1).max(100).default(20),
    sortBy:               Joi.string().valid('createdAt', 'dueDate', 'total').default('createdAt'),
    sortOrder:            Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

const invoiceIdSchema = Joi.object({
  params: Joi.object({ invoiceId: Joi.string().length(24).hex().required() }),
  body:   Joi.object(),
  query:  Joi.object({ tenantId: Joi.string().optional() }),
});

const voidSchema = Joi.object({
  params: Joi.object({ invoiceId: Joi.string().length(24).hex().required() }),
  body:   Joi.object({
    reason: Joi.string().max(500).allow('', null).optional(),
  }),
  query:  Joi.object(),
});

const listAllSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    status:    Joi.string().valid('draft', 'open', 'paid', 'void', 'uncollectible').optional(),
    tenantId:  Joi.string().length(24).hex().optional(),
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

module.exports = {
  listInvoicesSchema,
  invoiceIdSchema,
  voidSchema,
  listAllSchema,
};
