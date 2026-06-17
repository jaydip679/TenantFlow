'use strict';

/**
 * Phase 4 Invoice Tests
 *
 * Covers all acceptance criteria from IMPLEMENTATION_ROADMAP.md §7.2:
 *   - Line item builder: renewal invoice has correct 'plan' line item
 *   - Line item builder: upgrade invoice has 'proration_credit' + 'proration_charge'
 *   - Line item builder: seat invoice has 'seat' line item with correct paise math
 *   - calculateTotals: correct integer paise; tax = Math.round(subtotal * rate / 100)
 *   - calculateTotals: no tax on negative subtotal (credits > charges)
 *   - generateInvoice: idempotent — returns existing invoice if duplicate found
 *   - generateInvoice: throws INVOICE_LOCK_HELD when lock is held
 *   - generateInvoice: creates invoice with correct fields
 *   - voidInvoice: 409 INVOICE_ALREADY_PAID if status='paid'
 *   - voidInvoice: 409 INVOICE_NOT_OPEN if status='draft'
 *   - voidInvoice: successfully voids an 'open' invoice
 *   - getPdfUrl: returns {ready:false} when pdfUrl is null
 *   - getPdfUrl: 403 on tenantId mismatch
 *   - listInvoices: applies status filter and pagination
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.2 — Phase 4 Acceptance Criteria
 */

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../../models/Invoice.model');
jest.mock('../../models/Subscription.model');
jest.mock('../../models/PlanVersion.model');
jest.mock('../../models/Tenant.model');
jest.mock('../../config/redis', () => ({
  set: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../shared/utils/auditLogService', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../shared/utils/invoiceNumber', () => ({ generateInvoiceNumber: jest.fn().mockResolvedValue('INV-2024-00001') }));
jest.mock('../../queues/email.queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue({}) }));
// Stub pdf.queue — it's required lazily inside generateInvoice
jest.mock('../../queues/pdf.queue', () => ({ enqueuePdfGeneration: jest.fn().mockResolvedValue({}) }), { virtual: false });

const Invoice      = require('../../models/Invoice.model');
const Subscription = require('../../models/Subscription.model');
const PlanVersion  = require('../../models/PlanVersion.model');
const Tenant       = require('../../models/Tenant.model');
const redisClient  = require('../../config/redis');
const {
  buildRenewalLineItems,
  buildUpgradeLineItems,
  buildSeatLineItems,
  calculateTotals,
} = require('./invoice.lineitem.builder');
const invoiceService = require('./invoice.service');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');

const actor = { id: 'actor-id', role: 'super_admin', email: 'admin@tf.com' };

// ── Helpers ───────────────────────────────────────────────────
const makeSub = (o = {}) => ({
  _id:                'sub-id-1',
  tenantId:           'tenant-id-1',
  planVersionId:      'pv-id-1',
  currentPeriodStart: new Date('2024-01-01'),
  currentPeriodEnd:   new Date('2024-02-01'),
  ...o,
});

const makePlanVersion = (price = 99900, displayName = 'Starter', o = {}) => ({
  _id: 'pv-id-1', planId: 'plan-id-1', version: 1, price, displayName, ...o,
});

const makeInvoice = (o = {}) => ({
  _id:           'inv-id-1',
  tenantId:      { toString: () => 'tenant-id-1' },
  subscriptionId: 'sub-id-1',
  invoiceNumber:  'INV-2024-00001',
  status:         'open',
  lineItems:      [],
  subtotal:       99900,
  taxRate:        18,
  taxAmount:      17982,
  total:          117882,
  amountPaid:     0,
  amountDue:      117882,
  pdfUrl:         null,
  save:           jest.fn().mockResolvedValue(undefined),
  toObject:       jest.fn().mockReturnValue({ status: o.status || 'open' }),
  ...o,
});

beforeEach(() => jest.clearAllMocks());

// ── Line Item Builder Tests ────────────────────────────────────
describe('buildRenewalLineItems()', () => {
  it('creates a single plan line item with the plan price', () => {
    const sub = makeSub();
    const pv  = makePlanVersion(99900, 'Starter');
    const items = buildRenewalLineItems(sub, pv);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('plan');
    expect(items[0].unitPrice).toBe(99900);
    expect(items[0].amount).toBe(99900);
    expect(items[0].quantity).toBe(1);
    expect(items[0].description).toContain('Starter');
  });
});

describe('buildUpgradeLineItems()', () => {
  it('creates proration_credit (negative) + proration_charge (positive) items', () => {
    const oldPV = makePlanVersion(99900, 'Starter');
    const newPV = makePlanVersion(299900, 'Growth');
    const proration = { creditAmount: 54842, chargeAmount: 164458, daysRemaining: 17 };

    const items = buildUpgradeLineItems(oldPV, newPV, proration);

    expect(items).toHaveLength(2);

    const credit = items.find((i) => i.type === 'proration_credit');
    const charge = items.find((i) => i.type === 'proration_charge');

    expect(credit).toBeDefined();
    expect(credit.amount).toBe(-54842);    // Negative — credit
    expect(credit.unitPrice).toBe(-54842);

    expect(charge).toBeDefined();
    expect(charge.amount).toBe(164458);    // Positive — charge
    expect(charge.unitPrice).toBe(164458);

    expect(credit.description).toContain('Starter');
    expect(credit.description).toContain('17 days');
    expect(charge.description).toContain('Growth');
  });
});

describe('buildSeatLineItems()', () => {
  it('calculates seat proration using 30-day month', () => {
    // seatPrice=10000 (₹100), seatsAdded=2, daysRemaining=17
    // dailySeatRate = Math.round(10000/30) = 333
    // chargeAmount = 333 * 17 * 2 = 11322
    const items = buildSeatLineItems(10000, 2, 17);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('seat');
    expect(items[0].quantity).toBe(2);
    expect(items[0].amount).toBe(Math.round(10000 / 30) * 17 * 2);
    expect(Number.isInteger(items[0].amount)).toBe(true);
  });
});

describe('calculateTotals()', () => {
  it('computes correct tax at 18% GST — integer paise', () => {
    const lineItems = [{ amount: 109616 }]; // proration net
    const { subtotal, taxAmount, total } = calculateTotals(lineItems, 18);

    expect(subtotal).toBe(109616);
    expect(taxAmount).toBe(Math.round(109616 * 18 / 100));  // 19730
    expect(total).toBe(subtotal + taxAmount);

    // All integers
    expect(Number.isInteger(subtotal)).toBe(true);
    expect(Number.isInteger(taxAmount)).toBe(true);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('does not tax negative subtotals (credit > charge)', () => {
    const lineItems = [{ amount: -5000 }]; // Net credit
    const { subtotal, taxAmount, total } = calculateTotals(lineItems, 18);

    expect(subtotal).toBe(-5000);
    expect(taxAmount).toBe(0);  // No tax on refunds
    expect(total).toBe(-5000);
  });

  it('handles zero subtotal correctly', () => {
    const lineItems = [{ amount: 0 }];
    const { subtotal, taxAmount, total } = calculateTotals(lineItems, 18);
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });
});

// ── Invoice Service Tests ─────────────────────────────────────
describe('invoiceService.generateInvoice()', () => {
  it('returns existing invoice when duplicate found (idempotent)', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK'); // Lock acquired
    Subscription.findById = jest.fn().mockResolvedValue(makeSub());
    const existing = makeInvoice();
    Invoice.findOne  = jest.fn().mockResolvedValue(existing);  // Duplicate found

    const result = await invoiceService.generateInvoice('sub-id-1', 'renewal');

    expect(result).toBe(existing);
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it('throws INVOICE_LOCK_HELD when Redis lock is not acquired', async () => {
    redisClient.set = jest.fn().mockResolvedValue(null); // Lock NOT acquired (key already exists)

    await expect(invoiceService.generateInvoice('sub-id-1', 'renewal'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_LOCK_HELD });
  });

  it('creates a new invoice when no duplicate exists', async () => {
    redisClient.set = jest.fn().mockResolvedValue('OK');  // Lock acquired
    const sub = makeSub();
    Subscription.findById = jest.fn().mockResolvedValue(sub);
    Invoice.findOne  = jest.fn().mockResolvedValue(null); // No duplicate

    PlanVersion.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makePlanVersion()) });

    const createdInvoice = makeInvoice();
    Invoice.create = jest.fn().mockResolvedValue(createdInvoice);

    const result = await invoiceService.generateInvoice('sub-id-1', 'renewal');

    expect(Invoice.create).toHaveBeenCalledTimes(1);
    expect(Invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:      sub.tenantId,
        subscriptionId: sub._id,
        invoiceNumber:  'INV-2024-00001',
        status:         'open',
      })
    );
    expect(result).toBe(createdInvoice);
  });
});

describe('invoiceService.voidInvoice()', () => {
  it('throws INVOICE_ALREADY_PAID when invoice is paid', async () => {
    const inv = makeInvoice({ status: 'paid' });
    Invoice.findById = jest.fn().mockResolvedValue(inv);

    await expect(invoiceService.voidInvoice('inv-id-1', 'mistake', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_ALREADY_PAID });
  });

  it('throws INVOICE_NOT_OPEN when invoice is in draft status', async () => {
    const inv = makeInvoice({ status: 'draft' });
    Invoice.findById = jest.fn().mockResolvedValue(inv);

    await expect(invoiceService.voidInvoice('inv-id-1', 'mistake', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_NOT_OPEN });
  });

  it('throws INVOICE_VOID when already voided', async () => {
    const inv = makeInvoice({ status: 'void' });
    Invoice.findById = jest.fn().mockResolvedValue(inv);

    await expect(invoiceService.voidInvoice('inv-id-1', 'mistake', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_VOID });
  });

  it('successfully voids an open invoice', async () => {
    const inv = makeInvoice({ status: 'open' });
    Invoice.findById = jest.fn().mockResolvedValue(inv);

    await invoiceService.voidInvoice('inv-id-1', 'Customer request', actor);

    expect(inv.status).toBe('void');
    expect(inv.voidedAt).toBeInstanceOf(Date);
    expect(inv.voidReason).toBe('Customer request');
    expect(inv.save).toHaveBeenCalled();
  });
});

describe('invoiceService.getPdfUrl()', () => {
  it('returns ready=false when pdfUrl is null', async () => {
    const inv = makeInvoice({ pdfUrl: null });
    Invoice.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(inv) }),
    });

    const result = await invoiceService.getPdfUrl('inv-id-1', 'tenant-id-1');
    expect(result.ready).toBe(false);
    expect(result.url).toBeNull();
  });

  it('throws FORBIDDEN when tenantId does not match', async () => {
    const inv = { ...makeInvoice(), tenantId: { toString: () => 'different-tenant' } };
    Invoice.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(inv) }),
    });

    await expect(invoiceService.getPdfUrl('inv-id-1', 'my-tenant-id'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
  });
});

describe('invoiceService.listInvoices()', () => {
  it('filters by status and paginates correctly', async () => {
    const invoices = [makeInvoice()];
    Invoice.find = jest.fn().mockReturnValue({
      sort:  jest.fn().mockReturnThis(),
      skip:  jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean:  jest.fn().mockResolvedValue(invoices),
    });
    Invoice.countDocuments = jest.fn().mockResolvedValue(1);

    const result = await invoiceService.listInvoices('tenant-id-1', { status: 'open' }, { page: 1, limit: 10 });

    expect(Invoice.find).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-id-1', status: 'open' })
    );
    expect(result.invoices).toHaveLength(1);
    expect(result.pagination).toHaveProperty('total', 1);
  });
});
