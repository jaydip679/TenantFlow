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

module.exports = {
  getPlatformMetrics,
  listTenants,
  getTenantDetail,
  forceStatusChange,
  listAllInvoices,
  getQueueStats,
};
