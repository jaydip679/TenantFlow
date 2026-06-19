'use strict';

/**
 * Dunning Controller
 * Thin HTTP layer for admin dunning endpoints.
 * REF: docs/SRS.md §11.1 — Admin dunning endpoints
 */

const dunningService = require('./dunning.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');

/**
 * GET /admin/dunning — List active dunning records
 */
const listActiveDunning = asyncHandler(async (req, res) => {
  const { records, pagination } = await dunningService.listActiveDunning({
    page:  req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json({ success: true, data: { records, pagination } });
});

/**
 * POST /admin/dunning/:dunningId/reset — Reset dunning to step 0
 */
const resetDunning = asyncHandler(async (req, res) => {
  const record = await dunningService.resetDunning(req.params.dunningId, req.user);
  res.status(200).json({ success: true, data: { record } });
});

/**
 * POST /admin/dunning/:dunningId/abandon — Manually abandon dunning
 */
const abandonDunning = asyncHandler(async (req, res) => {
  await dunningService.manualAbandon(req.params.dunningId, req.user);
  res.status(200).json({ success: true, data: { message: 'Dunning record abandoned. Tenant will be suspended.' } });
});

module.exports = { listActiveDunning, resetDunning, abandonDunning };
