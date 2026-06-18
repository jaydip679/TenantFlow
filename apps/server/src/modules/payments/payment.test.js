'use strict';

/**
 * Phase 5 Payment Tests
 *
 * Covers all acceptance criteria from IMPLEMENTATION_ROADMAP.md §8.2:
 *
 * cryptoUtils:
 *   - verifyRazorpaySignature: correct HMAC-SHA256 verification
 *   - verifyRazorpaySignature: tampered signature returns false
 *   - verifyRazorpayWebhookSignature: valid signature returns true
 *   - verifyRazorpayWebhookSignature: tampered signature returns false
 *
 * payment.service — createOrder():
 *   - Returns existing order if active transaction < 30 min old (idempotency)
 *   - Throws INVOICE_ALREADY_PAID if invoice is paid
 *   - Throws INVOICE_VOID (mapped to NOT_FOUND) if invoice is voided
 *   - Creates new Razorpay order and PaymentTransaction on success
 *
 * payment.service — verifyPayment():
 *   - Throws PAYMENT_SIGNATURE_INVALID for tampered signature
 *   - Returns alreadyProcessed=true if PaymentTransaction already captured
 *   - Enqueues payment-verify job for valid signature
 *
 * payment.service — initiateRefund():
 *   - Throws PAYMENT_NOT_FOUND if transaction doesn't exist
 *   - Throws REFUND_NOT_ELIGIBLE if transaction is not 'captured'
 *
 * webhook.handler:
 *   - Returns without processing on invalid signature
 *   - Skips if WebhookLog already exists and processed (idempotency)
 *   - Creates WebhookLog and enqueues job for valid payment.captured
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.2 — Phase 5 Acceptance Criteria
 */

// ── Mocks ─────────────────────────────────────────────────────
jest.mock('../../models/Invoice.model');
jest.mock('../../models/PaymentTransaction.model');
jest.mock('../../models/WebhookLog.model');
jest.mock('../../config/razorpay', () => ({
  orders:   { create: jest.fn() },
  payments: { refund: jest.fn() },
}));
jest.mock('../../queues/payment.queue', () => ({
  enqueuePaymentVerification: jest.fn().mockResolvedValue({}),
  QUEUE_NAME: 'payment-verify-queue',
}));
jest.mock('../../shared/utils/auditLogService', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

const Invoice            = require('../../models/Invoice.model');
const PaymentTransaction = require('../../models/PaymentTransaction.model');
const WebhookLog         = require('../../models/WebhookLog.model');
const razorpay           = require('../../config/razorpay');
const { enqueuePaymentVerification } = require('../../queues/payment.queue');
const { verifyRazorpaySignature, verifyRazorpayWebhookSignature } = require('../../shared/utils/cryptoUtils');
const paymentService     = require('./payment.service');
const { handleWebhook }  = require('./webhook.handler');
const { ERROR_CODES }    = require('../../shared/errors/errorCodes');
const crypto             = require('crypto');

// ── Setup env for crypto functions ────────────────────────────
const TEST_KEY_SECRET     = 'test_secret_key_for_razorpay_tests!';
const TEST_WEBHOOK_SECRET = 'test_webhook_secret_for_razorpay_test';

beforeAll(() => {
  process.env.RAZORPAY_KEY_SECRET     = TEST_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.RAZORPAY_KEY_ID         = 'rzp_test_key_id';
});

beforeEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────
const makeInvoice = (o = {}) => ({
  _id:            { toString: () => 'inv-id-1' },
  tenantId:       { toString: () => 'tenant-id-1' },
  subscriptionId: 'sub-id-1',
  invoiceNumber:  'INV-2024-00001',
  status:         'open',
  amountDue:      117882,
  total:          117882,
  currency:       'INR',
  ...o,
});

const makeTransaction = (o = {}) => ({
  _id:                { toString: () => 'tx-id-1' },
  tenantId:           'tenant-id-1',
  invoiceId:          'inv-id-1',
  razorpayOrderId:    'order_test123',
  razorpayPaymentId:  null,
  status:             'created',
  amount:             117882,
  save:               jest.fn().mockResolvedValue(undefined),
  toObject:           jest.fn().mockReturnValue({ status: o.status || 'created' }),
  ...o,
});

const actor = { id: 'actor-id', role: 'super_admin', email: 'admin@tf.com' };

// ── cryptoUtils Tests ─────────────────────────────────────────
describe('cryptoUtils.verifyRazorpaySignature()', () => {
  it('returns true for correct HMAC-SHA256 signature', () => {
    const orderId   = 'order_test123';
    const paymentId = 'pay_test456';
    const signature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(verifyRazorpaySignature(orderId, paymentId, signature)).toBe(true);
  });

  it('returns false for tampered signature', () => {
    const result = verifyRazorpaySignature('order_test', 'pay_test', 'aabbccdd0011');
    expect(result).toBe(false);
  });

  it('returns false when signature length does not match', () => {
    const result = verifyRazorpaySignature('order_test', 'pay_test', 'short');
    expect(result).toBe(false);
  });
});

describe('cryptoUtils.verifyRazorpayWebhookSignature()', () => {
  it('returns true for correctly signed webhook body', () => {
    const body      = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const signature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    expect(verifyRazorpayWebhookSignature(body, signature)).toBe(true);
  });

  it('returns false for tampered webhook signature', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    expect(verifyRazorpayWebhookSignature(body, 'tampered_signature_000')).toBe(false);
  });
});

// ── paymentService.createOrder() ──────────────────────────────
describe('paymentService.createOrder()', () => {
  it('throws INVOICE_ALREADY_PAID when invoice is paid', async () => {
    Invoice.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeInvoice({ status: 'paid' })) });
    await expect(paymentService.createOrder('tenant-id-1', 'inv-id-1'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_ALREADY_PAID });
  });

  it('throws INVOICE_VOID when invoice is voided', async () => {
    Invoice.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeInvoice({ status: 'void' })) });
    await expect(paymentService.createOrder('tenant-id-1', 'inv-id-1'))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVOICE_VOID });
  });

  it('returns existing order when active transaction < 30 min old (idempotent)', async () => {
    Invoice.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeInvoice()) });
    PaymentTransaction.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeTransaction({ status: 'created' })),
    });

    const result = await paymentService.createOrder('tenant-id-1', 'inv-id-1');

    expect(result.orderId).toBe('order_test123');
    expect(razorpay.orders.create).not.toHaveBeenCalled(); // No new order created
  });

  it('creates Razorpay order and PaymentTransaction when no existing order', async () => {
    Invoice.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(makeInvoice()) });
    PaymentTransaction.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    razorpay.orders.create = jest.fn().mockResolvedValue({ id: 'order_new123' });
    PaymentTransaction.create = jest.fn().mockResolvedValue(makeTransaction({ razorpayOrderId: 'order_new123' }));

    const result = await paymentService.createOrder('tenant-id-1', 'inv-id-1');

    expect(razorpay.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 117882, currency: 'INR', receipt: 'INV-2024-00001' })
    );
    expect(PaymentTransaction.create).toHaveBeenCalled();
    expect(result.orderId).toBe('order_new123');
    expect(result.razorpayKeyId).toBe('rzp_test_key_id');
  });
});

// ── paymentService.verifyPayment() ────────────────────────────
describe('paymentService.verifyPayment()', () => {
  it('throws PAYMENT_SIGNATURE_INVALID for invalid signature', async () => {
    await expect(paymentService.verifyPayment('tenant-id-1', {
      razorpayOrderId:   'order_test',
      razorpayPaymentId: 'pay_test',
      razorpaySignature: 'bad_sig_0000000000000000000000000000000000000000000000000000000000000000',
    })).rejects.toMatchObject({ errorCode: ERROR_CODES.PAYMENT_SIGNATURE_INVALID });
  });

  it('returns alreadyProcessed=true when payment is already captured', async () => {
    // Generate valid signature for this test
    const orderId   = 'order_test';
    const paymentId = 'pay_test';
    const sig = crypto.createHmac('sha256', TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

    PaymentTransaction.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeTransaction({ status: 'captured', razorpayPaymentId: paymentId })),
    });

    const result = await paymentService.verifyPayment('tenant-id-1', {
      razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sig,
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(enqueuePaymentVerification).not.toHaveBeenCalled();
  });

  it('enqueues payment-verify job for valid, non-duplicate signature', async () => {
    const orderId   = 'order_new';
    const paymentId = 'pay_new';
    const sig = crypto.createHmac('sha256', TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

    PaymentTransaction.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const result = await paymentService.verifyPayment('tenant-id-1', {
      razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sig,
    });

    expect(enqueuePaymentVerification).toHaveBeenCalledWith(
      'payment.captured', orderId, paymentId, expect.any(Object), 'client'
    );
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBeUndefined();
  });
});

// ── paymentService.initiateRefund() ───────────────────────────
describe('paymentService.initiateRefund()', () => {
  it('throws PAYMENT_NOT_FOUND when transaction does not exist', async () => {
    PaymentTransaction.findById = jest.fn().mockResolvedValue(null);
    await expect(paymentService.initiateRefund('tx-id-1', 'mistake', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.PAYMENT_NOT_FOUND });
  });

  it('throws REFUND_NOT_ELIGIBLE when transaction is not captured', async () => {
    PaymentTransaction.findById = jest.fn().mockResolvedValue(makeTransaction({ status: 'created' }));
    await expect(paymentService.initiateRefund('tx-id-1', 'mistake', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.REFUND_NOT_ELIGIBLE });
  });
});

// ── webhook.handler ───────────────────────────────────────────
describe('handleWebhook()', () => {
  it('does not process webhook with invalid HMAC signature', async () => {
    const rawBody   = Buffer.from('{"event":"payment.captured"}');
    const signature = 'invalid_sig_000000000000000000000000000000000000000000000000000000000000';
    const parsed    = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test', order_id: 'order_test' } } } };

    await handleWebhook(rawBody, signature, parsed);

    expect(WebhookLog.findOne).not.toHaveBeenCalled();
    expect(enqueuePaymentVerification).not.toHaveBeenCalled();
  });

  it('skips processing when WebhookLog already marked processed (idempotent)', async () => {
    const rawBody    = Buffer.from('{"event":"payment.captured"}');
    const parsedBody = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_dup', order_id: 'order_dup' } } } };
    const signature  = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

    WebhookLog.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'processed' }) });

    await handleWebhook(rawBody, signature, parsedBody);

    expect(enqueuePaymentVerification).not.toHaveBeenCalled();
  });

  it('creates WebhookLog and enqueues job for valid payment.captured', async () => {
    const rawBody    = Buffer.from('{"event":"payment.captured"}');
    const parsedBody = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_new1', order_id: 'order_new1' } } } };
    const signature  = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

    WebhookLog.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    WebhookLog.create  = jest.fn().mockResolvedValue({ _id: 'wl-id-1' });

    await handleWebhook(rawBody, signature, parsedBody);

    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ razorpayPaymentId: 'pay_new1', event: 'payment.captured', status: 'queued' })
    );
    expect(enqueuePaymentVerification).toHaveBeenCalledWith(
      'payment.captured', 'order_new1', 'pay_new1', expect.anything(), 'webhook', 'wl-id-1'
    );
  });
});
