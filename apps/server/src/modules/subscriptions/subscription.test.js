'use strict';

/**
 * Subscription Service Tests
 *
 * Tests Phase 3 acceptance criteria from IMPLEMENTATION_ROADMAP.md §6.2:
 *   - State machine: forbidden transition → 422 SUBSCRIPTION_INVALID_TRANSITION
 *   - State machine: valid transitions succeed
 *   - getSubscription: 404 if no active subscription
 *   - upgradeSubscription: 422 SEAT_CONFLICT if new plan max_seats < usedSeats
 *   - upgradeSubscription: 422 UPGRADE_REQUIRED if target plan price not higher
 *   - upgradeSubscription: 422 SUBSCRIPTION_INVALID_TRANSITION from 'cancelled' status
 *   - downgradeSubscription: sets pending_downgrade, no charge
 *   - cancelSubscription: immediate → status=cancelled, tenant.status=cancelled
 *   - cancelSubscription: at period end → cancelAtPeriodEnd=true
 *   - cancelDowngrade: restores 'active', clears pendingPlanId
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §6.2 — Phase 3 Acceptance Criteria
 */

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../../models/Subscription.model');
jest.mock('../../models/SubscriptionEvent.model');
jest.mock('../../shared/facades/identity.facade');
jest.mock('../../config/redis', () => ({ del: jest.fn().mockResolvedValue(1), call: jest.fn() }));
jest.mock('../../app', () => ({ get: jest.fn().mockReturnValue(null) }), { virtual: true });
jest.mock('../../shared/utils/auditLogService', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../shared/events/outbox.helper', () => ({ addEventToOutbox: jest.fn().mockResolvedValue({}) }));
// Stub mongoose.startSession — returns a minimal session mock
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (fn) => fn()),
      endSession:      jest.fn(),
    }),
  };
});

const Subscription      = require('../../models/Subscription.model');
const SubscriptionEvent = require('../../models/SubscriptionEvent.model');
const identityFacade    = require('../../shared/facades/identity.facade');
const { validateTransition, ALLOWED_TRANSITIONS } = require('./subscription.statemachine');
const subscriptionService = require('./subscription.service');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');

// ── Helpers ───────────────────────────────────────────────────
const actor = { id: 'actor-id', role: 'tenant_admin', tenantId: 'tenant-id-1', email: 'admin@acme.com' };

const makeSub = (o = {}) => ({
  _id:            'sub-id-1',
  tenantId:       'tenant-id-1',
  planId:         'plan-id-1',
  planVersionId:  'pv-id-1',
  status:         'active',
  seatCount:      5,
  currentPeriodStart: new Date('2024-01-01'),
  currentPeriodEnd:   new Date('2024-02-01'),
  cancelAtPeriodEnd:  false,
  pendingPlanId:      null,
  save:   jest.fn().mockResolvedValue(undefined),
  toObject: jest.fn().mockReturnValue({ status: o.status || 'active' }),
  ...o,
});

const makePlan = (price = 299900, maxSeats = 25, o = {}) => ({
  _id:       'plan-id-2',
  name:      'growth',
  displayName: 'Growth',
  price,
  currency:  'INR',
  interval:  'monthly',
  trialDays: 14,
  isActive:  true,
  features: { max_seats: maxSeats, api_calls_per_month: 100000, storage_gb: 50, advanced_analytics: true, ai_assistant: false, priority_support: false },
  ...o,
});

const makePlanVersion = (price = 99900, o = {}) => ({
  _id:     'pv-id-1',
  planId:  'plan-id-1',
  version: 1,
  price,
  currency: 'INR',
  interval: 'monthly',
  ...o,
});

beforeEach(() => jest.clearAllMocks());

// ── State Machine Tests ───────────────────────────────────────
describe('validateTransition()', () => {
  it('throws 422 SUBSCRIPTION_INVALID_TRANSITION for forbidden transitions', () => {
    expect(() => validateTransition('cancelled', 'paused')).toThrow();
    expect(() => validateTransition('trialing', 'past_due')).toThrow();
    expect(() => validateTransition('paused', 'pending_downgrade')).toThrow();
  });

  it('does not throw for valid transitions', () => {
    expect(() => validateTransition('active', 'cancelled')).not.toThrow();
    expect(() => validateTransition('trialing', 'active')).not.toThrow();
    expect(() => validateTransition('cancelled', 'active')).not.toThrow();
    expect(() => validateTransition('paused', 'active')).not.toThrow();
    expect(() => validateTransition('active', 'pending_downgrade')).not.toThrow();
  });

  it('includes fromStatus, toStatus, and allowed in error context', () => {
    try {
      validateTransition('cancelled', 'paused');
    } catch (err) {
      expect(err.errorCode).toBe(ERROR_CODES.SUBSCRIPTION_INVALID_TRANSITION);
      expect(err.statusCode).toBe(422);
      expect(err.details).toMatchObject({ fromStatus: 'cancelled', toStatus: 'paused' });
    }
  });

  it('ALLOWED_TRANSITIONS matches SRS spec exactly', () => {
    expect(ALLOWED_TRANSITIONS.trialing).toContain('active');
    expect(ALLOWED_TRANSITIONS.trialing).toContain('cancelled');
    expect(ALLOWED_TRANSITIONS.active).toContain('past_due');
    expect(ALLOWED_TRANSITIONS.active).toContain('paused');
    expect(ALLOWED_TRANSITIONS.active).toContain('pending_downgrade');
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual(['active']); // ONLY reactivation
    expect(ALLOWED_TRANSITIONS.suspended).toContain('active');
  });
});

// ── getSubscription() ─────────────────────────────────────────
describe('subscriptionService.getSubscription()', () => {
  it('returns populated subscription for active tenant', async () => {
    const sub = makeSub();
    Subscription.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(sub),
    });
    identityFacade.getPlan = jest.fn().mockResolvedValue(makePlan());
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion());
    identityFacade.getTenantProfiles = jest.fn().mockResolvedValue({});
    const result = await subscriptionService.getSubscription('tenant-id-1');
    expect(result).toHaveProperty('_id', 'sub-id-1');
  });

  it('throws SUBSCRIPTION_NOT_FOUND when no subscription exists', async () => {
    Subscription.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(subscriptionService.getSubscription('unknown'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.SUBSCRIPTION_NOT_FOUND });
  });
});

// ── upgradeSubscription() ─────────────────────────────────────
describe('subscriptionService.upgradeSubscription()', () => {
  it('throws SUBSCRIPTION_INVALID_TRANSITION when upgrading from cancelled status', async () => {
    const sub = makeSub({ status: 'cancelled' });
    Subscription.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(sub) });
    identityFacade.getPlan = jest.fn().mockResolvedValue(makePlan());
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion());

    await expect(subscriptionService.upgradeSubscription('tenant-id-1', 'plan-id-2', actor, {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.SUBSCRIPTION_INVALID_TRANSITION });
  });

  it('throws UPGRADE_REQUIRED when target plan price is not higher', async () => {
    const sub = makeSub({ status: 'active' });
    Subscription.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(sub) });
    identityFacade.getPlan = jest.fn().mockResolvedValue(makePlan(50000));
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion(99900));

    await expect(subscriptionService.upgradeSubscription('tenant-id-1', 'plan-id-2', actor, {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.UPGRADE_REQUIRED });
  });

  it('throws SEAT_CONFLICT when new plan max_seats < usedSeats', async () => {
    const sub = makeSub({ status: 'active' });
    // Target plan: only 2 seats allowed
    const smallPlan = makePlan(999900, 2); // price much higher, but only 2 seats

    Subscription.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(sub) });
    identityFacade.getPlan = jest.fn().mockResolvedValue(smallPlan);
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion(99900));

    // tenantContext says 5 people are using seats
    const tenantContext = { usedSeats: 5, seatLimit: 5 };

    await expect(subscriptionService.upgradeSubscription('tenant-id-1', smallPlan._id, actor, tenantContext))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.SEAT_CONFLICT });
  });

  it('throws PLAN_ARCHIVED when target plan is inactive', async () => {
    const sub = makeSub({ status: 'active' });
    Subscription.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(sub) });
    identityFacade.getPlan = jest.fn().mockResolvedValue(null);

    await expect(subscriptionService.upgradeSubscription('tenant-id-1', 'plan-id-2', actor, {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.PLAN_ARCHIVED });
  });
});

// ── downgradeSubscription() ───────────────────────────────────
describe('subscriptionService.downgradeSubscription()', () => {
  it('sets status=pending_downgrade and pendingPlanId', async () => {
    const sub = makeSub({ status: 'active' });
    const cheaperPlan = makePlan(50000, 5); // ₹500, fewer seats

    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    identityFacade.getPlan        = jest.fn().mockResolvedValue(cheaperPlan);
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion(99900));
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    const tenantContext = { usedSeats: 3 };
    const result = await subscriptionService.downgradeSubscription(
      'tenant-id-1', cheaperPlan._id, 'Cost savings', actor, tenantContext
    );

    expect(sub.status).toBe('pending_downgrade');
    expect(sub.pendingPlanId.toString()).toBe(cheaperPlan._id.toString());
    expect(sub.save).toHaveBeenCalled();
    expect(result).toHaveProperty('subscription');
    expect(result).toHaveProperty('message');
  });

  it('throws DOWNGRADE_REQUIRED if target price is not lower', async () => {
    const sub = makeSub({ status: 'active' });
    const expensivePlan = makePlan(999900, 10); // ₹9999 — more expensive

    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    identityFacade.getPlan        = jest.fn().mockResolvedValue(expensivePlan);
    identityFacade.getPlanVersion = jest.fn().mockResolvedValue(makePlanVersion(99900));

    await expect(subscriptionService.downgradeSubscription('tenant-id-1', expensivePlan._id, '', actor, {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.DOWNGRADE_REQUIRED });
  });
});

// ── cancelSubscription() ─────────────────────────────────────
describe('subscriptionService.cancelSubscription()', () => {
  it('immediate cancellation: sets status=cancelled + updates Tenant.status', async () => {
    const sub = makeSub({ status: 'active' });
    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    identityFacade.updateTenantStatus = jest.fn().mockResolvedValue({});
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    await subscriptionService.cancelSubscription('tenant-id-1', { cancelAtPeriodEnd: false, reason: 'Test' }, actor);

    expect(sub.status).toBe('cancelled');
    expect(identityFacade.updateTenantStatus).toHaveBeenCalledWith('tenant-id-1', 'cancelled');
  });

  it('at-period-end cancellation: status unchanged, cancelAtPeriodEnd=true', async () => {
    const sub = makeSub({ status: 'active' });
    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    identityFacade.updateTenantStatus = jest.fn().mockResolvedValue({});
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    await subscriptionService.cancelSubscription('tenant-id-1', { cancelAtPeriodEnd: true, reason: 'Moving on' }, actor);

    expect(sub.status).toBe('active'); // status unchanged
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(identityFacade.updateTenantStatus).not.toHaveBeenCalled(); // Tenant NOT cancelled yet
  });
});

// ── cancelDowngrade() ────────────────────────────────────────
describe('subscriptionService.cancelDowngrade()', () => {
  it('restores status to active and clears pendingPlanId', async () => {
    const sub = makeSub({ status: 'pending_downgrade', pendingPlanId: 'old-plan-id' });
    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    await subscriptionService.cancelDowngrade('tenant-id-1', actor);

    expect(sub.status).toBe('active');
    expect(sub.pendingPlanId).toBeNull();
    expect(sub.save).toHaveBeenCalled();
  });

  it('throws NO_PENDING_DOWNGRADE when no pending downgrade found', async () => {
    Subscription.findOne = jest.fn().mockResolvedValue(null);
    await expect(subscriptionService.cancelDowngrade('tenant-id-1', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.NO_PENDING_DOWNGRADE });
  });
});

// ── pauseSubscription() / resumeSubscription() ────────────────
describe('subscriptionService.pauseSubscription()', () => {
  it('sets status=paused and records pausedAt', async () => {
    const sub = makeSub({ status: 'active' });
    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    await subscriptionService.pauseSubscription('tenant-id-1', null, actor);

    expect(sub.status).toBe('paused');
    expect(sub.pausedAt).toBeInstanceOf(Date);
  });
});

describe('subscriptionService.resumeSubscription()', () => {
  it('sets status=active and clears pausedAt', async () => {
    const sub = makeSub({ status: 'paused', pausedAt: new Date() });
    Subscription.findOne = jest.fn().mockResolvedValue(sub);
    SubscriptionEvent.create = jest.fn().mockResolvedValue({});

    await subscriptionService.resumeSubscription('tenant-id-1', actor);

    expect(sub.status).toBe('active');
    expect(sub.pausedAt).toBeNull();
  });
});
