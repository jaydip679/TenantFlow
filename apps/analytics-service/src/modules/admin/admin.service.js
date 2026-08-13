'use strict';

const mongoose = require('mongoose');
const ReadTenant = require('../../models/ReadTenant.model');
const ReadSubscription = require('../../models/ReadSubscription.model');
const ReadInvoice = require('../../models/ReadInvoice.model');

const parsePagination = (options) => {
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.max(parseInt(options.limit, 10) || 20, 1);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

const listTenants = async (filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const matchStage = {};
  if (filters.status) matchStage.status = filters.status;
  
  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'analytics_read_subscriptions',
        localField: 'tenantId',
        foreignField: 'tenantId',
        as: 'subscription',
      },
    },
    { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'tenantchurnscores',
        localField: 'tenantId',
        foreignField: 'tenantId',
        as: 'churnScore',
      },
    },
    { $unwind: { path: '$churnScore', preserveNullAndEmptyArrays: true } },
    ...(filters.riskLevel ? [{ $match: { 'churnScore.riskLevel': filters.riskLevel } }] : []),
    {
      $project: {
        _id: 0,
        id: '$tenantId',
        name: 1,
        slug: 1,
        status: 1,
        createdAt: 1,
        subscriptionStatus: { $ifNull: ['$subscription.status', null] },
        planName:           { $ifNull: ['$subscription.planName', null] },
        planInterval:       { $ifNull: ['$subscription.planInterval', null] },
        mrrContributionPaise: {
          $cond: [
            { $eq: ['$subscription.planInterval', 'annual'] },
            { $divide: [{ $ifNull: ['$subscription.planPrice', 0] }, 12] },
            { $ifNull: ['$subscription.planPrice', 0] },
          ],
        },
        usedSeats:          { $ifNull: ['$subscription.seatCount', 0] },
        totalSeats:         { $ifNull: ['$subscription.maxSeats', 0] },
        churnRiskScore:     { $ifNull: ['$churnScore.churnRiskScore', null] },
        riskLevel:          { $ifNull: ['$churnScore.riskLevel', null] },
      },
    },
    { $sort: { createdAt: -1 } },
  ];

  const [tenants, countResult] = await Promise.all([
    ReadTenant.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    ReadTenant.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const formattedTenants = tenants.map(t => {
    const formatted = { ...t, _id: t.id }; // Simplified string ID for frontend compatibility
    delete formatted.id;
    return formatted;
  });

  const total = countResult[0]?.total || 0;
  return { tenants: formattedTenants, pagination: paginationMeta(total, page, limit) };
};

const listAllInvoices = async (filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const filter = {};
  if (filters.status) filter.status = filters.status;
  if (filters.tenantId) filter.tenantId = filters.tenantId;

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'analytics_read_tenants',
        localField: 'tenantId',
        foreignField: 'tenantId',
        as: 'tenant'
      }
    },
    { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        invoiceId: 1,
        tenantId: {
          _id: '$tenantId',
          name: '$tenant.name',
          slug: '$tenant.slug'
        },
        status: 1,
        invoiceNumber: 1,
        total: 1,
        amountDue: 1,
        dueDate: 1,
        amountPaid: 1,
        paidAt: 1,
        currency: 1,
        createdAt: 1
      }
    },
    { $sort: { createdAt: -1 } }
  ];

  const [invoices, countResult] = await Promise.all([
    ReadInvoice.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    ReadInvoice.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const formattedInvoices = invoices.map(inv => ({
    ...inv,
    _id: inv.invoiceId // Simplified string ID
  }));

  const totalCount = countResult[0]?.total || 0;
  return { invoices: formattedInvoices, pagination: paginationMeta(totalCount, page, limit) };
};

module.exports = {
  listTenants,
  listAllInvoices,
};
