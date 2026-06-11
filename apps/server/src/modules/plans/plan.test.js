'use strict';

/**
 * Plan Service Tests
 *
 * Tests Phase 2 acceptance criteria from IMPLEMENTATION_ROADMAP.md §5.2:
 *   - createPlan: creates plan + initial PlanVersion snapshot
 *   - listPublicPlans: only isActive=true, isPublic=true returned
 *   - getPlan: 404 for unknown planId
 *   - updatePlan: creates PlanVersion snapshot BEFORE applying update
 *   - updatePlan on archived plan: 409 PLAN_ARCHIVED
 *   - archivePlan: sets isActive=false
 *   - archivePlan with active subscriptions: 409 PLAN_HAS_ACTIVE_SUBSCRIPTIONS
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.2 — Phase 2 acceptance criteria
 */

jest.mock('../../models/Plan.model');
jest.mock('../../models/PlanVersion.model');
// Subscription model is a Phase 3 concern — stub it entirely
jest.mock('../../models/Subscription.model', () => ({
  countDocuments: jest.fn(),
}), { virtual: true });
jest.mock('../../shared/utils/auditLogService', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const Plan         = require('../../models/Plan.model');
const PlanVersion  = require('../../models/PlanVersion.model');
const Subscription = require('../../models/Subscription.model');
const planService  = require('./plan.service');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');

// ── Helpers ───────────────────────────────────────────────────
const makePlan = (overrides = {}) => ({
  _id:         '64a1b2c3d4e5f6789012abc1',
  name:        'starter',
  displayName: 'Starter',
  price:       99900,
  currency:    'INR',
  interval:    'monthly',
  trialDays:   14,
  isActive:    true,
  isPublic:    true,
  sortOrder:   1,
  features:    { max_seats: 5 },
  toObject:    jest.fn().mockReturnValue({ name: 'starter' }),
  save:        jest.fn(),
  ...overrides,
});

const actor = { id: 'user-id-1', role: 'super_admin', email: 'admin@test.com' };

beforeEach(() => jest.clearAllMocks());

// ── createPlan() ──────────────────────────────────────────────
describe('planService.createPlan()', () => {
  it('creates a plan and initial PlanVersion snapshot (version 1)', async () => {
    const plan = makePlan();
    Plan.create       = jest.fn().mockResolvedValue(plan);
    PlanVersion.create = jest.fn().mockResolvedValue({});

    const result = await planService.createPlan({ name: 'starter', price: 99900, interval: 'monthly' }, actor);

    expect(Plan.create).toHaveBeenCalledTimes(1);
    expect(PlanVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ planId: plan._id, version: 1 })
    );
    expect(result).toHaveProperty('_id');
  });
});

// ── listPublicPlans() ─────────────────────────────────────────
describe('planService.listPublicPlans()', () => {
  it('queries only isActive=true and isPublic=true, sorted by sortOrder', async () => {
    const fakePlans = [makePlan()];
    Plan.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(fakePlans) }),
    });

    const result = await planService.listPublicPlans();

    expect(Plan.find).toHaveBeenCalledWith({ isActive: true, isPublic: true });
    expect(result).toHaveLength(1);
  });
});

// ── getPlan() ─────────────────────────────────────────────────
describe('planService.getPlan()', () => {
  it('returns plan by ID', async () => {
    Plan.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makePlan()) });
    const result = await planService.getPlan('64a1b2c3d4e5f6789012abc1');
    expect(result).toHaveProperty('name', 'starter');
  });

  it('throws NOT_FOUND for unknown planId', async () => {
    Plan.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    await expect(planService.getPlan('unknown')).rejects.toMatchObject({ errorCode: ERROR_CODES.NOT_FOUND });
  });
});

// ── updatePlan() ──────────────────────────────────────────────
describe('planService.updatePlan()', () => {
  it('creates a PlanVersion snapshot BEFORE updating the plan', async () => {
    const plan = makePlan();
    Plan.findById = jest.fn().mockResolvedValue(plan);
    PlanVersion.findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ version: 2 }),
    });
    PlanVersion.create      = jest.fn().mockResolvedValue({ version: 3 });
    Plan.findByIdAndUpdate  = jest.fn().mockResolvedValue(plan);

    const result = await planService.updatePlan(plan._id, { price: 119900 }, actor);

    // Snapshot created FIRST
    expect(PlanVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ planId: plan._id, version: 3 })
    );
    // Then plan updated
    expect(Plan.findByIdAndUpdate).toHaveBeenCalledWith(
      plan._id,
      { price: 119900 },
      expect.any(Object)
    );
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('version');
  });

  it('throws PLAN_ARCHIVED when trying to update an archived plan', async () => {
    Plan.findById = jest.fn().mockResolvedValue(makePlan({ isActive: false }));
    await expect(planService.updatePlan('planId', { price: 100 }, actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.PLAN_ARCHIVED });
  });

  it('throws NOT_FOUND when plan does not exist', async () => {
    Plan.findById = jest.fn().mockResolvedValue(null);
    await expect(planService.updatePlan('unknown', {}, actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.NOT_FOUND });
  });
});

// ── archivePlan() ─────────────────────────────────────────────
describe('planService.archivePlan()', () => {
  it('sets isActive=false and saves', async () => {
    const plan = makePlan();
    Plan.findById            = jest.fn().mockResolvedValue(plan);
    Subscription.countDocuments = jest.fn().mockResolvedValue(0);

    await planService.archivePlan(plan._id, actor);

    expect(plan.isActive).toBe(false);
    expect(plan.save).toHaveBeenCalled();
  });

  it('throws PLAN_HAS_ACTIVE_SUBSCRIPTIONS when active subscriptions exist', async () => {
    Plan.findById               = jest.fn().mockResolvedValue(makePlan());
    Subscription.countDocuments = jest.fn().mockResolvedValue(3);

    await expect(planService.archivePlan('planId', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.PLAN_HAS_ACTIVE_SUBSCRIPTIONS });
  });

  it('throws PLAN_ARCHIVED if plan is already inactive', async () => {
    Plan.findById = jest.fn().mockResolvedValue(makePlan({ isActive: false }));
    await expect(planService.archivePlan('planId', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.PLAN_ARCHIVED });
  });
});
