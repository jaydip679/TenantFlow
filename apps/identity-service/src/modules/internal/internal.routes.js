'use strict';

const express = require('express');
const { internalAuth } = require('../../shared/middleware/internalAuth.middleware');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const Tenant = require('../../models/Tenant.model');
const Plan = require('../../models/Plan.model');
const PlanVersion = require('../../models/PlanVersion.model');
const User = require('../../models/User.model');

const router = express.Router();

router.use(internalAuth);

// GET /tenants/:tenantId/scope
router.get('/tenants/:tenantId/scope', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.tenantId).lean();
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  
  const usedSeats = await User.countDocuments({
    tenantId: req.params.tenantId,
    status: { $in: ['active', 'invited'] },
  });

  res.status(200).json({
    tenantId: tenant._id.toString(),
    status: tenant.status,
    currentPlanId: tenant.currentPlanId,
    features: tenant.features,
    usedSeats
  });
}));

// GET /tenants/:tenantId/billing-profile
router.get('/tenants/:tenantId/billing-profile', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.tenantId)
    .select('name slug status billingAddress taxId email billingEmail razorpayCustomerId createdAt')
    .lean();
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.status(200).json(tenant);
}));

// POST /tenants/profiles
router.post('/tenants/profiles', asyncHandler(async (req, res) => {
  const { tenantIds } = req.body;
  if (!Array.isArray(tenantIds)) return res.status(400).json({ error: 'tenantIds must be an array' });
  
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select('name slug status billingAddress taxId email billingEmail razorpayCustomerId')
    .lean();
    
  const profiles = tenants.reduce((acc, t) => {
    acc[t._id.toString()] = t;
    return acc;
  }, {});
  
  res.status(200).json(profiles);
}));


// GET /tenants/:tenantId/users/count
router.get('/tenants/:tenantId/users/count', asyncHandler(async (req, res) => {
  const count = await User.countDocuments({
    tenantId: req.params.tenantId,
    status: { $in: ['active', 'invited'] },
  });
  res.status(200).json({ count });
}));

// GET /tenants/:tenantId/users
router.get('/tenants/:tenantId/users', asyncHandler(async (req, res) => {
  const users = await User.find({ tenantId: req.params.tenantId, deletedAt: null })
    .select('name email role status lastLoginAt createdAt')
    .sort({ createdAt: 1 })
    .lean();
  res.status(200).json(users);
}));

// GET /plans/default
router.get('/plans/default', asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ isActive: true, isPublic: true }).sort({ price: 1 }).lean();
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.status(200).json(plan);
}));

// GET /plans/:planId
router.get('/plans/:planId', asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.planId).lean();
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.status(200).json(plan);
}));

// GET /plan-versions/:planVersionId
router.get('/plan-versions/:planVersionId', asyncHandler(async (req, res) => {
  const planVersion = await PlanVersion.findById(req.params.planVersionId).lean();
  if (!planVersion) return res.status(404).json({ error: 'PlanVersion not found' });
  res.status(200).json(planVersion);
}));

// POST /plans/:planId/snapshot
router.post('/plans/:planId/snapshot', asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.planId).lean();
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  
  const latest = await PlanVersion.findOne({ planId: plan._id }).sort({ version: -1 });
  const nextVersion = (latest?.version || 0) + 1;

  const [newPV] = await PlanVersion.create([{
    planId:      plan._id,
    version:     nextVersion,
    name:        plan.name,
    displayName: plan.displayName,
    price:       plan.price,
    currency:    plan.currency,
    interval:    plan.interval,
    features:    plan.features,
    snapshotAt:  new Date(),
  }]);

  res.status(201).json(newPV);
}));

// POST /seed
router.post('/seed', asyncHandler(async (req, res) => {
  const { seeder } = require('../../config/seeder');
  await seeder();
  res.status(200).json({ success: true });
}));

module.exports = router;
