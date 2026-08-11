'use strict';

/**
 * Identity Facade
 * 
 * Provides an internal interface to Identity & Tenant domain data.
 * Used by Billing and other domains to fetch required context without
 * directly importing Identity Mongoose models.
 * 
 * Future: This will become a REST client or Redis projection lookup
 * when Identity is physically extracted.
 */

const Plan = require('../../models/Plan.model');
const PlanVersion = require('../../models/PlanVersion.model');
const Tenant = require('../../models/Tenant.model');

/**
 * Fetch a Plan by ID.
 * @param {string} planId 
 * @returns {Promise<Object>} Lean Plan document
 */
const getPlan = async (planId) => {
  return Plan.findById(planId).lean();
};

/**
 * Fetch the default public plan (lowest price).
 * @returns {Promise<Object>} Lean Plan document
 */
const getDefaultPlan = async () => {
  return Plan.findOne({ isActive: true, isPublic: true }).sort({ price: 1 }).lean();
};

/**
 * Fetch a PlanVersion by ID.
 * @param {string} planVersionId 
 * @returns {Promise<Object>} Lean PlanVersion document
 */
const getPlanVersion = async (planVersionId) => {
  return PlanVersion.findById(planVersionId).lean();
};

/**
 * Fetch the minimal Tenant profile required for billing/invoicing.
 * @param {string} tenantId 
 * @returns {Promise<Object>} Lean Tenant document with billing fields
 */
const getTenantBillingProfile = async (tenantId) => {
  return Tenant.findById(tenantId)
    .select('name slug status billingAddress taxId email billingEmail razorpayCustomerId')
    .lean();
};

/**
 * Fetch minimal Tenant profiles for a list of IDs (used to avoid N+1 queries).
 * @param {string[]} tenantIds 
 * @returns {Promise<Object>} Map of tenantId -> Tenant
 */
const getTenantProfiles = async (tenantIds) => {
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select('name slug status billingAddress taxId email billingEmail razorpayCustomerId')
    .lean();
    
  return tenants.reduce((acc, t) => {
    acc[t._id.toString()] = t;
    return acc;
  }, {});
};

/**
 * Update a tenant's current plan and features.
 * Used by Billing when a subscription is created or upgraded.
 * @param {string} tenantId 
 * @param {string} currentPlanId 
 * @param {Map|Object} features 
 * @param {Object} [session] - Optional MongoDB session
 */
const updateTenantFeatures = async (tenantId, currentPlanId, features, session = null) => {
  const options = session ? { session } : {};
  return Tenant.findByIdAndUpdate(tenantId, { currentPlanId, features }, options);
};

/**
 * Update a tenant's status.
 * Used by Billing on cancellation/reactivation.
 * @param {string} tenantId 
 * @param {string} status 
 */
const updateTenantStatus = async (tenantId, status) => {
  return Tenant.findByIdAndUpdate(tenantId, { status });
};

/**
 * Get active/invited user count for a tenant to check seat limits.
 * @param {string} tenantId 
 * @returns {Promise<number>}
 */
const getActiveUserCount = async (tenantId) => {
  const User = require('../../models/User.model');
  return User.countDocuments({
    tenantId,
    status: { $in: ['active', 'invited'] },
  });
};

/**
 * Get the latest PlanVersion for a plan, or create one if none exists.
 * Returns the latest version document.
 * @param {string} planId 
 * @param {Object} plan 
 */
const getLatestPlanVersion = async (planId, plan) => {
  const existing = await PlanVersion.findOne({ planId }).sort({ version: -1 });
  if (existing) return existing;

  return PlanVersion.create({
    planId,
    version:     1,
    name:        plan.name,
    displayName: plan.displayName,
    price:       plan.price,
    currency:    plan.currency,
    interval:    plan.interval,
    features: new Map(Object.entries({
      max_seats:           plan.features.max_seats,
      api_calls_per_month: plan.features.api_calls_per_month,
      storage_gb:          plan.features.storage_gb,
      advanced_analytics:  plan.features.advanced_analytics,
      ai_assistant:        plan.features.ai_assistant,
      priority_support:    plan.features.priority_support,
    })),
    snapshotAt:  new Date(),
  });
};

/**
 * Create a new PlanVersion snapshot for a given plan (used on upgrade).
 * @param {Object} plan 
 * @param {Object} [session] 
 */
const createPlanVersionSnapshot = async (plan, session = null) => {
  const options = session ? { session } : {};
  const latest = await PlanVersion.findOne({ planId: plan._id }).sort({ version: -1 }).session(session || null);
  const nextVersion = (latest?.version || 0) + 1;

  const newVersions = await PlanVersion.create([{
    planId:      plan._id,
    version:     nextVersion,
    name:        plan.name,
    displayName: plan.displayName,
    price:       plan.price,
    currency:    plan.currency,
    interval:    plan.interval,
    features: new Map(Object.entries({
      max_seats:           plan.features.max_seats,
      api_calls_per_month: plan.features.api_calls_per_month,
      storage_gb:          plan.features.storage_gb,
      advanced_analytics:  plan.features.advanced_analytics,
      ai_assistant:        plan.features.ai_assistant,
      priority_support:    plan.features.priority_support,
    })),
    snapshotAt:  new Date(),
  }], options);
  return newVersions[0];
};

module.exports = {
  getPlan,
  getDefaultPlan,
  getPlanVersion,
  getTenantBillingProfile,
  getTenantProfiles,
  updateTenantFeatures,
  updateTenantStatus,
  getActiveUserCount,
  getLatestPlanVersion,
  createPlanVersionSnapshot,
};
