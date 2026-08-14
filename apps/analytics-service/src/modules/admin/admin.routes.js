'use strict';

/**
 * Admin Routes
 *
 * Base path: /api/v1/admin
 * All routes: authenticate + authorize('super_admin')
 * No tenantScope middleware — these are cross-tenant operations.
 *
 * Note: /dunning/* routes are mounted separately from Phase 6
 *       at /api/v1/admin/dunning in app.js — they use the same
 *       dunning.controller from payments module.
 *
 * REF: docs/SRS.md §11 — Admin Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §12.1 T9.2
 */

const express           = require('express');
const adminController   = require('./admin.controller');

const { authorize }     = require('../../shared/middleware/authorize.middleware');
const { validate }      = require('../../shared/middleware/validate.middleware');
const Joi               = require('joi');

const router = express.Router();

// ── Shared Schemas ────────────────────────────────────────────
const paginationSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
});

const tenantIdParamSchema = Joi.object({
  params: Joi.object({ tenantId: Joi.string().length(24).hex().required() }),
  body:   Joi.object(),
  query:  Joi.object(),
});


const listTenantsSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    page:          Joi.number().integer().min(1).default(1),
    limit:         Joi.number().integer().min(1).max(100).default(20),
    status:        Joi.string().valid('active', 'trialing', 'suspended', 'cancelled').optional(),
    planVersionId: Joi.string().length(24).hex().optional(),
    riskLevel:     Joi.string().valid('low', 'medium', 'high').optional(),
  }),
});

const listInvoicesSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    page:     Joi.number().integer().min(1).default(1),
    limit:    Joi.number().integer().min(1).max(100).default(20),
    status:   Joi.string().valid('open', 'paid', 'void', 'uncollectible').optional(),
    tenantId: Joi.string().length(24).hex().optional(),
  }),
});

// Middleware shorthand
const adminAuth = [authorize('super_admin')];

// ── Routes ────────────────────────────────────────────────────

/**
 * GET /metrics — Platform MRR, ARR, churn, subscription counts
 */
router.get('/metrics', ...adminAuth, adminController.getPlatformMetrics);

/**
 * GET /tenants — List tenants with subscription + churn summary
 */
router.get('/tenants', ...adminAuth, validate(listTenantsSchema), adminController.listTenants);

/**
 * GET /tenants/:tenantId — Full tenant detail
 */
router.get('/tenants/:tenantId', ...adminAuth, validate(tenantIdParamSchema), adminController.getTenantDetail);


/**
 * GET /invoices — Cross-tenant invoice list
 */
router.get('/invoices', ...adminAuth, validate(listInvoicesSchema), adminController.listAllInvoices);

/**
 * GET /queues — BullMQ queue stats
 */
router.get('/queues', ...adminAuth, adminController.getQueueStats);

/**
 * GET /metrics/mrr-movements?months=6
 * MRR waterfall: New, Expansion, Contraction, Churned, Reactivation per month + NRR + Quick Ratio
 */
router.get('/metrics/mrr-movements', ...adminAuth, adminController.getMrrMovements);

/**
 * GET /metrics/cash-flow?months=3
 * 90-day renewal calendar with expected MRR per month and at-risk flags
 */
router.get('/metrics/cash-flow', ...adminAuth, adminController.getCashFlowForecast);

/**
 * GET /metrics/cohort-retention?cohorts=6
 * Monthly cohort retention heat-map matrix
 */
router.get('/metrics/cohort-retention', ...adminAuth, adminController.getCohortRetention);

/**
 * GET  /metrics/forecast         — Latest revenue forecast + AI narrative
 * POST /metrics/forecast/trigger — Enqueue a fresh forecast computation job
 */
router.get( '/metrics/forecast',         ...adminAuth, adminController.getForecast);
router.post('/metrics/forecast/trigger', ...adminAuth, adminController.triggerForecast);

module.exports = router;
