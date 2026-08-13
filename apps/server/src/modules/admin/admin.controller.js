'use strict';

/**
 * Admin Controller
 * Thin HTTP layer — delegates to adminService.
 * All endpoints require super_admin role.
 *
 * REF: docs/SRS.md §11 — Admin Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §12.1 T9.2
 */

const adminService      = require('./admin.service');
const { asyncHandler }  = require('../../shared/utils/asyncHandler');
const { AppError }      = require('../../shared/errors/AppError');
const { ERROR_CODES }   = require('../../shared/errors/errorCodes');

// ── GET /metrics ──────────────────────────────────────────────
/**
 * Platform-wide MRR, ARR, churn, subscription counts.
 */
const getPlatformMetrics = asyncHandler(async (req, res) => {
  const metrics = await adminService.getPlatformMetrics();
  res.status(200).json({ success: true, data: metrics });
});

// ── GET /tenants ──────────────────────────────────────────────
/**
 * List all tenants with subscription summary, churn score, MRR contribution.
 * Optional query filters: status, planVersionId, riskLevel.
 */
const listTenants = asyncHandler(async (req, res) => {
  const { tenants, pagination } = await adminService.listTenants(
    {
      status:        req.query.status,
      planVersionId: req.query.planVersionId,
      riskLevel:     req.query.riskLevel,
    },
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { tenants, pagination } });
});

// ── GET /tenants/:tenantId ────────────────────────────────────
/**
 * Full tenant detail: profile, members, invoices, event timeline, churn.
 */
const getTenantDetail = asyncHandler(async (req, res) => {
  const detail = await adminService.getTenantDetail(req.params.tenantId);
  res.status(200).json({ success: true, data: detail });
});

// ── PATCH /tenants/:tenantId/status ──────────────────────────
/**
 * Force-change a tenant's status. Admin override — bypasses state machine.
 * Body: { status, reason }
 */
const forceStatusChange = asyncHandler(async (req, res) => {
  const tenant = await adminService.forceStatusChange(
    req.params.tenantId,
    req.body.status,
    req.body.reason,
    req.user.id
  );
  res.status(200).json({ success: true, data: { tenant } });
});

// ── GET /invoices ─────────────────────────────────────────────
/**
 * Cross-tenant invoice list (paginated, optional status/tenantId filter).
 */
const listAllInvoices = asyncHandler(async (req, res) => {
  const { invoices, pagination } = await adminService.listAllInvoices(
    { status: req.query.status, tenantId: req.query.tenantId },
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { invoices, pagination } });
});

// ── GET /queues ───────────────────────────────────────────────
/**
 * BullMQ queue depths and recent failures for all queues.
 */
const getQueueStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getQueueStats();
  res.status(200).json({ success: true, data: stats });
});

/**
 * GET /admin/metrics/mrr-movements?months=6
 */
const getMrrMovements = asyncHandler(async (req, res) => {
  const months = Math.min(parseInt(req.query.months, 10) || 6, 12);
  const data   = await adminService.getMrrMovements(months);
  res.status(200).json({ success: true, data });
});

/**
 * GET /admin/metrics/cash-flow?months=3
 */
const getCashFlowForecast = asyncHandler(async (req, res) => {
  const months = Math.min(parseInt(req.query.months, 10) || 3, 6);
  const data   = await adminService.getCashFlowForecast(months);
  res.status(200).json({ success: true, data });
});

/**
 * GET /admin/metrics/cohort-retention?cohorts=6
 */
const getCohortRetention = asyncHandler(async (req, res) => {
  const cohorts = Math.min(parseInt(req.query.cohorts, 10) || 6, 12);
  const data    = await adminService.getCohortRetention(cohorts);
  res.status(200).json({ success: true, data });
});

/**
 * GET /admin/metrics/forecast
 * Return the most recent revenue forecast document.
 */
const getForecast = asyncHandler(async (req, res) => {
  const RevenueForecast = require('../../models/RevenueForecast.model');
  const doc = await RevenueForecast.findOne({}).sort({ computedAt: -1 }).lean();
  res.status(200).json({ success: true, data: doc || null });
});

/**
 * POST /admin/metrics/forecast/trigger
 * Enqueue a fresh forecast computation job.
 */
const triggerForecast = asyncHandler(async (req, res) => {
  const { enqueueForecastJob } = require('../../queues/forecast.queue');
  
  // Hydrate the payload for Analytics Service
  const adminService = require('./admin.service');
  const history = await adminService.getMrrMovements(6);
  
  const job = await enqueueForecastJob({ history });
  res.status(202).json({ success: true, data: { jobId: job.id, message: 'Forecast job enqueued.' } });
});

module.exports = {
  getPlatformMetrics,
  listTenants,
  getTenantDetail,
  forceStatusChange,
  listAllInvoices,
  getQueueStats,
  getMrrMovements,
  getCashFlowForecast,
  getCohortRetention,
  getForecast,
  triggerForecast,
};
