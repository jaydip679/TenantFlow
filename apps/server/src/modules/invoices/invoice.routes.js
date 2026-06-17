'use strict';

/**
 * Invoice Routes
 *
 * Base path: /api/v1/invoices
 *
 * REF: docs/SRS.md §6.1 — Invoice endpoint specifications
 */

const express             = require('express');
const invoiceController   = require('./invoice.controller');
const { authenticate }    = require('../../shared/middleware/authenticate.middleware');
const { authorize }       = require('../../shared/middleware/authorize.middleware');
const { tenantScope }     = require('../../shared/middleware/tenantScope.middleware');
const { validate }        = require('../../shared/middleware/validate.middleware');
const {
  listInvoicesSchema,
  invoiceIdSchema,
  voidSchema,
  listAllSchema,
} = require('./invoice.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: invoices
 *   description: Invoice lifecycle and PDF management
 */

/**
 * @swagger
 * /invoices/admin/all:
 *   get:
 *     summary: List all invoices (super admin)
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, open, paid, void, uncollectible] }
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated invoice list
 */
router.get(
  '/admin/all',
  authenticate,
  authorize('super_admin'),
  validate(listAllSchema),
  invoiceController.listAllInvoices
);

/**
 * @swagger
 * /invoices/tenant/{tenantId}:
 *   get:
 *     summary: List invoices for a tenant
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, open, paid, void, uncollectible] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated invoice list
 */
router.get(
  '/tenant/:tenantId',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(listInvoicesSchema),
  invoiceController.listInvoices
);

/**
 * @swagger
 * /invoices/{invoiceId}/pdf:
 *   get:
 *     summary: Get signed PDF URL
 *     description: |
 *       Returns 202 with retryAfter=30 if PDF is not yet generated.
 *       Returns 200 with a signed Cloudinary URL (24h validity) when ready.
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Signed PDF URL
 *       202:
 *         description: PDF generation in progress
 */
router.get(
  '/:invoiceId/pdf',
  authenticate,
  invoiceController.getPdfUrl
);

/**
 * @swagger
 * /invoices/{invoiceId}/void:
 *   post:
 *     summary: Void an open invoice (super admin only)
 *     description: |
 *       Only 'open' invoices can be voided.
 *       Returns 409 INVOICE_ALREADY_PAID if status is 'paid'.
 *       Also resolves any active DunningRecord for this invoice.
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Invoice voided
 *       409:
 *         description: INVOICE_ALREADY_PAID | INVOICE_NOT_OPEN | INVOICE_VOID
 */
router.post(
  '/:invoiceId/void',
  authenticate,
  authorize('super_admin'),
  validate(voidSchema),
  invoiceController.voidInvoice
);

/**
 * @swagger
 * /invoices/{invoiceId}/send:
 *   post:
 *     summary: Resend invoice email to billing contact
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Email queued
 */
router.post(
  '/:invoiceId/send',
  authenticate,
  authorize('tenant_admin', 'super_admin'),
  validate(invoiceIdSchema),
  invoiceController.sendInvoiceEmail
);

/**
 * @swagger
 * /invoices/{invoiceId}:
 *   get:
 *     summary: Get a single invoice by ID
 *     tags: [invoices]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice detail
 *       403:
 *         description: Access denied (tenantId mismatch)
 *       404:
 *         description: INVOICE_NOT_FOUND
 */
router.get(
  '/:invoiceId',
  authenticate,
  validate(invoiceIdSchema),
  invoiceController.getInvoice
);

module.exports = router;
