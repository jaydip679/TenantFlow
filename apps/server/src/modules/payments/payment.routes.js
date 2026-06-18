'use strict';

/**
 * Payment Routes
 *
 * Base path: /api/v1/payments
 *
 * ⚠️ IMPORTANT: The webhook route uses express.raw() body parser (not express.json()).
 * The express.raw() middleware is applied only to /webhook in this router.
 * All other routes use the global express.json() already configured in app.js.
 *
 * REF: docs/SRS.md §7.1 — Payment endpoint specifications
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.1 T5.6
 */

const express            = require('express');
const paymentController  = require('./payment.controller');
const { authenticate }   = require('../../shared/middleware/authenticate.middleware');
const { authorize }      = require('../../shared/middleware/authorize.middleware');
const { tenantScope }    = require('../../shared/middleware/tenantScope.middleware');
const { validate }       = require('../../shared/middleware/validate.middleware');
const {
  createOrderSchema,
  verifyPaymentSchema,
  paymentHistorySchema,
  refundSchema,
} = require('./payment.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: payments
 *   description: Payment processing, verification, and refunds
 */

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Razorpay webhook receiver
 *     description: |
 *       No authentication — secured by HMAC-SHA256 signature + IP whitelist.
 *       Returns 200 immediately before any processing.
 *       Body must be raw (not JSON-parsed) for signature verification.
 *     tags: [payments]
 *     responses:
 *       200:
 *         description: Webhook received (always returned, even if invalid)
 */
router.post(
  '/webhook',
  // ⚠️ express.raw() MUST be first — overrides global express.json() for this route
  express.raw({ type: 'application/json' }),
  paymentController.webhook
);

/**
 * @swagger
 * /payments/orders:
 *   post:
 *     summary: Create Razorpay order for an invoice
 *     description: |
 *       Idempotent: returns existing order if a 'created' transaction exists within 30 minutes.
 *       Returns 409 INVOICE_ALREADY_PAID if invoice is paid.
 *       Returns 404 if invoice is voided.
 *     tags: [payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceId]
 *             properties:
 *               invoiceId: { type: string }
 *     responses:
 *       201:
 *         description: Razorpay order created
 *       409:
 *         description: INVOICE_ALREADY_PAID
 */
router.post(
  '/orders',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(createOrderSchema),
  paymentController.createOrder
);

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify Razorpay payment signature
 *     description: |
 *       Verifies HMAC-SHA256 signature, then enqueues processing job.
 *       Returns 200 immediately — do not wait for processing.
 *       Frontend should listen on Socket.IO for payment:success or payment:failed.
 *       Returns 400 PAYMENT_SIGNATURE_INVALID if signature is wrong.
 *     tags: [payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpayOrderId, razorpayPaymentId, razorpaySignature]
 *             properties:
 *               razorpayOrderId:   { type: string }
 *               razorpayPaymentId: { type: string }
 *               razorpaySignature: { type: string }
 *     responses:
 *       200:
 *         description: Payment verification enqueued
 *       400:
 *         description: PAYMENT_SIGNATURE_INVALID
 */
router.post(
  '/verify',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(verifyPaymentSchema),
  paymentController.verifyPayment
);

/**
 * @swagger
 * /payments/history/{tenantId}:
 *   get:
 *     summary: Get payment transaction history for a tenant
 *     tags: [payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get(
  '/history/:tenantId',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(paymentHistorySchema),
  paymentController.getPaymentHistory
);

/**
 * @swagger
 * /payments/refund/{transactionId}:
 *   post:
 *     summary: Initiate a refund (super admin only)
 *     description: |
 *       Only 'captured' transactions can be refunded.
 *       Returns 409 REFUND_NOT_ELIGIBLE if transaction is not captured.
 *     tags: [payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Refund initiated
 *       409:
 *         description: REFUND_NOT_ELIGIBLE
 */
router.post(
  '/refund/:transactionId',
  authenticate,
  authorize('super_admin'),
  validate(refundSchema),
  paymentController.initiateRefund
);

module.exports = router;
