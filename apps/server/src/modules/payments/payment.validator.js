'use strict';

/**
 * Payment Validators — Joi schemas
 * REF: docs/SRS.md §7 — Payments Module
 */

const Joi = require('joi');

const createOrderSchema = Joi.object({
  params: Joi.object(),
  body: Joi.object({
    invoiceId: Joi.string().length(24).hex().required()
      .messages({ 'string.length': 'invoiceId must be a valid MongoDB ObjectId' }),
  }),
  query: Joi.object(),
});

const verifyPaymentSchema = Joi.object({
  params: Joi.object(),
  body: Joi.object({
    razorpayOrderId:   Joi.string().required(),
    razorpayPaymentId: Joi.string().required(),
    razorpaySignature: Joi.string().required(),
  }),
  query: Joi.object(),
});

const paymentHistorySchema = Joi.object({
  params: Joi.object({ tenantId: Joi.string().required() }),
  body:   Joi.object(),
  query:  Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
});

const refundSchema = Joi.object({
  params: Joi.object({ transactionId: Joi.string().length(24).hex().required() }),
  body:   Joi.object({
    reason: Joi.string().max(500).allow('', null).optional(),
  }),
  query:  Joi.object(),
});

module.exports = {
  createOrderSchema,
  verifyPaymentSchema,
  paymentHistorySchema,
  refundSchema,
};
