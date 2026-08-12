'use strict';

/**
 * Invoice Service
 *
 * Core invoice lifecycle management.
 *
 * CRITICAL: generateInvoice() and generatePdf() are called from BullMQ workers ONLY.
 * They must NEVER be called directly from controllers.
 *
 * Redis lock pattern for generateInvoice():
 *   Key: lock:invoice:{subscriptionId}
 *   Strategy: SET NX EX 300 (5-minute exclusive lock)
 *   Purpose: Prevents duplicate invoice generation under concurrent load
 *
 * Idempotency: Duplicate check before creating invoice.
 *   If an invoice already exists for same tenantId + periodStart (non-void),
 *   the function returns early with the existing invoice.
 *
 * Tax computation: Math.round(subtotal * taxRate / 100) — integer paise only.
 *
 * REF: docs/SRS.md §6.2 — Invoice Generation Process
 * REF: docs/IMPLEMENTATION_ROADMAP.md §7.1 T4.5
 */

const mongoose  = require('mongoose');
const Invoice   = require('../../models/Invoice.model');
const Subscription   = require('../../models/Subscription.model');
const identityFacade = require('../../shared/facades/identity.facade');
const { AppError }   = require('../../shared/errors/AppError');
const { ERROR_CODES }       = require('../../shared/errors/errorCodes');
const { generateInvoiceNumber } = require('../../shared/utils/invoiceNumber');
const { createAuditLog }        = require('../../shared/utils/auditLogService');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const {
  buildRenewalLineItems,
  buildUpgradeLineItems,
  calculateTotals,
} = require('./invoice.lineitem.builder');
const { generateInvoicePdf } = require('./invoice.pdf.template');
const { enqueueEmail }       = require('../../queues/email.queue');
const redisClient            = require('../../config/redis');
const logger                 = require('../../shared/utils/logger');

const DEFAULT_TAX_RATE = parseInt(process.env.TAX_RATE || '18', 10);

// ── Redis Lock Helpers ─────────────────────────────────────────
const acquireLock = async (lockKey, ttlSeconds = 300) => {
  const result = await redisClient.set(lockKey, '1', 'NX', 'EX', ttlSeconds);
  return result === 'OK';
};

const releaseLock = async (lockKey) => {
  await redisClient.del(lockKey).catch((err) =>
    logger.warn({ err: err.message, lockKey }, 'Failed to release invoice lock')
  );
};

// ── generateInvoice() ──────────────────────────────────────────
/**
 * Generate an invoice for a subscription billing event.
 * Called by invoice.worker.js ONLY.
 *
 * Steps:
 *   1. Acquire Redis lock (NX, EX 300) — prevent concurrent generation
 *   2. Duplicate check — idempotent (returns existing if found)
 *   3. Generate invoice number (atomic counter)
 *   4. Build line items based on triggerReason
 *   5. Calculate subtotal, taxAmount, total (integer paise)
 *   6. Create Invoice (draft → open)
 *   7. Release Redis lock
 *   8. Enqueue pdf-queue job
 *   9. Enqueue notification stub (Phase 7: log only)
 *
 * @param {string} subscriptionId
 * @param {string} triggerReason  - 'renewal' | 'upgrade' | 'seat_addition' | 'manual'
 * @param {Object} [upgradeContext] - Required for 'upgrade': { oldPlanVersionId, newPlanVersionId, proration }
 * @returns {Promise<Invoice>}
 */
const generateInvoice = async (subscriptionId, triggerReason, upgradeContext = null) => {
  const lockKey = `lock:invoice:${subscriptionId}`;
  let lockAcquired = false;

  try {
    // 1. Acquire exclusive lock (NX = only set if not exists)
    lockAcquired = await acquireLock(lockKey, 300);
    if (!lockAcquired) {
      throw new AppError(
        'Invoice generation already in progress for this subscription.',
        409,
        ERROR_CODES.INVOICE_LOCK_HELD,
        { subscriptionId }
      );
    }

    // 2. Load subscription
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      throw new AppError('Subscription not found.', 404, ERROR_CODES.SUBSCRIPTION_NOT_FOUND);
    }

    const { tenantId, currentPeriodStart, currentPeriodEnd } = subscription;

    // 3. Idempotency — duplicate check
    const existingInvoice = await Invoice.findOne({
      tenantId,
      periodStart: currentPeriodStart,
      status:      { $ne: 'void' },
    });

    if (existingInvoice) {
      logger.info(
        { subscriptionId, existingInvoiceId: existingInvoice._id },
        'Invoice already exists for this period — skipping (idempotent)'
      );
      return existingInvoice;
    }

    // 4. Generate invoice number (atomic MongoDB counter)
    const invoiceNumber = await generateInvoiceNumber();

    // 5. Build line items
    let lineItems;

    if (triggerReason === 'upgrade' && upgradeContext) {
      const { oldPlanVersionId, newPlanVersionId, proration } = upgradeContext;
      const [oldPV, newPV] = await Promise.all([
        identityFacade.getPlanVersion(oldPlanVersionId),
        identityFacade.getPlanVersion(newPlanVersionId),
      ]);
      lineItems = buildUpgradeLineItems(oldPV, newPV, proration);
    } else {
      // renewal (default) or manual
      const planVersion = await identityFacade.getPlanVersion(subscription.planVersionId);
      lineItems = buildRenewalLineItems(subscription, planVersion);
    }

    // 6. Calculate totals (integer paise, no floats)
    const { subtotal, taxAmount, total } = calculateTotals(lineItems, DEFAULT_TAX_RATE);

    // Due date = today (invoices are due immediately for SaaS)
    const dueDate = new Date();

    // 7. Create Invoice in 'open' status and emit event (Transactional)
    const session = await mongoose.startSession();
    let invoice;
    try {
      await session.withTransaction(async () => {
        [invoice] = await Invoice.create([{
          tenantId,
          subscriptionId,
          invoiceNumber,
          status:    'open',
          periodStart: currentPeriodStart,
          periodEnd:   currentPeriodEnd,
          dueDate,
          lineItems,
          subtotal,
          taxRate:   DEFAULT_TAX_RATE,
          taxAmount,
          total,
          amountPaid: 0,
          amountDue:  total,
          currency:   'INR',
          metadata:   new Map([['triggerReason', triggerReason]]),
        }], { session });

        const { addEventToOutbox } = require('../../shared/events/outbox.helper');
        await addEventToOutbox({
          eventType: 'invoice.created',
          eventVersion: 'v1',
          producer: 'billing-service',
          aggregateType: 'invoice',
          aggregateId: invoice._id.toString(),
          tenantId: tenantId.toString(),
          payload: {
            invoiceId: invoice._id.toString(),
            subscriptionId: subscriptionId.toString(),
            invoiceNumber,
            amount: total,
            currency: 'INR',
            dueDate: invoice.dueDate,
            status: 'open',
            aggregateVersion: invoice.aggregateVersion
          },
          session
        });
      });
    } finally {
      session.endSession();
    }

    logger.info(
      { invoiceId: invoice._id, invoiceNumber, subscriptionId, total },
      'Invoice generated successfully'
    );

    // 8. Release lock before enqueueing (lock is no longer needed)
    await releaseLock(lockKey);
    lockAcquired = false;

    // 9. Enqueue PDF generation
    try {
      const { enqueuePdfGeneration } = require('../../queues/pdf.queue');
      await enqueuePdfGeneration(invoice._id.toString());
    } catch (err) {
      logger.warn({ err: err.message, invoiceId: invoice._id }, 'Failed to enqueue PDF generation');
    }

    // 10. Notification stub (Phase 7) — log only for now
    logger.info(
      { invoiceId: invoice._id, tenantId, type: 'invoice_generated' },
      '[Phase 7 stub] Notification enqueue: invoice_generated'
    );

    return invoice;
  } finally {
    if (lockAcquired) {
      await releaseLock(lockKey);
    }
  }
};



// ── Public CRUD Methods ────────────────────────────────────────

/**
 * Get a single invoice — verifies tenantId scope.
 * @param {string} invoiceId
 * @param {string} tenantId
 */
const getInvoice = async (invoiceId, tenantId) => {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new AppError('Invoice not found.', 404, ERROR_CODES.INVOICE_NOT_FOUND);

  // Tenant scope check
  if (invoice.tenantId.toString() !== tenantId.toString()) {
    throw new AppError('Access denied.', 403, ERROR_CODES.FORBIDDEN);
  }

  return invoice;
};

/**
 * List invoices for a tenant with optional status + date filters.
 * @param {string} tenantId
 * @param {Object} filters  - { status?, periodStart_gte?, periodStart_lte? }
 * @param {Object} options  - { page?, limit?, sortBy?, sortOrder? }
 */
const listInvoices = async (tenantId, filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const sortBy    = options.sortBy    || 'createdAt';
  const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

  // Build query — always lead with tenantId (compound index rule)
  const query = { tenantId };

  if (filters.status) query.status = filters.status;

  if (filters['periodStart[gte]'] || filters['periodStart[lte]']) {
    query.periodStart = {};
    if (filters['periodStart[gte]']) query.periodStart.$gte = new Date(filters['periodStart[gte]']);
    if (filters['periodStart[lte]']) query.periodStart.$lte = new Date(filters['periodStart[lte]']);
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(query),
  ]);

  return { invoices, pagination: paginationMeta(total, page, limit) };
};

/**
 * Void an open invoice.
 * Only 'open' status can be voided. Paid invoices → 409.
 * Resolves any active DunningRecord linked to this invoice.
 *
 * @param {string} invoiceId
 * @param {string} reason
 * @param {Object} actorUser
 */
const voidInvoice = async (invoiceId, reason, actorUser) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found.', 404, ERROR_CODES.INVOICE_NOT_FOUND);

  if (invoice.status === 'paid') {
    throw new AppError('Cannot void a paid invoice.', 409, ERROR_CODES.INVOICE_ALREADY_PAID);
  }

  if (invoice.status === 'void') {
    throw new AppError('Invoice is already voided.', 409, ERROR_CODES.INVOICE_VOID);
  }

  if (invoice.status !== 'open') {
    throw new AppError('Only open invoices can be voided.', 409, ERROR_CODES.INVOICE_NOT_OPEN);
  }

  const before = invoice.toObject();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      invoice.status    = 'void';
      invoice.voidedAt  = new Date();
      invoice.voidReason = reason || null;
      await invoice.save({ session });

      // Resolve any active DunningRecord linked to this invoice (Phase 6 concern — stubbed here)
      try {
        const DunningRecord = require('../../models/DunningRecord.model');
        await DunningRecord.findOneAndUpdate(
          { invoiceId, status: 'active' },
          { status: 'resolved', resolvedAt: new Date() },
          { session }
        );
      } catch (err) {
        // DunningRecord model may not exist yet — log and continue
        logger.warn({ err: err.message, invoiceId }, 'Failed to resolve dunning record (Phase 6 stub)');
      }

      const { addEventToOutbox } = require('../../shared/events/outbox.helper');
      await addEventToOutbox({
        eventType: 'invoice.voided',
        eventVersion: 'v1',
        producer: 'billing-service',
        aggregateType: 'invoice',
        aggregateId: invoice._id.toString(),
        tenantId: invoice.tenantId.toString(),
        payload: {
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          voidReason: reason || null,
          aggregateVersion: invoice.aggregateVersion
        },
        session
      });
    });
  } finally {
    session.endSession();
  }

  await createAuditLog({
    event:        'invoice.voided',
    resourceType: 'invoice',
    resourceId:   invoice._id,
    tenantId:     invoice.tenantId,
    actor:        actorUser,
    before,
    after:        invoice.toObject(),
  });

  return invoice.toObject();
};

/**
 * Get signed Cloudinary PDF URL (24-hour validity).
 * Returns null + signals 202 if PDF not yet generated.
 *
 * @param {string} invoiceId
 * @param {string} tenantId
 * @returns {Promise<{ url: string|null, ready: boolean }>}
 */
const getPdfUrl = async (invoiceId, tenantId) => {
  const invoice = await Invoice.findById(invoiceId).select('tenantId pdfUrl').lean();
  if (!invoice) throw new AppError('Invoice not found.', 404, ERROR_CODES.INVOICE_NOT_FOUND);

  if (invoice.tenantId.toString() !== tenantId.toString()) {
    throw new AppError('Access denied.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (!invoice.pdfUrl) {
    return { url: null, ready: false };
  }

  // Generate Cloudinary signed URL (valid 24 hours)
  try {
    const cloudinary = require('../../config/cloudinary');
    // Extract public ID from the stored URL
    const urlParts = invoice.pdfUrl.split('/upload/');
    const publicIdWithExt = urlParts[1];
    const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');

    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type:          'upload',
      sign_url:      true,
      expires_at:    Math.floor(Date.now() / 1000) + 86400, // 24 hours
    });

    return { url: signedUrl, ready: true };
  } catch (err) {
    // If signing fails, return the stored URL as-is
    logger.warn({ err: err.message, invoiceId }, 'Failed to generate signed Cloudinary URL — returning raw URL');
    return { url: invoice.pdfUrl, ready: true };
  }
};

/**
 * List all invoices — super admin only.
 * @param {Object} filters
 * @param {Object} options
 */
const listAllInvoices = async (filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

  const query = {};
  if (filters.status)   query.status   = filters.status;
  if (filters.tenantId) query.tenantId = filters.tenantId;

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(query),
  ]);

  // Avoid N+1 by bulk fetching tenants
  const tenantIds = [...new Set(invoices.map((inv) => inv.tenantId.toString()))];
  const tenantProfiles = await identityFacade.getTenantProfiles(tenantIds);
  
  invoices.forEach((inv) => {
    inv.tenantId = tenantProfiles[inv.tenantId.toString()] || null;
  });

  return { invoices, pagination: paginationMeta(total, page, limit) };
};

module.exports = {
  generateInvoice,
  getInvoice,
  listInvoices,
  voidInvoice,
  getPdfUrl,
  listAllInvoices,
};
