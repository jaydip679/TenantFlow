'use strict';

/**
 * Webhook Handler
 *
 * Handles POST /payments/webhook from Razorpay.
 *
 * CRITICAL security order (MUST NOT be changed):
 *   1. Return HTTP 200 immediately (Razorpay requires fast ACK)
 *   2. Verify HMAC-SHA256 signature AFTER returning 200
 *   3. If invalid → log warning, no processing
 *   4. If valid → idempotency check via WebhookLog
 *   5. Create WebhookLog (status='queued')
 *   6. Enqueue job based on event type
 *
 * ⚠️ The webhook route MUST receive express.raw() body (not JSON-parsed).
 *    This is configured in app.js BEFORE express.json() for the webhook path.
 *
 * REF: docs/SRS.md §7 — POST /webhook
 * REF: docs/IMPLEMENTATION_ROADMAP.md §8.1 T5.6
 */

const WebhookLog       = require('../../models/WebhookLog.model');
const { verifyRazorpayWebhookSignature } = require('../../shared/utils/cryptoUtils');
const { enqueuePaymentVerification }     = require('../../queues/payment.queue');
const logger           = require('../../shared/utils/logger');

/**
 * Handle incoming Razorpay webhook.
 * Called by the webhook route controller.
 *
 * @param {Buffer} rawBody      - Raw request body (must NOT be JSON.parsed)
 * @param {string} signature    - X-Razorpay-Signature header value
 * @param {Object} [parsedBody] - JSON.parse(rawBody) — parsed separately after signature check
 */
const handleWebhook = async (rawBody, signature, parsedBody) => {
  // 2. Verify HMAC signature
  const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isValid) {
    logger.warn({ signature }, 'Webhook signature verification FAILED — ignoring payload');
    return;  // Silently ignore — already returned 200 to Razorpay
  }

  const event   = parsedBody?.event;
  const payment = parsedBody?.payload?.payment?.entity;
  const razorpayPaymentId = payment?.id;
  const razorpayOrderId   = payment?.order_id;

  if (!event || !razorpayPaymentId) {
    logger.warn({ event, parsedBody }, 'Webhook payload missing required fields — ignoring');
    return;
  }

  // 4. Idempotency: check if already processed
  const existing = await WebhookLog.findOne({ razorpayPaymentId }).lean();
  if (existing && existing.status === 'processed') {
    logger.info({ razorpayPaymentId, event }, 'Webhook already processed — idempotent skip');
    return;
  }

  // If still queued/processing, skip to avoid double-processing
  if (existing && existing.status !== 'failed') {
    logger.info({ razorpayPaymentId, event, status: existing.status }, 'Webhook already in progress — skip');
    return;
  }

  // 5. Create WebhookLog (status='queued')
  let webhookLog;
  try {
    webhookLog = await WebhookLog.create({
      razorpayPaymentId,
      razorpayOrderId: razorpayOrderId || null,
      event,
      status:     'queued',
      rawPayload: parsedBody,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Unique index violation — webhook received twice, already being processed
      logger.info({ razorpayPaymentId, event }, 'Webhook duplicate (unique index) — skip');
      return;
    }
    logger.error({ err: err.message, razorpayPaymentId }, 'Failed to create WebhookLog');
    return;  // Fail silently — already returned 200
  }

  // 6. Enqueue job based on event type
  try {
    if (event === 'payment.captured' || event === 'payment.failed' || event === 'subscription.charged') {
      await enqueuePaymentVerification(
        event,
        razorpayOrderId,
        razorpayPaymentId,
        parsedBody?.payload,
        'webhook',
        webhookLog._id.toString()
      );
      logger.info({ razorpayPaymentId, event }, 'Webhook enqueued to payment-verify-queue');
    } else {
      // Unknown event type — mark as processed (we don't handle it)
      await WebhookLog.findByIdAndUpdate(webhookLog._id, { status: 'processed', processedAt: new Date() });
      logger.info({ event }, 'Webhook event type not handled — marked processed');
    }
  } catch (err) {
    logger.error({ err: err.message, webhookLogId: webhookLog._id }, 'Failed to enqueue webhook job');
    await WebhookLog.findByIdAndUpdate(webhookLog._id, { status: 'failed', errorMessage: err.message });
  }
};

module.exports = { handleWebhook };
