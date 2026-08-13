'use strict';

const express = require('express');
const { internalAuth } = require('../../shared/middleware/internalAuth.middleware');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const subscriptionService = require('../../modules/subscriptions/subscription.service');
const Subscription = require('../../models/Subscription.model');

const router = express.Router();

// All internal billing routes require the internal service secret
router.use(internalAuth);

/**
 * Create a trial subscription for a tenant (used by Identity Service during registration)
 */
router.post('/subscriptions/trial', asyncHandler(async (req, res) => {
  const { tenantId, planId } = req.body;
  
  if (!tenantId || !planId) {
    return res.status(400).json({ error: 'tenantId and planId are required' });
  }

  // Idempotency check: Don't create if one already exists
  const existing = await Subscription.findOne({
    tenantId,
    status: { $in: ['trialing', 'active'] }
  });

  if (existing) {
    return res.status(200).json({ message: 'Trial subscription already exists', subscriptionId: existing._id });
  }

  const subscription = await subscriptionService.createSubscription(tenantId, planId);
  res.status(201).json({ message: 'Trial subscription created', subscriptionId: subscription._id });
}));

/**
 * Get active subscription count for a plan (used by Identity Service during plan archiving)
 */
router.get('/plans/:planId/subscriptions/count', asyncHandler(async (req, res) => {
  const { planId } = req.params;
  
  const count = await Subscription.countDocuments({
    planId,
    status: { $in: ['trialing', 'active', 'past_due', 'pending_downgrade'] },
  });
  
  res.status(200).json({ count });
}));

module.exports = router;
