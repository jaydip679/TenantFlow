'use strict';

/**
 * Subscription Routes
 *
 * Middleware order (MUST NOT be changed):
 *   authenticate → tenantScope() → authorize(...roles) → validate(schema) → controller
 *
 * REF: docs/SRS.md §5.1 — Subscription endpoint specifications
 */

const express                  = require('express');
const subscriptionController   = require('./subscription.controller');
const { authenticate }         = require('../../shared/middleware/authenticate.middleware');
const { authorize }            = require('../../shared/middleware/authorize.middleware');
const { tenantScope }          = require('../../shared/middleware/tenantScope.middleware');
const { validate }             = require('../../shared/middleware/validate.middleware');
const {
  upgradeSchema,
  downgradeSchema,
  cancelSchema,
  pauseSchema,
  paginationSchema,
} = require('./subscription.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: subscriptions
 *   description: Subscription lifecycle management
 */

/**
 * @swagger
 * /subscriptions/{tenantId}:
 *   get:
 *     summary: Get current subscription
 *     description: Returns the tenant's active subscription with populated plan and planVersion.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subscription details
 *       404:
 *         description: SUBSCRIPTION_NOT_FOUND
 */
router.get(
  '/:tenantId',
  authenticate,
  tenantScope(),
  subscriptionController.getSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/upgrade:
 *   post:
 *     summary: Upgrade to a higher-priced plan
 *     description: |
 *       Runs inside MongoDB transaction. Creates proration Invoice (open) if netAmount > 0.
 *       Immediately applies new plan features to tenant.
 *       Returns 422 SEAT_CONFLICT if new plan has fewer seats than current members.
 *       Returns 422 UPGRADE_REQUIRED if target plan price is not higher.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string, example: "64a1b2c3d4e5f6789012abc1" }
 *     responses:
 *       200:
 *         description: Subscription upgraded, proration invoice created
 *       422:
 *         description: SEAT_CONFLICT | UPGRADE_REQUIRED | PLAN_ARCHIVED | SUBSCRIPTION_INVALID_TRANSITION
 */
router.post(
  '/:tenantId/upgrade',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(upgradeSchema),
  subscriptionController.upgradeSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/downgrade:
 *   post:
 *     summary: Schedule a downgrade to a lower-priced plan
 *     description: |
 *       No immediate charge. Sets pendingPlanId and status=pending_downgrade.
 *       Downgrade applied at currentPeriodEnd by billingRenew cron.
 *       Returns 422 SEAT_CONFLICT if new plan can't accommodate current members.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPlanId]
 *             properties:
 *               targetPlanId: { type: string }
 *               reason:       { type: string }
 *     responses:
 *       200:
 *         description: Downgrade scheduled
 */
router.post(
  '/:tenantId/downgrade',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(downgradeSchema),
  subscriptionController.downgradeSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/cancel-downgrade:
 *   delete:
 *     summary: Cancel a pending downgrade
 *     description: Restores subscription to 'active' status, clears pendingPlanId.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Downgrade cancelled
 *       404:
 *         description: NO_PENDING_DOWNGRADE
 */
router.delete(
  '/:tenantId/cancel-downgrade',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  subscriptionController.cancelDowngrade
);

/**
 * @swagger
 * /subscriptions/{tenantId}/cancel:
 *   post:
 *     summary: Cancel subscription
 *     description: |
 *       Two modes:
 *       - cancelAtPeriodEnd=true: Access continues until currentPeriodEnd. No refund.
 *       - cancelAtPeriodEnd=false: Immediate cancellation. Tenant.status → 'cancelled'.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancelAtPeriodEnd]
 *             properties:
 *               cancelAtPeriodEnd: { type: boolean }
 *               reason:            { type: string }
 *     responses:
 *       200:
 *         description: Subscription cancelled
 *       409:
 *         description: SUBSCRIPTION_ALREADY_CANCELLED
 */
router.post(
  '/:tenantId/cancel',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(cancelSchema),
  subscriptionController.cancelSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/reactivate:
 *   post:
 *     summary: Reactivate a cancelled subscription
 *     description: Creates a new trial period (if plan has trialDays > 0) or activates immediately.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription reactivated
 */
router.post(
  '/:tenantId/reactivate',
  authenticate,
  tenantScope({ allowSuspended: true }),
  authorize('tenant_admin', 'super_admin'),
  subscriptionController.reactivateSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/pause:
 *   post:
 *     summary: Pause subscription
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pauseEndsAt: { type: string, format: date-time, description: "Optional auto-resume date" }
 *     responses:
 *       200:
 *         description: Subscription paused
 */
router.post(
  '/:tenantId/pause',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(pauseSchema),
  subscriptionController.pauseSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/resume:
 *   post:
 *     summary: Resume a paused subscription
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription resumed
 */
router.post(
  '/:tenantId/resume',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  subscriptionController.resumeSubscription
);

/**
 * @swagger
 * /subscriptions/{tenantId}/events:
 *   get:
 *     summary: Subscription event history
 *     description: Returns paginated list of all subscription state changes for a tenant.
 *     tags: [subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated event list
 */
router.get(
  '/:tenantId/events',
  authenticate,
  tenantScope(),
  validate(paginationSchema),
  subscriptionController.getSubscriptionEvents
);

/**
 * POST /:tenantId/subscribe — First-time plan selection
 * Called when a user has no existing subscription and picks a plan.
 */
router.post(
  '/:tenantId/subscribe',
  authenticate,
  tenantScope({ allowSuspended: true }),
  authorize('tenant_admin', 'super_admin'),
  subscriptionController.subscribeToplan
);

module.exports = router;
