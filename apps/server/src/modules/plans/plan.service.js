'use strict';

/**
 * Plan Service
 *
 * Business logic for the plan catalog.
 * Methods:
 *   createPlan(data)              → Plan
 *   updatePlan(planId, updates)   → { plan, version }  — creates PlanVersion snapshot FIRST
 *   archivePlan(planId)           → Plan               — 409 if active subscriptions exist
 *   listPublicPlans()             → Plan[]             — only isActive=true, isPublic=true
 *   getPlan(planId)               → Plan               — any plan (super admin view)
 *
 * REF: docs/SRS.md §4 — Plans Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.2
 */

'use strict';

const Plan         = require('../../models/Plan.model');
const PlanVersion  = require('../../models/PlanVersion.model');
const { AppError } = require('../../shared/errors/AppError');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');
const { createAuditLog } = require('../../shared/utils/auditLogService');

/**
 * Create a new plan. Super admin only.
 *
 * @param {Object} data - Plan fields
 * @param {Object} actor - req.user (for audit log)
 * @returns {Promise<Plan>}
 */
const createPlan = async (data, actor) => {
  const plan = await Plan.create(data);

  // Create initial PlanVersion snapshot (version 1)
  await PlanVersion.create({
    planId:      plan._id,
    version:     1,
    name:        plan.name,
    displayName: plan.displayName,
    price:       plan.price,
    currency:    plan.currency,
    interval:    plan.interval,
    features:    plan.features,
    snapshotAt:  new Date(),
  });

  await createAuditLog({
    event:        'plan.created',
    resourceType: 'plan',
    resourceId:   plan._id,
    actor,
    after:        plan.toObject(),
  });

  return plan;
};

/**
 * Update an existing plan.
 *
 * ⚠️ CRITICAL: A PlanVersion snapshot MUST be created BEFORE updating the plan.
 * Existing subscriptions reference the old planVersionId — they are unaffected.
 * New subscriptions will reference the new version.
 *
 * @param {string} planId
 * @param {Object} updates
 * @param {Object} actor
 * @returns {Promise<{ plan: Plan, version: PlanVersion }>}
 */
const updatePlan = async (planId, updates, actor) => {
  const existingPlan = await Plan.findById(planId);
  if (!existingPlan) {
    throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  if (!existingPlan.isActive) {
    throw new AppError('Cannot update an archived plan.', 409, ERROR_CODES.PLAN_ARCHIVED);
  }

  // Step 1: Determine next version number
  const latestVersion = await PlanVersion.findOne({ planId }, null, { sort: { version: -1 } }).lean();
  const nextVersion   = (latestVersion?.version || 0) + 1;

  // Step 2: Snapshot the CURRENT state BEFORE applying updates
  const version = await PlanVersion.create({
    planId,
    version:     nextVersion,
    name:        existingPlan.name,
    displayName: existingPlan.displayName,
    price:       existingPlan.price,
    currency:    existingPlan.currency,
    interval:    existingPlan.interval,
    features:    existingPlan.features,
    snapshotAt:  new Date(),
  });

  // Step 3: Apply the update to the live Plan document
  const before = existingPlan.toObject();
  const plan   = await Plan.findByIdAndUpdate(planId, updates, { new: true, runValidators: true });

  await createAuditLog({
    event:        'plan.updated',
    resourceType: 'plan',
    resourceId:   plan._id,
    actor,
    before,
    after:        plan.toObject(),
  });

  return { plan, version };
};

/**
 * Archive a plan (set isActive=false).
 * Cannot archive if active subscriptions reference this plan.
 *
 * @param {string} planId
 * @param {Object} actor
 * @returns {Promise<Plan>}
 */
const archivePlan = async (planId, actor) => {
  const plan = await Plan.findById(planId);
  if (!plan) throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
  if (!plan.isActive) throw new AppError('Plan is already archived.', 409, ERROR_CODES.PLAN_ARCHIVED);

  // Check for active subscriptions via Billing Facade
  const billingFacade = require('../../shared/facades/billing.facade');
  const activeSubCount = await billingFacade.getActiveSubscriptionCountByPlan(planId);

  if (activeSubCount > 0) {
    throw new AppError(
      `Cannot archive plan — ${activeSubCount} active subscription(s) currently reference it.`,
      409,
      ERROR_CODES.PLAN_HAS_ACTIVE_SUBSCRIPTIONS
    );
  }

  const before = plan.toObject();
  plan.isActive = false;
  await plan.save();

  await createAuditLog({
    event:        'plan.archived',
    resourceType: 'plan',
    resourceId:   plan._id,
    actor,
    before,
    after:        plan.toObject(),
  });

  return plan;
};

/**
 * List public active plans. Available to unauthenticated users.
 * Sorted by sortOrder ascending (as defined in seeder).
 *
 * @returns {Promise<Plan[]>}
 */
const listPublicPlans = async () =>
  Plan.find({ isActive: true, isPublic: true })
    .sort({ sortOrder: 1 })
    .lean();

/**
 * Get any plan by ID (super admin view — includes archived/private plans).
 *
 * @param {string} planId
 * @returns {Promise<Plan>}
 */
const getPlan = async (planId) => {
  const plan = await Plan.findById(planId).lean();
  if (!plan) throw new AppError('Plan not found.', 404, ERROR_CODES.NOT_FOUND);
  return plan;
};

module.exports = { createPlan, updatePlan, archivePlan, listPublicPlans, getPlan };
