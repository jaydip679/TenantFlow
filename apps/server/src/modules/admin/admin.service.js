'use strict';

/**
 * Admin Service
 *
 * Platform-wide analytics and tenant management for super_admin.
 * All functions aggregate across tenants — no tenant scope filtering.
 *
 * Services NEVER accept req/res objects.
 *
 * REF: docs/SRS.md §11 — Admin Module
 * REF: docs/DATABASE_DESIGN.md §6.1 — MRR Dashboard aggregation
 * REF: docs/DATABASE_DESIGN.md §6.2 — Monthly Churn Calculation
 * REF: docs/DATABASE_DESIGN.md §6.5 — Dunning Queue Summary
 * REF: docs/IMPLEMENTATION_ROADMAP.md §12.1 T9.1
 */

const { startOfMonth, endOfMonth, subMonths, differenceInDays } = require('date-fns');
const mongoose         = require('mongoose');
const Tenant           = require('../../models/Tenant.model');
const Subscription     = require('../../models/Subscription.model');
const Invoice          = require('../../models/Invoice.model');
const DunningRecord    = require('../../models/DunningRecord.model');
const SubscriptionEvent = require('../../models/SubscriptionEvent.model');
const User             = require('../../models/User.model');
const AuditLog         = require('../../models/AuditLog.model');
const TenantChurnScore = require('../../models/TenantChurnScore.model');
const { AppError }     = require('../../shared/errors/AppError');
const { ERROR_CODES }  = require('../../shared/errors/errorCodes');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const logger           = require('../../shared/utils/logger');

// ── getPlatformMetrics() ──────────────────────────────────────
/**
 * Compute MRR, ARR, churn rate, subscription counts, and dunning stats.
 *
 * MRR: Annual plan prices normalized to monthly (price / 12).
 * Churn: Cancelled subscriptions this month / active subs at month start.
 *
 * REF: docs/DATABASE_DESIGN.md §6.1 MRR Dashboard
 * REF: docs/DATABASE_DESIGN.md §6.2 Monthly Churn Calculation
 *
 * @returns {Promise<Object>}
 */
const getPlatformMetrics = async () => {
  const now            = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd   = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd   = endOfMonth(subMonths(now, 1));

  // Run all aggregations in parallel
  const [mrrResult, lastMonthMrrResult, churnResult, lastMonthChurnResult, dunningStats, highRiskCount] = await Promise.all([

    // ── MRR (current) ────────────────────────────────────────
    Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trialing'] } } },
      {
        $lookup: {
          from:         'planversions',
          localField:   'planVersionId',
          foreignField: '_id',
          as:           'planVersion',
        },
      },
      { $unwind: '$planVersion' },
      {
        $group: {
          _id:            null,
          mrr:            {
            $sum: {
              $cond: [
                { $eq: ['$planVersion.interval', 'annual'] },
                { $divide: ['$planVersion.price', 12] },  // Normalize annual → monthly
                '$planVersion.price',
              ],
            },
          },
          activeCount:    { $sum: 1 },
          trialingCount:  { $sum: { $cond: [{ $eq: ['$status', 'trialing'] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, mrr: { $toLong: '$mrr' }, activeCount: 1, trialingCount: 1 } },
    ]),

    // ── MRR (last month for trend) ─────────────────────────
    Subscription.aggregate([
      {
        $match: {
          status:    { $in: ['active', 'trialing', 'cancelled'] },
          createdAt: { $lte: lastMonthEnd },
          $or: [
            { cancelledAt: null },
            { cancelledAt: { $gt: lastMonthEnd } },
          ],
        },
      },
      {
        $lookup: {
          from:         'planversions',
          localField:   'planVersionId',
          foreignField: '_id',
          as:           'planVersion',
        },
      },
      { $unwind: { path: '$planVersion', preserveNullAndEmpty: false } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [
                { $eq: ['$planVersion.interval', 'annual'] },
                { $divide: ['$planVersion.price', 12] },
                '$planVersion.price',
              ],
            },
          },
        },
      },
      { $project: { _id: 0, mrr: { $toLong: '$mrr' } } },
    ]),

    // ── Churn rate (this month) ───────────────────────────
    Subscription.aggregate([
      {
        $facet: {
          atMonthStart: [
            {
              $match: {
                createdAt: { $lte: thisMonthStart },
                $or: [{ cancelledAt: null }, { cancelledAt: { $gt: thisMonthStart } }],
              },
            },
            { $count: 'count' },
          ],
          churned: [
            {
              $match: {
                status:      'cancelled',
                cancelledAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
              },
            },
            { $count: 'count' },
          ],
          newThisMonth: [
            { $match: { createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd } } },
            { $count: 'count' },
          ],
          cancelledThisMonth: [
            {
              $match: {
                status:      'cancelled',
                cancelledAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
              },
            },
            { $count: 'count' },
          ],
        },
      },
      {
        $project: {
          atMonthStart:       { $ifNull: [{ $first: '$atMonthStart.count' }, 0] },
          churned:            { $ifNull: [{ $first: '$churned.count' }, 0] },
          newThisMonth:       { $ifNull: [{ $first: '$newThisMonth.count' }, 0] },
          cancelledThisMonth: { $ifNull: [{ $first: '$cancelledThisMonth.count' }, 0] },
        },
      },
    ]),

    // ── Churn rate (last month) ──────────────────────────
    Subscription.aggregate([
      {
        $facet: {
          atMonthStart: [
            {
              $match: {
                createdAt: { $lte: lastMonthStart },
                $or: [{ cancelledAt: null }, { cancelledAt: { $gt: lastMonthStart } }],
              },
            },
            { $count: 'count' },
          ],
          churned: [
            {
              $match: {
                status:      'cancelled',
                cancelledAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
              },
            },
            { $count: 'count' },
          ],
        },
      },
      {
        $project: {
          atMonthStart: { $ifNull: [{ $first: '$atMonthStart.count' }, 0] },
          churned:      { $ifNull: [{ $first: '$churned.count' }, 0] },
        },
      },
    ]),

    // ── Active dunning records count ─────────────────────
    DunningRecord.countDocuments({ status: 'active' }),

    // ── High churn risk tenant count ─────────────────────
    TenantChurnScore.countDocuments({ riskLevel: 'high' }),
  ]);

  const currentMrr  = mrrResult[0]?.mrr || 0;
  const lastMrr     = lastMonthMrrResult[0]?.mrr || 0;
  const mrrChangePct = lastMrr > 0
    ? Math.round(((currentMrr - lastMrr) / lastMrr) * 100 * 10) / 10
    : 0;

  const churnData     = churnResult[0] || {};
  const lastChurnData = lastMonthChurnResult[0] || {};

  const computeChurnRate = (data) => {
    if (!data.atMonthStart || data.atMonthStart === 0) return 0;
    return Math.round((data.churned / data.atMonthStart) * 100 * 10) / 10;
  };

  return {
    mrr: {
      current:       currentMrr,
      lastMonth:     lastMrr,
      changePercent: mrrChangePct,
    },
    arr:                       currentMrr * 12,
    churnRate: {
      thisMonth:  computeChurnRate(churnData),
      lastMonth:  computeChurnRate(lastChurnData),
    },
    activeSubscriptions:       churnData.atMonthStart || 0,
    trialingSubscriptions:     mrrResult[0]?.trialingCount || 0,
    newSubscriptionsThisMonth: churnData.newThisMonth || 0,
    cancelledThisMonth:        churnData.cancelledThisMonth || 0,
    activeDunningRecords:      dunningStats,
    highRiskTenants:           highRiskCount,
  };
};

// ── listTenants() ─────────────────────────────────────────────
/**
 * List all tenants with subscription + plan + churn score summary.
 * Supports filters: status, planVersionId, riskLevel.
 *
 * @param {Object} filters   - { status, planVersionId, riskLevel }
 * @param {Object} options   - { page, limit }
 * @returns {Promise<{ tenants, pagination }>}
 */
const listTenants = async (filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const matchStage = {};
  if (filters.status) matchStage.status = filters.status;

  const pipeline = [
    { $match: matchStage },
    // Join subscription
    {
      $lookup: {
        from:         'subscriptions',
        localField:   '_id',
        foreignField: 'tenantId',
        as:           'subscription',
      },
    },
    { $unwind: { path: '$subscription', preserveNullAndEmpty: true } },
    // Join plan version
    {
      $lookup: {
        from:         'planversions',
        localField:   'subscription.planVersionId',
        foreignField: '_id',
        as:           'planVersion',
      },
    },
    { $unwind: { path: '$planVersion', preserveNullAndEmpty: true } },
    // Join churn score
    {
      $lookup: {
        from:         'tenantchurnscores',
        localField:   '_id',
        foreignField: 'tenantId',
        as:           'churnScore',
      },
    },
    { $unwind: { path: '$churnScore', preserveNullAndEmpty: true } },
    // Filter by riskLevel if provided
    ...(filters.riskLevel ? [{ $match: { 'churnScore.riskLevel': filters.riskLevel } }] : []),
    // Filter by planVersionId if provided
    ...(filters.planVersionId
      ? [{ $match: { 'subscription.planVersionId': new mongoose.Types.ObjectId(filters.planVersionId) } }]
      : []),
    {
      $project: {
        _id: 1,
        name: 1,
        slug: 1,
        status: 1,
        createdAt: 1,
        subscriptionStatus:  { $ifNull: ['$subscription.status', null] },
        planName:            { $ifNull: ['$planVersion.name', null] },
        planInterval:        { $ifNull: ['$planVersion.interval', null] },
        mrrContributionPaise: {
          $cond: [
            { $eq: ['$planVersion.interval', 'annual'] },
            { $divide: [{ $ifNull: ['$planVersion.price', 0] }, 12] },
            { $ifNull: ['$planVersion.price', 0] },
          ],
        },
        usedSeats:           { $ifNull: ['$subscription.usedSeats', 0] },
        totalSeats:          { $ifNull: ['$subscription.totalSeats', 0] },
        churnRiskScore:      { $ifNull: ['$churnScore.churnRiskScore', null] },
        riskLevel:           { $ifNull: ['$churnScore.riskLevel', null] },
      },
    },
    { $sort: { createdAt: -1 } },
  ];

  const [tenants, countResult] = await Promise.all([
    Tenant.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    Tenant.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const total = countResult[0]?.total || 0;
  return { tenants, pagination: paginationMeta(total, page, limit) };
};

// ── getTenantDetail() ─────────────────────────────────────────
/**
 * Full tenant detail: profile, members, invoices, subscription events, churn.
 * @param {string} tenantId
 * @returns {Promise<Object>}
 */
const getTenantDetail = async (tenantId) => {
  const [tenant, members, invoices, events, churnScore, subscription] = await Promise.all([
    Tenant.findById(tenantId).lean(),
    User.find({ tenantId, deletedAt: null })
      .select('name email role status lastLoginAt createdAt')
      .sort({ createdAt: 1 })
      .lean(),
    Invoice.find({ tenantId })
      .select('invoiceNumber status total amountDue dueDate createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    SubscriptionEvent.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    TenantChurnScore.findOne({ tenantId }).lean(),
    Subscription.findOne({ tenantId })
      .populate('planVersionId', 'name interval price')
      .lean(),
  ]);

  if (!tenant) {
    throw new AppError('Tenant not found.', 404, ERROR_CODES.TENANT_NOT_FOUND);
  }

  return { tenant, subscription, members, recentInvoices: invoices, eventTimeline: events, churnScore };
};

// ── forceStatusChange() ───────────────────────────────────────
/**
 * Admin override to force a tenant's status.
 * Skips normal state machine transitions.
 * Creates an AuditLog entry.
 *
 * @param {string} tenantId
 * @param {string} newStatus
 * @param {string} reason
 * @param {string} actorId   — super_admin userId
 * @returns {Promise<Tenant>}
 */
const forceStatusChange = async (tenantId, newStatus, reason, actorId) => {
  const VALID_STATUSES = ['active', 'suspended', 'cancelled', 'trialing'];
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new AppError(`Invalid status: ${newStatus}.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { status: newStatus, updatedAt: new Date() },
    { new: true }
  );

  if (!tenant) {
    throw new AppError('Tenant not found.', 404, ERROR_CODES.TENANT_NOT_FOUND);
  }

  // Create audit log
  await AuditLog.create({
    event:        'tenant.status_changed',
    tenantId:     tenantId,
    actor:        { userId: actorId, role: 'super_admin' },
    resourceType: 'Tenant',
    resourceId:   tenantId,
    source:       'admin_override',
    metadata:     { newStatus, reason },
  });

  logger.info({ tenantId, newStatus, reason, actorId }, 'Admin force-status-change applied');
  return tenant;
};

// ── listAllInvoices() ─────────────────────────────────────────
/**
 * Cross-tenant paginated invoice list for super admin.
 * @param {Object} filters  - { status, tenantId }
 * @param {Object} options  - { page, limit }
 * @returns {Promise<{ invoices, pagination }>}
 */
const listAllInvoices = async (filters = {}, options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const filter = {};
  if (filters.status)   filter.status   = filters.status;
  if (filters.tenantId) filter.tenantId = filters.tenantId;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('tenantId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return { invoices, pagination: paginationMeta(total, page, limit) };
};

// ── getActiveDunningRecords() ─────────────────────────────────
/**
 * Active dunning records with tenant name and time-until-retry.
 * REF: docs/DATABASE_DESIGN.md §6.5 — Dunning Queue Summary
 *
 * @param {Object} options - { page, limit }
 * @returns {Promise<{ records, pagination }>}
 */
const getActiveDunningRecords = async (options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const pipeline = [
    { $match: { status: 'active' } },
    {
      $lookup: {
        from:         'tenants',
        localField:   'tenantId',
        foreignField: '_id',
        as:           'tenant',
      },
    },
    { $unwind: '$tenant' },
    {
      $lookup: {
        from:         'invoices',
        localField:   'invoiceId',
        foreignField: '_id',
        as:           'invoice',
      },
    },
    { $unwind: '$invoice' },
    {
      $project: {
        tenantId:     1,
        tenantName:   '$tenant.name',
        invoiceId:    1,
        invoiceNumber: '$invoice.invoiceNumber',
        currentStep:  1,
        nextRetryAt:  1,
        amountDue:    '$invoice.amountDue',
        createdAt:    1,
        daysPastDue: {
          $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000],
        },
      },
    },
    { $sort: { nextRetryAt: 1 } },
  ];

  const [records, countResult] = await Promise.all([
    DunningRecord.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    DunningRecord.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const total = countResult[0]?.total || 0;
  return { records, pagination: paginationMeta(total, page, limit) };
};

// ── getQueueStats() ───────────────────────────────────────────
/**
 * Get BullMQ job counts for all queues.
 * @returns {Promise<Object>} — { queueName: { waiting, active, completed, failed, delayed } }
 */
const getQueueStats = async () => {
  const queueModules = {
    'email-queue':        require('../../queues/email.queue'),
    'invoice-queue':      require('../../queues/invoice.queue'),
    'pdf-queue':          require('../../queues/pdf.queue'),
    'payment-queue':      require('../../queues/payment.queue'),
    'dunning-queue':      require('../../queues/dunning.queue'),
    'notification-queue': require('../../queues/notification.queue'),
    'ai-queue':           require('../../queues/ai.queue'),
  };

  const stats = {};
  await Promise.all(
    Object.entries(queueModules).map(async ([name, mod]) => {
      try {
        const queue = mod[Object.keys(mod).find((k) => k.endsWith('Queue') || k.endsWith('queue'))];
        if (!queue) return;
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        stats[name] = counts;
      } catch (err) {
        stats[name] = { error: err.message };
      }
    })
  );

  return stats;
};

module.exports = {
  getPlatformMetrics,
  listTenants,
  getTenantDetail,
  forceStatusChange,
  listAllInvoices,
  getActiveDunningRecords,
  getQueueStats,
};
