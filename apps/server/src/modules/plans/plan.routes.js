'use strict';

/**
 * Plans Routes
 *
 * Public endpoints: GET / and GET /:planId (no auth required)
 * Super admin endpoints: POST /, PATCH /:planId, DELETE /:planId
 *
 * REF: docs/SRS.md §4 — Plans Module
 */

const express          = require('express');
const planController   = require('./plan.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { authorize }    = require('../../shared/middleware/authorize.middleware');
const { validate }     = require('../../shared/middleware/validate.middleware');
const { createPlanSchema, updatePlanSchema } = require('./plan.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: plans
 *   description: Plan catalog management
 */

/**
 * @swagger
 * /plans:
 *   get:
 *     summary: List all public active plans
 *     description: Returns all plans where isActive=true and isPublic=true, sorted by sortOrder.
 *     tags: [plans]
 *     security: []
 *     responses:
 *       200:
 *         description: List of public plans
 */
router.get('/', planController.listPlans);

/**
 * @swagger
 * /plans/{planId}:
 *   get:
 *     summary: Get plan by ID
 *     description: Returns any plan by ID (including archived, for super admin purposes).
 *     tags: [plans]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan details
 *       404:
 *         description: Plan not found
 */
router.get('/:planId', planController.getPlan);

/**
 * @swagger
 * /plans:
 *   post:
 *     summary: Create a new plan
 *     description: |
 *       Super admin only. Creates a new plan and an initial PlanVersion snapshot (version 1).
 *       Price must be an integer in paise (₹1 = 100 paise).
 *     tags: [plans]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, displayName, price, interval]
 *             properties:
 *               name:        { type: string, example: starter }
 *               displayName: { type: string, example: Starter }
 *               description: { type: string }
 *               price:       { type: integer, example: 99900, description: "Price in paise (₹999 = 99900)" }
 *               interval:    { type: string, enum: [monthly, annual] }
 *               trialDays:   { type: integer, example: 14 }
 *               features:
 *                 type: object
 *                 properties:
 *                   max_seats:           { type: integer }
 *                   api_calls_per_month: { type: integer }
 *                   storage_gb:          { type: number }
 *                   advanced_analytics:  { type: boolean }
 *                   ai_assistant:        { type: boolean }
 *                   priority_support:    { type: boolean }
 *     responses:
 *       201:
 *         description: Plan created
 *       403:
 *         description: Not super admin
 */
router.post('/', authenticate, authorize('super_admin'), validate(createPlanSchema), planController.createPlan);

/**
 * @swagger
 * /plans/{planId}:
 *   patch:
 *     summary: Update an existing plan
 *     description: |
 *       Super admin only.
 *       Creates a PlanVersion snapshot of the CURRENT state BEFORE applying updates.
 *       Existing subscriptions (which reference planVersionId) are NOT affected.
 *     tags: [plans]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan updated, version snapshot created
 *       404:
 *         description: Plan not found
 *       409:
 *         description: Cannot update archived plan
 */
router.patch('/:planId', authenticate, authorize('super_admin'), validate(updatePlanSchema), planController.updatePlan);

/**
 * @swagger
 * /plans/{planId}:
 *   delete:
 *     summary: Archive a plan
 *     description: |
 *       Super admin only. Sets isActive=false. Does NOT delete the document.
 *       Returns 409 if any active subscriptions reference this plan.
 *     tags: [plans]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan archived
 *       409:
 *         description: Plan has active subscriptions (PLAN_HAS_ACTIVE_SUBSCRIPTIONS)
 */
router.delete('/:planId', authenticate, authorize('super_admin'), planController.archivePlan);

module.exports = router;
