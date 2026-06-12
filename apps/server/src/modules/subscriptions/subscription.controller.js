'use strict';

/**
 * Subscription Controller
 * Thin HTTP layer — delegates to subscription.service.
 * REF: docs/SRS.md §5 — Subscriptions Module
 */

const subscriptionService = require('./subscription.service');
const { asyncHandler }    = require('../../shared/utils/asyncHandler');

/**
 * GET /:tenantId — Get current subscription
 */
const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.getSubscription(req.params.tenantId);
  res.status(200).json({ success: true, data: { subscription } });
});

/**
 * POST /:tenantId/upgrade — Upgrade to a higher plan
 */
const upgradeSubscription = asyncHandler(async (req, res) => {
  const { subscription, proratedInvoice } = await subscriptionService.upgradeSubscription(
    req.params.tenantId,
    req.body.targetPlanId,
    req.user,
    req.tenantContext
  );
  res.status(200).json({ success: true, data: { subscription, proratedInvoice } });
});

/**
 * POST /:tenantId/downgrade — Schedule a downgrade
 */
const downgradeSubscription = asyncHandler(async (req, res) => {
  const result = await subscriptionService.downgradeSubscription(
    req.params.tenantId,
    req.body.targetPlanId,
    req.body.reason,
    req.user,
    req.tenantContext
  );
  res.status(200).json({ success: true, data: result });
});

/**
 * DELETE /:tenantId/cancel-downgrade — Cancel a pending downgrade
 */
const cancelDowngrade = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelDowngrade(req.params.tenantId, req.user);
  res.status(200).json({ success: true, data: { subscription, message: 'Pending downgrade cancelled.' } });
});

/**
 * POST /:tenantId/cancel — Cancel subscription
 */
const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(
    req.params.tenantId,
    { cancelAtPeriodEnd: req.body.cancelAtPeriodEnd, reason: req.body.reason },
    req.user
  );
  res.status(200).json({ success: true, data: { subscription } });
});

/**
 * POST /:tenantId/reactivate — Reactivate cancelled subscription
 */
const reactivateSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.reactivateSubscription(req.params.tenantId, req.user);
  res.status(200).json({ success: true, data: { subscription } });
});

/**
 * POST /:tenantId/pause — Pause subscription
 */
const pauseSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.pauseSubscription(
    req.params.tenantId,
    req.body.pauseEndsAt ? new Date(req.body.pauseEndsAt) : null,
    req.user
  );
  res.status(200).json({ success: true, data: { subscription } });
});

/**
 * POST /:tenantId/resume — Resume paused subscription
 */
const resumeSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.resumeSubscription(req.params.tenantId, req.user);
  res.status(200).json({ success: true, data: { subscription } });
});

/**
 * GET /:tenantId/events — Subscription event history
 */
const getSubscriptionEvents = asyncHandler(async (req, res) => {
  const { events, pagination } = await subscriptionService.getSubscriptionEvents(
    req.params.tenantId,
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { events, pagination } });
});

module.exports = {
  getSubscription,
  upgradeSubscription,
  downgradeSubscription,
  cancelDowngrade,
  cancelSubscription,
  reactivateSubscription,
  pauseSubscription,
  resumeSubscription,
  getSubscriptionEvents,
};
