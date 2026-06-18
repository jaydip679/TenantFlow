'use strict';

/**
 * Payment Controller
 * Thin HTTP layer — delegates to payment.service and webhook.handler.
 * REF: docs/SRS.md §7 — Payments Module
 */

const paymentService  = require('./payment.service');
const { handleWebhook } = require('./webhook.handler');
const { asyncHandler }  = require('../../shared/utils/asyncHandler');
const logger            = require('../../shared/utils/logger');

/**
 * POST /orders — Create Razorpay order for an invoice
 */
const createOrder = asyncHandler(async (req, res) => {
  const orderData = await paymentService.createOrder(req.user.tenantId, req.body.invoiceId);
  res.status(201).json({ success: true, data: orderData });
});

/**
 * POST /verify — Verify Razorpay payment after client checkout
 * Returns 200 immediately; processing happens asynchronously via BullMQ.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyPayment(req.user.tenantId, req.body);
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /history/:tenantId — Get paginated payment history
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const { transactions, pagination } = await paymentService.getPaymentHistory(
    req.params.tenantId,
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { transactions, pagination } });
});

/**
 * POST /refund/:transactionId — Initiate refund (super admin only)
 */
const initiateRefund = asyncHandler(async (req, res) => {
  const transaction = await paymentService.initiateRefund(
    req.params.transactionId,
    req.body.reason,
    req.user
  );
  res.status(200).json({ success: true, data: { transaction } });
});

/**
 * POST /webhook — Razorpay webhook receiver
 *
 * CRITICAL: Return 200 FIRST, then process asynchronously.
 * Body is raw Buffer (express.raw middleware set in payment.routes.js).
 */
const webhook = async (req, res) => {
  // ── STEP 1: Return 200 immediately (before ANY processing) ──
  // Razorpay requires a fast HTTP 200 response to consider the webhook delivered.
  // Any delay causes Razorpay to retry.
  res.status(200).json({ received: true });

  // ── STEP 2: Process asynchronously (after response sent) ─────
  try {
    const rawBody   = req.body;   // Buffer (express.raw)
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      logger.warn({ path: req.path }, 'Webhook received without signature header — ignoring');
      return;
    }

    // Parse body separately (after we've already sent 200)
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody.toString());
    } catch (parseErr) {
      logger.warn({ err: parseErr.message }, 'Webhook body JSON parse failed — ignoring');
      return;
    }

    await handleWebhook(rawBody, signature, parsedBody);
  } catch (err) {
    // Never propagate errors on webhook — 200 already sent
    logger.error({ err: err.message }, 'Webhook processing error (non-fatal)');
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  initiateRefund,
  webhook,
};
