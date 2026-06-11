'use strict';

/**
 * Plan Controller
 * Thin HTTP layer — calls plan.service, formats response.
 * REF: docs/SRS.md §4 — Plans Module
 */

const planService       = require('./plan.service');
const { asyncHandler }  = require('../../shared/utils/asyncHandler');

/**
 * GET /plans — Public
 */
const listPlans = asyncHandler(async (req, res) => {
  const plans = await planService.listPublicPlans();
  res.status(200).json({ success: true, data: { plans } });
});

/**
 * GET /plans/:planId — Public
 */
const getPlan = asyncHandler(async (req, res) => {
  const plan = await planService.getPlan(req.params.planId);
  res.status(200).json({ success: true, data: { plan } });
});

/**
 * POST /plans — Super admin only
 */
const createPlan = asyncHandler(async (req, res) => {
  const plan = await planService.createPlan(req.body, req.user);
  res.status(201).json({ success: true, data: { plan } });
});

/**
 * PATCH /plans/:planId — Super admin only
 */
const updatePlan = asyncHandler(async (req, res) => {
  const { plan, version } = await planService.updatePlan(req.params.planId, req.body, req.user);
  res.status(200).json({ success: true, data: { plan, version } });
});

/**
 * DELETE /plans/:planId — Super admin only (archive)
 */
const archivePlan = asyncHandler(async (req, res) => {
  const plan = await planService.archivePlan(req.params.planId, req.user);
  res.status(200).json({ success: true, data: { plan, message: 'Plan archived successfully.' } });
});

module.exports = { listPlans, getPlan, createPlan, updatePlan, archivePlan };
