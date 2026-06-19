'use strict';

/**
 * Admin Dunning Routes
 *
 * Base path: /api/v1/admin/dunning
 * All endpoints require super_admin.
 *
 * REF: docs/SRS.md §11.1 — Admin Module endpoints
 */

const express            = require('express');
const dunningController  = require('./dunning.controller');
const { authenticate }   = require('../../shared/middleware/authenticate.middleware');
const { authorize }      = require('../../shared/middleware/authorize.middleware');
const { validate }       = require('../../shared/middleware/validate.middleware');
const Joi                = require('joi');

const router = express.Router();

const dunningIdSchema = Joi.object({
  params: Joi.object({ dunningId: Joi.string().length(24).hex().required() }),
  body:   Joi.object(),
  query:  Joi.object(),
});

const listSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
});

/**
 * @swagger
 * /admin/dunning:
 *   get:
 *     summary: List active dunning records (super admin)
 *     tags: [admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Active dunning records paginated
 */
router.get('/', authenticate, authorize('super_admin'), validate(listSchema), dunningController.listActiveDunning);

/**
 * @swagger
 * /admin/dunning/{dunningId}/reset:
 *   post:
 *     summary: Reset dunning to step 0
 *     description: |
 *       Resets currentStep=0, sets nextRetryAt=now+1hr, enqueues immediate dunning job.
 *       Only active dunning records can be reset.
 *     tags: [admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dunning reset to step 0
 *       409:
 *         description: DUNNING_ALREADY_RESOLVED
 */
router.post('/:dunningId/reset', authenticate, authorize('super_admin'), validate(dunningIdSchema), dunningController.resetDunning);

/**
 * @swagger
 * /admin/dunning/{dunningId}/abandon:
 *   post:
 *     summary: Manually abandon dunning (write off debt)
 *     description: |
 *       Suspends tenant, marks invoice uncollectible, ends dunning.
 *       Irreversible.
 *     tags: [admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dunning abandoned, tenant suspended
 */
router.post('/:dunningId/abandon', authenticate, authorize('super_admin'), validate(dunningIdSchema), dunningController.abandonDunning);

module.exports = router;
