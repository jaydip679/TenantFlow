'use strict';

/**
 * AI Routes
 *
 * Base path: /api/v1/ai
 *
 * REF: docs/SRS.md §10 — AI Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.5
 */

const express         = require('express');
const aiController    = require('./ai.controller');
const { authenticate }  = require('../../shared/middleware/authenticate.middleware');
const { authorize }     = require('../../shared/middleware/authorize.middleware');
const { tenantScope }   = require('../../shared/middleware/tenantScope.middleware');
const { validate }      = require('../../shared/middleware/validate.middleware');
const Joi               = require('joi');

const router = express.Router();

// ── Validation Schemas ────────────────────────────────────────
const tenantIdParamSchema = Joi.object({
  params: Joi.object({ tenantId: Joi.string().length(24).hex().required() }),
  body:   Joi.object(),
  query:  Joi.object({ page: Joi.number().integer().min(1), limit: Joi.number().integer().min(1).max(100) }),
});

const chatSchema = Joi.object({
  params: Joi.object(),
  query:  Joi.object(),
  body: Joi.object({
    message: Joi.string().min(1).max(2000).required(),
    conversationHistory: Joi.array().items(
      Joi.object({
        role:    Joi.string().valid('user', 'assistant').required(),
        content: Joi.string().max(5000).required(),
      })
    ).max(10).default([]),
  }),
});

// ── Churn Endpoints (super_admin only) ────────────────────────

/**
 * GET /all — All churn scores sorted by risk
 * NOTE: Must be registered BEFORE /:tenantId to avoid param conflict
 */
router.get('/churn/all',
  authenticate,
  authorize('super_admin'),
  aiController.getAllChurnScores
);

/**
 * GET /:tenantId — Get latest churn score for a tenant
 */
router.get('/churn/:tenantId',
  authenticate,
  authorize('super_admin'),
  validate(tenantIdParamSchema),
  aiController.getChurnScore
);

/**
 * POST /trigger/:tenantId — Manually trigger churn analysis
 */
router.post('/churn/trigger/:tenantId',
  authenticate,
  authorize('super_admin'),
  validate(tenantIdParamSchema),
  aiController.triggerChurnAnalysis
);

// ── Chat Endpoint (tenant_admin, requires ai_assistant feature) ─

/**
 * POST /chat — AI billing assistant (SSE streaming)
 */
router.post('/chat',
  authenticate,
  tenantScope(),
  authorize('tenant_admin'),
  validate(chatSchema),
  aiController.chat
);

module.exports = router;
