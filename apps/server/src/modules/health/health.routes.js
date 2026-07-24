'use strict';

/**
 * Health Routes
 *
 * All routes require super_admin authentication.
 *
 * GET  /admin/health-scores                          — List all scores (worst first)
 * GET  /admin/health-scores/:tenantId                — Single tenant score
 * POST /admin/health-scores/compute                  — Trigger recompute
 * GET  /admin/metrics/expansion-opportunities        — Ranked expansion candidates
 *
 * Mounted at /api/v1/admin via app.js
 */

const express          = require('express');
const healthController = require('./health.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { authorize }    = require('../../shared/middleware/authorize.middleware');

const router    = express.Router();
const adminAuth = [authenticate, authorize('super_admin')];

// Health Scores
router.get( '/health-scores',             ...adminAuth, healthController.getHealthScores);
router.post('/health-scores/compute',     ...adminAuth, healthController.computeHealthScores);
router.get( '/health-scores/:tenantId',   ...adminAuth, healthController.getHealthScore);

// Expansion Opportunities
router.get('/metrics/expansion-opportunities', ...adminAuth, healthController.getExpansionOpportunities);

module.exports = router;
