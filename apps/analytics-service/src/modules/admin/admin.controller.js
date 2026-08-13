'use strict';

const adminService = require('./admin.service');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const listTenants = asyncHandler(async (req, res) => {
  const { tenants, pagination } = await adminService.listTenants(
    {
      status: req.query.status,
      riskLevel: req.query.riskLevel,
    },
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { tenants, pagination } });
});

const listAllInvoices = asyncHandler(async (req, res) => {
  const { invoices, pagination } = await adminService.listAllInvoices(
    { status: req.query.status, tenantId: req.query.tenantId },
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { invoices, pagination } });
});

module.exports = {
  listTenants,
  listAllInvoices,
};
