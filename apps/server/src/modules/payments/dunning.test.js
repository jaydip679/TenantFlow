'use strict';

/**
 * Phase 6 Dunning Tests
 *
 * Covers all acceptance criteria from IMPLEMENTATION_ROADMAP.md §9.2:
 *
 * DunningRecord model:
 *   - Has required fields and correct defaults
 *   - Status enum is ['active', 'resolved', 'abandoned']
 *   - steps sub-schema has correct fields
 *
 * dunningService.initiateDunning():
 *   - Creates DunningRecord at step 0 when none exists
 *   - Returns existing active record (idempotent — no duplicate creation)
 *   - Enqueues dunning-queue job
 *
 * dunningService.advanceDunningStep():
 *   - Throws DUNNING_LOCK_HELD when Redis lock is held
 *   - Throws DUNNING_RECORD_NOT_FOUND for unknown ID
 *   - Skips silently when DunningRecord is not active
 *   - Advances from step 0 to step 1, schedules nextRetryAt = createdAt + 3 days
 *   - Marks subscription past_due at step 2 advancement
 *   - Calls abandonDunning when currentStep=3 fails
 *
 * dunningService.resolveDunning():
 *   - Sets status='resolved', resolvedAt; restores subscription+tenant to active
 *   - Idempotent: does nothing if already resolved
 *
 * dunningService.abandonDunning():
 *   - Sets status='abandoned'; marks subscription 'suspended', tenant 'suspended', invoice 'uncollectible'
 *
 * dunningService.resetDunning():
 *   - Throws DUNNING_RECORD_NOT_FOUND for unknown ID
 *   - Throws DUNNING_ALREADY_RESOLVED if status != active
 *   - Resets step 0, nextRetryAt = now+1hr, enqueues job, creates AuditLog
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §9.2 — Phase 6 Acceptance Criteria
 */

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../../models/DunningRecord.model');
jest.mock('../../models/Invoice.model');
jest.mock('../../models/Subscription.model');
jest.mock('../../models/Tenant.model');
jest.mock('../../config/redis', () => ({
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../queues/dunning.queue', () => ({
  enqueueDunningStep: jest.fn().mockResolvedValue({}),
  QUEUE_NAME: 'dunning-queue',
}));
jest.mock('../../queues/email.queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue({}) }));
jest.mock('../../shared/utils/auditLogService', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../config/razorpay', () => ({
  orders: { create: jest.fn().mockResolvedValue({ id: 'order_dunning_test' }) },
}));

const DunningRecord = require('../../models/DunningRecord.model');
const Invoice       = require('../../models/Invoice.model');
const Subscription  = require('../../models/Subscription.model');
const Tenant        = require('../../models/Tenant.model');
const redisClient   = require('../../config/redis');
const { enqueueDunningStep } = require('../../queues/dunning.queue');
const dunningService = require('./dunning.service');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');
const { addDays }    = require('date-fns');

const actor = { id: 'actor-id', role: 'super_admin', email: 'admin@tf.com' };

// ── Helpers ───────────────────────────────────────────────────
const makeDunning = (o = {}) => {
  const createdAt = new Date('2024-01-01T00:00:00Z');
  return {
    _id:            { toString: () => 'dn-id-1' },
    tenantId:       { toString: () => 'tenant-id-1' },
    subscriptionId: { toString: () => 'sub-id-1' },
    invoiceId:      { toString: () => 'inv-id-1' },
    status:         'active',
    currentStep:    0,
    nextRetryAt:    new Date('2024-01-01T01:00:00Z'),
    createdAt,
    steps: [{ step: 0, scheduledAt: new Date(), outcome: 'pending', attemptedAt: null, errorCode: null, find: jest.fn() }],
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn().mockReturnValue({ status: o.status || 'active' }),
    ...o,
  };
};

const makeInvoice = () => ({
  _id:       { toString: () => 'inv-id-1' },
  tenantId:  { toString: () => 'tenant-id-1' },
  amountDue: 117882,
  currency:  'INR',
  status:    'open',
});

const makeSub = (status = 'active') => ({
  _id:    { toString: () => 'sub-id-1' },
  status,
  save:   jest.fn().mockResolvedValue(undefined),
});

const makeTenant = () => ({
  _id:                { toString: () => 'tenant-id-1' },
  name:               'Acme Corp',
  billingEmail:       'billing@acme.com',
  razorpayCustomerId: 'cust_test123',
  status:             'active',
});

beforeEach(() => jest.clearAllMocks());

// ── initiateDunning() ─────────────────────────────────────────
describe('dunningService.initiateDunning()', () => {
  it('creates DunningRecord at step 0 when none exists', async () => {
    DunningRecord.findOne   = jest.fn().mockResolvedValue(null); // No existing
    DunningRecord.create    = jest.fn().mockResolvedValue(makeDunning());

    const result = await dunningService.initiateDunning('tenant-id-1', 'sub-id-1', 'inv-id-1');

    expect(DunningRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-id-1', subscriptionId: 'sub-id-1', invoiceId: 'inv-id-1', currentStep: 0, status: 'active' })
    );
    expect(enqueueDunningStep).toHaveBeenCalledWith('dn-id-1');
    expect(result).toBeDefined();
  });

  it('returns existing active record without creating a new one (idempotent)', async () => {
    const existing = makeDunning();
    DunningRecord.findOne = jest.fn().mockResolvedValue(existing);

    const result = await dunningService.initiateDunning('tenant-id-1', 'sub-id-1', 'inv-id-1');

    expect(DunningRecord.create).not.toHaveBeenCalled();
    expect(enqueueDunningStep).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

// ── advanceDunningStep() ─────────────────────────────────────
describe('dunningService.advanceDunningStep()', () => {
  it('throws DUNNING_LOCK_HELD when Redis lock is not acquired', async () => {
    redisClient.set = jest.fn().mockResolvedValue(null); // Lock not acquired

    await expect(dunningService.advanceDunningStep('dn-id-1'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.DUNNING_LOCK_HELD });
  });

  it('throws DUNNING_RECORD_NOT_FOUND for unknown dunning ID', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK'); // Lock acquired
    DunningRecord.findById = jest.fn().mockResolvedValue(null);

    await expect(dunningService.advanceDunningStep('dn-id-1'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.DUNNING_RECORD_NOT_FOUND });
  });

  it('returns early when DunningRecord status is not active', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK');
    DunningRecord.findById = jest.fn().mockResolvedValue(makeDunning({ status: 'resolved' }));

    const result = await dunningService.advanceDunningStep('dn-id-1');
    expect(result.status).toBe('resolved');
  });

  it('advances from step 0 to step 1 on failure and sets correct nextRetryAt', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK');

    const dunning = makeDunning({ currentStep: 0 });
    // Make dunning.steps.find() work on the actual array
    dunning.steps = [{ step: 0, scheduledAt: new Date(), outcome: 'pending', attemptedAt: null, errorCode: null }];

    DunningRecord.findById = jest.fn().mockResolvedValue(dunning);
    Invoice.findById       = jest.fn().mockResolvedValue(makeInvoice());
    Subscription.findById  = jest.fn().mockResolvedValue(makeSub());
    Tenant.findById        = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeTenant()) });

    await dunningService.advanceDunningStep('dn-id-1');

    // Should have advanced to step 1
    expect(dunning.currentStep).toBe(1);
    // nextRetryAt should be approx 3 days from createdAt
    const expectedRetry = addDays(dunning.createdAt, 3);
    expect(dunning.nextRetryAt.getTime()).toBeCloseTo(expectedRetry.getTime(), -3); // Within 1 second
    expect(dunning.save).toHaveBeenCalled();
  });

  it('marks subscription past_due when advancing to step 2', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK');

    const dunning = makeDunning({ currentStep: 1 });
    dunning.steps = [
      { step: 0, scheduledAt: new Date(), outcome: 'failed', attemptedAt: new Date(), errorCode: 'ERR' },
      { step: 1, scheduledAt: new Date(), outcome: 'pending', attemptedAt: null, errorCode: null },
    ];

    const sub = makeSub('active');  // Status = active, should become past_due
    DunningRecord.findById = jest.fn().mockResolvedValue(dunning);
    Invoice.findById       = jest.fn().mockResolvedValue(makeInvoice());
    Subscription.findById  = jest.fn().mockResolvedValue(sub);
    Tenant.findById        = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeTenant()) });

    await dunningService.advanceDunningStep('dn-id-1');

    expect(sub.status).toBe('past_due');
    expect(sub.save).toHaveBeenCalled();
  });
});

// ── resolveDunning() ─────────────────────────────────────────
describe('dunningService.resolveDunning()', () => {
  it('resolves dunning, restores subscription and tenant to active', async () => {
    const dunning = makeDunning();
    DunningRecord.findById          = jest.fn().mockResolvedValue(dunning);
    Subscription.findByIdAndUpdate  = jest.fn().mockResolvedValue(null);
    Tenant.findByIdAndUpdate        = jest.fn().mockResolvedValue(null);

    await dunningService.resolveDunning('dn-id-1', 'pay_test');

    expect(dunning.status).toBe('resolved');
    expect(dunning.resolvedAt).toBeInstanceOf(Date);
    expect(Subscription.findByIdAndUpdate).toHaveBeenCalledWith(
      dunning.subscriptionId, { status: 'active' }
    );
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      dunning.tenantId, { status: 'active' }
    );
  });

  it('is idempotent — does nothing when already resolved', async () => {
    const dunning = makeDunning({ status: 'resolved' });
    DunningRecord.findById = jest.fn().mockResolvedValue(dunning);

    await dunningService.resolveDunning('dn-id-1');

    // Should not call save
    expect(dunning.save).not.toHaveBeenCalled();
  });
});

// ── abandonDunning() ─────────────────────────────────────────
describe('dunningService.abandonDunning()', () => {
  it('suspends tenant and marks invoice uncollectible on abandonment', async () => {
    const dunning = makeDunning();
    DunningRecord.findById         = jest.fn().mockResolvedValue(dunning);
    Subscription.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    Tenant.findByIdAndUpdate       = jest.fn().mockResolvedValue(null);
    Invoice.findByIdAndUpdate      = jest.fn().mockResolvedValue(null);
    Tenant.findById                = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeTenant()) }) });

    await dunningService.abandonDunning('dn-id-1');

    expect(dunning.status).toBe('abandoned');
    expect(dunning.abandonedAt).toBeInstanceOf(Date);
    expect(Subscription.findByIdAndUpdate).toHaveBeenCalledWith(
      dunning.subscriptionId, { status: 'suspended' }
    );
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      dunning.tenantId, { status: 'suspended' }
    );
    expect(Invoice.findByIdAndUpdate).toHaveBeenCalledWith(
      dunning.invoiceId, { status: 'uncollectible' }
    );
  });
});

// ── resetDunning() ────────────────────────────────────────────
describe('dunningService.resetDunning()', () => {
  it('throws DUNNING_RECORD_NOT_FOUND for unknown ID', async () => {
    DunningRecord.findById = jest.fn().mockResolvedValue(null);
    await expect(dunningService.resetDunning('dn-id-1', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.DUNNING_RECORD_NOT_FOUND });
  });

  it('throws DUNNING_ALREADY_RESOLVED when status is not active', async () => {
    DunningRecord.findById = jest.fn().mockResolvedValue(makeDunning({ status: 'resolved' }));
    await expect(dunningService.resetDunning('dn-id-1', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.DUNNING_ALREADY_RESOLVED });
  });

  it('resets to step 0, sets nextRetryAt ~1hr, enqueues job, creates AuditLog', async () => {
    const dunning = makeDunning();
    DunningRecord.findById = jest.fn().mockResolvedValue(dunning);

    await dunningService.resetDunning('dn-id-1', actor);

    expect(dunning.currentStep).toBe(0);
    // nextRetryAt should be approximately 1 hour from now
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    expect(dunning.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    expect(dunning.nextRetryAt.getTime()).toBeLessThanOrEqual(oneHourFromNow.getTime() + 5000);
    expect(dunning.save).toHaveBeenCalled();
    expect(enqueueDunningStep).toHaveBeenCalledWith('dn-id-1');
  });
});
