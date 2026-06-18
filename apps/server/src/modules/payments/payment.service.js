'use strict';

/**
 * Payment Service
 *
 * Core payment business logic. Services NEVER accept req/res.
 *
 * Methods:
 *   createOrder(tenantId, invoiceId)
 *   verifyPayment(tenantId, { razorpayOrderId, razorpayPaymentId, razorpaySignature })
 *   getPaymentHistory(tenantId, options)
 *   initiateRefund(transactionId, reason, actorUser)
 *
 * REF: docs/SRS.md §7 — Payments Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.1 T5.5
 */

const Invoice            = require('../../models/Invoice.model');
const PaymentTransaction = require('../../models/PaymentTransaction.model');
const { AppError }       = require('../../shared/errors/AppError');
const { ERROR_CODES }    = require('../../shared/errors/errorCodes');
const { createAuditLog } = require('../../shared/utils/auditLogService');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const { verifyRazorpaySignature } = require('../../shared/utils/cryptoUtils');
const { enqueuePaymentVerification } = require('../../queues/payment.queue');
const logger             = require('../../shared/utils/logger');

// ── createOrder() ──────────────────────────────────────────────
/**
 * Create a Razorpay order for an invoice and record a PaymentTransaction.
 *
 * Steps:
 *   1. Load invoice, verify tenantId matches, check status
 *   2. Return existing 'created' transaction if within 30 minutes (idempotency)
 *   3. Create Razorpay order
 *   4. Create PaymentTransaction (status='created')
 *   5. Return order details + public RAZORPAY_KEY_ID
 *
 * @param {string} tenantId
 * @param {string} invoiceId
 * @returns {Promise<{ orderId, amount, currency, razorpayKeyId, invoiceNumber }>}
 */
const createOrder = async (tenantId, invoiceId) => {
  // 1. Load and validate invoice
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new AppError('Invoice not found.', 404, ERROR_CODES.INVOICE_NOT_FOUND);

  // Tenant scope check
  if (invoice.tenantId.toString() !== tenantId.toString()) {
    throw new AppError('Access denied.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (invoice.status === 'paid') {
    throw new AppError('Invoice is already paid.', 409, ERROR_CODES.INVOICE_ALREADY_PAID);
  }
  if (invoice.status === 'void') {
    throw new AppError('Invoice is voided and cannot be paid.', 404, ERROR_CODES.INVOICE_VOID);
  }

  // 2. Idempotency: existing active order within 30 minutes?
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  const existingTx = await PaymentTransaction.findOne({
    invoiceId,
    status:    { $in: ['created', 'attempted'] },
    createdAt: { $gte: thirtyMinsAgo },
  }).lean();

  if (existingTx) {
    logger.info({ invoiceId, orderId: existingTx.razorpayOrderId }, 'Returning existing Razorpay order');
    return {
      orderId:       existingTx.razorpayOrderId,
      amount:        invoice.amountDue,
      currency:      invoice.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  // 3. Create Razorpay order
  let razorpayOrder;
  try {
    const razorpay = require('../../config/razorpay');
    razorpayOrder = await razorpay.orders.create({
      amount:   invoice.amountDue,  // paise
      currency: invoice.currency || 'INR',
      receipt:  invoice.invoiceNumber,
    });
  } catch (err) {
    logger.error({ err: err.message, invoiceId }, 'Razorpay order creation failed');
    throw new AppError('Payment gateway error.', 502, ERROR_CODES.RAZORPAY_ERROR, { detail: err.message });
  }

  // 4. Create PaymentTransaction
  await PaymentTransaction.create({
    tenantId,
    invoiceId,
    subscriptionId:  invoice.subscriptionId,
    razorpayOrderId: razorpayOrder.id,
    amount:          invoice.amountDue,
    currency:        invoice.currency || 'INR',
    status:          'created',
  });

  return {
    orderId:       razorpayOrder.id,
    amount:        invoice.amountDue,
    currency:      invoice.currency || 'INR',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    invoiceNumber: invoice.invoiceNumber,
  };
};

// ── verifyPayment() ────────────────────────────────────────────
/**
 * Verify Razorpay payment signature and enqueue processing job.
 * Returns 200 immediately — do NOT wait for processing.
 *
 * Steps:
 *   1. Verify HMAC-SHA256 signature
 *   2. Idempotency: already processed? return 200
 *   3. Enqueue payment-verify-queue job
 *   4. Return immediately
 *
 * @param {string} tenantId
 * @param {{ razorpayOrderId, razorpayPaymentId, razorpaySignature }} paymentData
 */
const verifyPayment = async (tenantId, paymentData) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = paymentData;

  // 1. Verify HMAC signature
  const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) {
    throw new AppError('Payment signature verification failed.', 400, ERROR_CODES.PAYMENT_SIGNATURE_INVALID);
  }

  // 2. Idempotency: already captured?
  const existing = await PaymentTransaction.findOne({ razorpayPaymentId }).lean();
  if (existing && existing.status === 'captured') {
    logger.info({ razorpayPaymentId }, 'Payment already processed — idempotent return');
    return { success: true, message: 'Payment already processed.', alreadyProcessed: true };
  }

  // 3. Enqueue payment-verify job
  await enqueuePaymentVerification(
    'payment.captured',
    razorpayOrderId,
    razorpayPaymentId,
    { razorpaySignature },
    'client'
  );

  return { success: true, message: 'Payment being processed. Check notifications for confirmation.' };
};

// ── getPaymentHistory() ────────────────────────────────────────
/**
 * Get paginated payment transaction history for a tenant.
 * @param {string} tenantId
 * @param {Object} options - { page, limit }
 */
const getPaymentHistory = async (tenantId, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const [transactions, total] = await Promise.all([
    PaymentTransaction.find({ tenantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentTransaction.countDocuments({ tenantId }),
  ]);

  return { transactions, pagination: paginationMeta(total, page, limit) };
};

// ── initiateRefund() ───────────────────────────────────────────
/**
 * Initiate a Razorpay refund for a captured payment.
 * Super admin only (enforced at route layer).
 *
 * @param {string} transactionId - PaymentTransaction._id
 * @param {string} reason
 * @param {Object} actorUser
 */
const initiateRefund = async (transactionId, reason, actorUser) => {
  const transaction = await PaymentTransaction.findById(transactionId);
  if (!transaction) {
    throw new AppError('Payment transaction not found.', 404, ERROR_CODES.PAYMENT_NOT_FOUND);
  }

  if (transaction.status !== 'captured') {
    throw new AppError(
      'Only captured payments can be refunded.',
      409,
      ERROR_CODES.REFUND_NOT_ELIGIBLE,
      { currentStatus: transaction.status }
    );
  }

  // Initiate refund via Razorpay
  let refund;
  try {
    const razorpay = require('../../config/razorpay');
    refund = await razorpay.payments.refund(transaction.razorpayPaymentId, {
      amount: transaction.amount,  // Full refund; partial refunds can be specified
      notes:  { reason: reason || 'Admin-initiated refund' },
    });
  } catch (err) {
    logger.error({ err: err.message, transactionId }, 'Razorpay refund failed');
    throw new AppError('Refund initiation failed.', 502, ERROR_CODES.RAZORPAY_ERROR, { detail: err.message });
  }

  const before = transaction.toObject();

  // Update transaction
  transaction.status       = 'refunded';
  transaction.refundId     = refund.id;
  transaction.refundAmount = refund.amount;
  transaction.refundReason = reason || null;
  transaction.refundedAt   = new Date();
  await transaction.save();

  await createAuditLog({
    event:        'payment.refunded',
    resourceType: 'payment_transaction',
    resourceId:   transaction._id,
    tenantId:     transaction.tenantId,
    actor:        actorUser,
    before,
    after:        transaction.toObject(),
  });

  return transaction.toObject();
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  initiateRefund,
};
