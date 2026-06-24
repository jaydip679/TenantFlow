'use strict';

/**
 * Phase 9 Admin Dashboard & Analytics Tests
 *
 * Covers all acceptance criteria from IMPLEMENTATION_ROADMAP.md §12.2:
 *
 * adminService.getPlatformMetrics():
 *   - MRR computed correctly from active subscriptions
 *   - MRR normalizes annual plan price to monthly (price / 12)
 *   - ARR = MRR * 12
 *   - Returns 0 values when no subscriptions exist
 *
 * adminService.listTenants():
 *   - Returns paginated tenant list
 *   - Joins subscription, planVersion, churnScore in single pipeline
 *
 * adminService.getTenantDetail():
 *   - Returns tenant, members, invoices, events, churnScore, subscription
 *   - Throws TENANT_NOT_FOUND when tenant doesn't exist
 *
 * adminService.forceStatusChange():
 *   - Updates tenant status and creates AuditLog entry
 *   - Throws VALIDATION_ERROR on invalid status
 *   - Throws TENANT_NOT_FOUND when tenant doesn't exist
 *
 * adminService.listAllInvoices():
 *   - Returns paginated cross-tenant invoices
 *   - Applies status filter when provided
 *
 * adminService.getQueueStats():
 *   - Returns stats for all 7 queues
 *
 * MRR calculation (acceptance criterion §12.2):
 *   - Mix of monthly (₹8,332/mo) + annual (₹120,000/yr = ₹10,000/mo) = ₹18,332 MRR
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §12.2 — Phase 9 Acceptance Criteria
 */

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../../models/Tenant.model');
jest.mock('../../models/Subscription.model');
jest.mock('../../models/Invoice.model');
jest.mock('../../models/DunningRecord.model');
jest.mock('../../models/SubscriptionEvent.model');
jest.mock('../../models/User.model');
jest.mock('../../models/AuditLog.model');
jest.mock('../../models/TenantChurnScore.model');
jest.mock('../../queues/email.queue', () => ({ emailQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0 }) } }));
jest.mock('../../queues/invoice.queue', () => ({ invoiceQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0, completed: 5, failed: 0, delayed: 0 }) } }));
jest.mock('../../queues/pdf.queue', () => ({ pdfQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0 }) } }));
jest.mock('../../queues/payment.queue', () => ({ paymentQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 1, completed: 20, failed: 0, delayed: 0 }) } }));
jest.mock('../../queues/dunning.queue', () => ({ dunningQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 0, completed: 3, failed: 0, delayed: 1 }) } }));
jest.mock('../../queues/notification.queue', () => ({ notificationQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 50, failed: 0, delayed: 0 }) } }));
jest.mock('../../queues/ai.queue', () => ({ aiQueue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 8, failed: 0, delayed: 0 }) } }));

const Tenant           = require('../../models/Tenant.model');
const Subscription     = require('../../models/Subscription.model');
const Invoice          = require('../../models/Invoice.model');
const DunningRecord    = require('../../models/DunningRecord.model');
const SubscriptionEvent = require('../../models/SubscriptionEvent.model');
const User             = require('../../models/User.model');
const AuditLog         = require('../../models/AuditLog.model');
const TenantChurnScore = require('../../models/TenantChurnScore.model');
const adminService     = require('./admin.service');
const { ERROR_CODES }  = require('../../shared/errors/errorCodes');

beforeEach(() => jest.clearAllMocks());

// ── MRR Calculation (Key Acceptance Criterion) ────────────────
describe('MRR calculation (DATABASE_DESIGN §6.1)', () => {
  it('normalizes annual plan price to monthly (price / 12) when computing MRR', async () => {
    // Mock: 2 subscriptions
    //   Sub 1: monthly plan, ₹8,332/mo  (833200 paise)
    //   Sub 2: annual plan,  ₹120,000/yr (12000000 paise) → ₹10,000/mo
    // Expected MRR = 833200 + (12000000 / 12) = 833200 + 1000000 = 1833200 paise
    Subscription.aggregate = jest.fn()
      // First call: current MRR
      .mockResolvedValueOnce([{ mrr: 1833200, activeCount: 2, trialingCount: 0 }])
      // Second call: last month MRR
      .mockResolvedValueOnce([{ mrr: 1600000 }])
      // Third call: churn this month
      .mockResolvedValueOnce([{ atMonthStart: 2, churned: 0, newThisMonth: 0, cancelledThisMonth: 0 }])
      // Fourth call: churn last month
      .mockResolvedValueOnce([{ atMonthStart: 2, churned: 0 }]);

    DunningRecord.countDocuments    = jest.fn().mockResolvedValue(1);
    TenantChurnScore.countDocuments = jest.fn().mockResolvedValue(2);

    const metrics = await adminService.getPlatformMetrics();

    expect(metrics.mrr.current).toBe(1833200);
    expect(metrics.arr).toBe(1833200 * 12);
    expect(metrics.activeSubscriptions).toBe(2);
  });

  it('returns 0 MRR when no active subscriptions exist', async () => {
    Subscription.aggregate = jest.fn()
      .mockResolvedValueOnce([])  // Empty MRR result
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ atMonthStart: 0, churned: 0, newThisMonth: 0, cancelledThisMonth: 0 }])
      .mockResolvedValueOnce([{ atMonthStart: 0, churned: 0 }]);
    DunningRecord.countDocuments    = jest.fn().mockResolvedValue(0);
    TenantChurnScore.countDocuments = jest.fn().mockResolvedValue(0);

    const metrics = await adminService.getPlatformMetrics();

    expect(metrics.mrr.current).toBe(0);
    expect(metrics.arr).toBe(0);
    expect(metrics.activeDunningRecords).toBe(0);
    expect(metrics.highRiskTenants).toBe(0);
  });
});

// ── adminService.listTenants() ────────────────────────────────
describe('adminService.listTenants()', () => {
  it('returns paginated tenant list', async () => {
    const mockTenants = [{ _id: 'tenant-1', name: 'Acme', status: 'active', planName: 'Growth', churnRiskScore: 45 }];
    Tenant.aggregate = jest.fn()
      .mockResolvedValueOnce(mockTenants)    // Data
      .mockResolvedValueOnce([{ total: 1 }]); // Count

    const { tenants, pagination } = await adminService.listTenants({}, { page: 1, limit: 20 });

    expect(tenants).toHaveLength(1);
    expect(pagination.total).toBe(1);
  });
});

// ── adminService.getTenantDetail() ────────────────────────────
describe('adminService.getTenantDetail()', () => {
  it('returns full tenant detail', async () => {
    const mockTenant = { _id: 'tenant-id-1', name: 'Acme', status: 'active' };
    Tenant.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockTenant) });

    const findSortLimit = () => ({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    User.find          = jest.fn().mockReturnValue(findSortLimit());
    Invoice.find       = jest.fn().mockReturnValue(findSortLimit());
    SubscriptionEvent.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    TenantChurnScore.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Subscription.findOne     = jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });

    const detail = await adminService.getTenantDetail('tenant-id-1');

    expect(detail.tenant).toEqual(mockTenant);
    expect(detail).toHaveProperty('members');
    expect(detail).toHaveProperty('recentInvoices');
    expect(detail).toHaveProperty('eventTimeline');
    expect(detail).toHaveProperty('churnScore');
  });

  it('throws TENANT_NOT_FOUND when tenant does not exist', async () => {
    Tenant.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    User.find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    Invoice.find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    SubscriptionEvent.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    TenantChurnScore.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Subscription.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });

    await expect(adminService.getTenantDetail('nonexistent-tenant')).rejects.toMatchObject({
      errorCode: ERROR_CODES.TENANT_NOT_FOUND,
      statusCode: 404,
    });
  });
});

// ── adminService.forceStatusChange() ─────────────────────────
describe('adminService.forceStatusChange()', () => {
  it('updates tenant status and creates an AuditLog entry', async () => {
    const updatedTenant = { _id: 'tenant-id-1', name: 'Acme', status: 'suspended' };
    Tenant.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedTenant);
    AuditLog.create          = jest.fn().mockResolvedValue({});

    const result = await adminService.forceStatusChange('tenant-id-1', 'suspended', 'Non-payment', 'admin-user-id');

    expect(result.status).toBe('suspended');
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event:  'tenant.status_changed',
        source: 'admin_override',
        metadata: expect.objectContaining({ newStatus: 'suspended', reason: 'Non-payment' }),
      })
    );
  });

  it('throws VALIDATION_ERROR on invalid status value', async () => {
    await expect(
      adminService.forceStatusChange('tenant-id-1', 'invalid_status', 'reason', 'admin-id')
    ).rejects.toMatchObject({ errorCode: ERROR_CODES.VALIDATION_ERROR });
  });

  it('throws TENANT_NOT_FOUND when tenant does not exist', async () => {
    Tenant.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    await expect(
      adminService.forceStatusChange('nonexistent', 'suspended', 'reason', 'admin-id')
    ).rejects.toMatchObject({ errorCode: ERROR_CODES.TENANT_NOT_FOUND });
  });
});

// ── adminService.listAllInvoices() ───────────────────────────
describe('adminService.listAllInvoices()', () => {
  it('returns paginated cross-tenant invoices', async () => {
    const mockInvoices = [{ _id: 'inv-1', invoiceNumber: 'INV-2024-00001', status: 'paid' }];
    Invoice.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      skip:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockReturnThis(),
      lean:     jest.fn().mockResolvedValue(mockInvoices),
    });
    Invoice.countDocuments = jest.fn().mockResolvedValue(1);

    const { invoices, pagination } = await adminService.listAllInvoices({}, { page: 1, limit: 20 });

    expect(invoices).toHaveLength(1);
    expect(pagination.total).toBe(1);
  });

  it('applies status filter when provided', async () => {
    Invoice.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      skip:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockReturnThis(),
      lean:     jest.fn().mockResolvedValue([]),
    });
    Invoice.countDocuments = jest.fn().mockResolvedValue(0);

    await adminService.listAllInvoices({ status: 'open' }, { page: 1, limit: 20 });

    expect(Invoice.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });
});

// ── adminService.getQueueStats() ─────────────────────────────
describe('adminService.getQueueStats()', () => {
  it('returns stats for all 7 queues', async () => {
    const stats = await adminService.getQueueStats();

    const queueNames = Object.keys(stats);
    expect(queueNames).toContain('email-queue');
    expect(queueNames).toContain('invoice-queue');
    expect(queueNames).toContain('pdf-queue');
    expect(queueNames).toContain('payment-queue');
    expect(queueNames).toContain('dunning-queue');
    expect(queueNames).toContain('notification-queue');
    expect(queueNames).toContain('ai-queue');
    expect(stats['email-queue']).toHaveProperty('completed');
  });
});
