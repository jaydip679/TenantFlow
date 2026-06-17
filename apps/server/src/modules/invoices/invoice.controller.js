'use strict';

/**
 * Invoice Controller
 * Thin HTTP layer — delegates to invoice.service.
 * REF: docs/SRS.md §6 — Invoices Module
 */

const invoiceService = require('./invoice.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');

/**
 * GET /tenant/:tenantId — List invoices for a tenant
 */
const listInvoices = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  // Build filters from query params
  const filters = {};
  if (req.query.status)                  filters.status                  = req.query.status;
  if (req.query['periodStart[gte]'])     filters['periodStart[gte]']     = req.query['periodStart[gte]'];
  if (req.query['periodStart[lte]'])     filters['periodStart[lte]']     = req.query['periodStart[lte]'];

  const { invoices, pagination } = await invoiceService.listInvoices(tenantId, filters, {
    page:       req.query.page,
    limit:      req.query.limit,
    sortBy:     req.query.sortBy,
    sortOrder:  req.query.sortOrder,
  });

  res.status(200).json({ success: true, data: { invoices, pagination } });
});

/**
 * GET /:invoiceId — Get single invoice
 */
const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.params.invoiceId, req.user.tenantId || req.query.tenantId);
  res.status(200).json({ success: true, data: { invoice } });
});

/**
 * GET /:invoiceId/pdf — Get signed PDF URL or 202 if not ready
 */
const getPdfUrl = asyncHandler(async (req, res) => {
  // Determine tenantId from authenticated user or super_admin context
  const tenantId = req.user.tenantId || req.query.tenantId;

  // Super admin: load invoice first to get tenantId for scope check
  let resolvedTenantId = tenantId;
  if (req.user.role === 'super_admin') {
    const invoice = await invoiceService.getInvoice(req.params.invoiceId, null);
    resolvedTenantId = invoice.tenantId.toString();
  }

  const { url, ready } = await invoiceService.getPdfUrl(req.params.invoiceId, resolvedTenantId);

  if (!ready) {
    return res.status(202).json({
      success:    true,
      data:       { url: null, ready: false },
      message:    'PDF generation in progress',
      retryAfter: 30,
    });
  }

  res.status(200).json({ success: true, data: { url, ready: true } });
});

/**
 * POST /:invoiceId/void — Void an open invoice (super_admin only)
 */
const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.voidInvoice(
    req.params.invoiceId,
    req.body.reason,
    req.user
  );
  res.status(200).json({ success: true, data: { invoice } });
});

/**
 * POST /:invoiceId/send — Resend invoice email
 */
const sendInvoiceEmail = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(
    req.params.invoiceId,
    req.user.tenantId
  );

  const { enqueueEmail } = require('../../queues/email.queue');
  const Tenant = require('../../models/Tenant.model');
  const tenant = await Tenant.findById(invoice.tenantId).select('name billingEmail').lean();

  await enqueueEmail({
    type:    'invoice_generated',
    to:      tenant.billingEmail,
    firstName: tenant.name,
    templateVars: {
      invoiceNumber: invoice.invoiceNumber,
      total:         invoice.total,
      amountDue:     invoice.amountDue,
      dueDate:       invoice.dueDate,
      pdfUrl:        invoice.pdfUrl,
      tenantName:    tenant.name,
    },
  });

  res.status(200).json({ success: true, data: { message: 'Invoice email queued.' } });
});

/**
 * GET /admin/all — All invoices (super admin)
 */
const listAllInvoices = asyncHandler(async (req, res) => {
  const { invoices, pagination } = await invoiceService.listAllInvoices(
    { status: req.query.status, tenantId: req.query.tenantId },
    { page: req.query.page, limit: req.query.limit, sortOrder: req.query.sortOrder }
  );
  res.status(200).json({ success: true, data: { invoices, pagination } });
});

module.exports = {
  listInvoices,
  getInvoice,
  getPdfUrl,
  voidInvoice,
  sendInvoiceEmail,
  listAllInvoices,
};
