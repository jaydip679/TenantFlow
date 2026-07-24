'use strict';

/**
 * Health Controller
 *
 * Thin HTTP layer for health score and expansion opportunity endpoints.
 * All business logic lives in health.service.js.
 *
 * REF: health.service.js
 */

const healthService    = require('./health.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');

/**
 * GET /admin/health-scores
 * Paginated list of all tenant health scores, worst first.
 */
const getHealthScores = asyncHandler(async (req, res) => {
  const { scores, pagination } = await healthService.getHealthScores({
    page:  req.query.page,
    limit: req.query.limit,
    grade: req.query.grade,
  });
  res.status(200).json({ success: true, data: { scores, pagination } });
});

/**
 * GET /admin/health-scores/:tenantId
 * Single tenant health score. Auto-computes on first access.
 */
const getHealthScore = asyncHandler(async (req, res) => {
  const score = await healthService.getHealthScore(req.params.tenantId);
  res.status(200).json({ success: true, data: { score } });
});

/**
 * POST /admin/health-scores/compute
 * Trigger a fresh computation for all active tenants (or a specific one).
 *
 * Body: { tenantId? } — if omitted, computes for all tenants.
 */
const computeHealthScores = asyncHandler(async (req, res) => {
  if (req.body.tenantId) {
    const doc = await healthService.computeHealthScore(req.body.tenantId);
    return res.status(200).json({ success: true, data: { score: doc } });
  }
  const result = await healthService.computeAllHealthScores();
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /admin/metrics/expansion-opportunities?limit=20
 * Ranked list of tenants who are strong upgrade candidates.
 */
const getExpansionOpportunities = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const data  = await healthService.getExpansionOpportunities(limit);
  res.status(200).json({ success: true, data });
});

module.exports = {
  getHealthScores,
  getHealthScore,
  computeHealthScores,
  getExpansionOpportunities,
};
