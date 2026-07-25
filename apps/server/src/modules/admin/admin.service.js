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
    { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
    // Join plan version
    {
      $lookup: {
        from:         'planversions',
        localField:   'subscription.planVersionId',
        foreignField: '_id',
        as:           'planVersion',
      },
    },
    { $unwind: { path: '$planVersion', preserveNullAndEmptyArrays: true } },
    // Join churn score
    {
      $lookup: {
        from:         'tenantchurnscores',
        localField:   '_id',
        foreignField: 'tenantId',
        as:           'churnScore',
      },
    },
    { $unwind: { path: '$churnScore', preserveNullAndEmptyArrays: true } },
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


// ── getMrrMovements() ──────────────────────────────────────────────────────
/**
 * Compute monthly MRR movement waterfall for the last N months.
 * Returns: New MRR, Expansion MRR, Contraction MRR, Churned MRR, Reactivation MRR,
 *          Net New MRR, NRR (Net Revenue Retention), Quick Ratio per month.
 *
 * Algorithm:
 *  - For each month M, compute beginning MRR (active subs at start of M).
 *  - New MRR: tenants whose subscription started in month M.
 *  - Expansion MRR: upgrade events in month M (toPlanVersion.price - fromPlanVersion.price).
 *  - Contraction MRR: downgrade events in month M.
 *  - Churned MRR: cancellations in month M (based on last-known plan price).
 *  - Reactivation MRR: reactivation events in month M.
 *  - Ending MRR = beginning + Net New.
 *  - NRR = (Beginning MRR + Expansion - Contraction - Churned) / Beginning MRR × 100.
 *  - Quick Ratio = (New + Expansion + Reactivation) / (Contraction + Churned).
 *
 * @param {number} months  Number of months to look back (default 6)
 * @returns {Array<{month, newMrr, expansionMrr, contractionMrr, churnedMrr, reactivationMrr, netNewMrr, endingMrr, nrr, quickRatio}>}
 */
const getMrrMovements = async (months = 6) => {
  const now    = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const ref        = subMonths(now, i);
    const monthStart = startOfMonth(ref);
    const monthEnd   = endOfMonth(ref);
    const label      = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;

    // Helper: normalize plan price to monthly
    const monthlyPrice = (price, interval) => (interval === 'annual' ? Math.round(price / 12) : price);

    // ── Beginning MRR (active at start of month) ──────────────────
    const beginSubs = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $lte: monthStart },
          $or: [
            { cancelledAt: null },
            { cancelledAt: { $gt: monthStart } },
          ],
          status: { $in: ['active', 'trialing'] },
        },
      },
      {
        $lookup: {
          from: 'planversions', localField: 'planVersionId',
          foreignField: '_id', as: 'pv',
        },
      },
      { $unwind: { path: '$pv', preserveNullAndEmpty: true } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [{ $eq: ['$pv.interval', 'annual'] }, { $divide: ['$pv.price', 12] }, { $ifNull: ['$pv.price', 0] }],
            },
          },
        },
      },
    ]);
    const beginMrr = Math.round(beginSubs[0]?.mrr || 0);

    // ── New MRR (new subscriptions started this month) ──────────────
    const newSubs = await Subscription.aggregate([
      { $match: { createdAt: { $gte: monthStart, $lte: monthEnd } } },
      {
        $lookup: {
          from: 'planversions', localField: 'planVersionId',
          foreignField: '_id', as: 'pv',
        },
      },
      { $unwind: { path: '$pv', preserveNullAndEmpty: true } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [{ $eq: ['$pv.interval', 'annual'] }, { $divide: ['$pv.price', 12] }, { $ifNull: ['$pv.price', 0] }],
            },
          },
        },
      },
    ]);
    const newMrr = Math.round(newSubs[0]?.mrr || 0);

    // ── Expansion / Contraction / Churned / Reactivation from SubscriptionEvent ─
    const events = await SubscriptionEvent.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart, $lte: monthEnd },
          event:     { $in: ['subscription.upgraded', 'subscription.downgraded', 'subscription.cancelled', 'subscription.reactivated'] },
        },
      },
      // Lookup the TO plan version
      {
        $lookup: {
          from: 'planversions', localField: 'toPlanVersionId',
          foreignField: '_id', as: 'toPv',
        },
      },
      {
        $lookup: {
          from: 'planversions', localField: 'fromPlanVersionId',
          foreignField: '_id', as: 'fromPv',
        },
      },
      {
        $addFields: {
          toPv:   { $arrayElemAt: ['$toPv', 0] },
          fromPv: { $arrayElemAt: ['$fromPv', 0] },
        },
      },
      {
        $group: {
          _id: '$event',
          delta: {
            $sum: {
              $subtract: [
                {
                  $cond: [
                    { $eq: ['$toPv.interval', 'annual'] },
                    { $divide: [{ $ifNull: ['$toPv.price', 0] }, 12] },
                    { $ifNull: ['$toPv.price', 0] },
                  ],
                },
                {
                  $cond: [
                    { $eq: ['$fromPv.interval', 'annual'] },
                    { $divide: [{ $ifNull: ['$fromPv.price', 0] }, 12] },
                    { $ifNull: ['$fromPv.price', 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);

    const evMap = {};
    events.forEach(e => { evMap[e._id] = Math.round(e.delta); });

    const expansionMrr    = Math.max(0,  evMap['subscription.upgraded']    || 0);
    const contractionMrr  = Math.abs(Math.min(0, evMap['subscription.downgraded']  || 0));
    const churnedMrr      = Math.abs(evMap['subscription.cancelled']   || 0);
    const reactivationMrr = Math.max(0,  evMap['subscription.reactivated'] || 0);

    const netNewMrr  = newMrr + expansionMrr + reactivationMrr - contractionMrr - churnedMrr;
    const endingMrr  = beginMrr + netNewMrr;
    const nrr        = beginMrr > 0
      ? Math.round(((beginMrr + expansionMrr + reactivationMrr - contractionMrr - churnedMrr) / beginMrr) * 100)
      : 100;
    const divisor    = contractionMrr + churnedMrr;
    const quickRatio = divisor > 0
      ? parseFloat(((newMrr + expansionMrr + reactivationMrr) / divisor).toFixed(2))
      : null;

    result.push({
      month: label, beginMrr, newMrr, expansionMrr, contractionMrr,
      churnedMrr, reactivationMrr, netNewMrr, endingMrr, nrr, quickRatio,
    });
  }

  return result;
};

// ── getCashFlowForecast() ──────────────────────────────────────────────────
/**
 * Returns expected renewal revenue for each of the next 3 months,
 * with individual renewal details and at-risk flags from active dunning records.
 *
 * @param {number} months  Months ahead to forecast (default 3)
 * @returns {Array<{month, expectedMrr, renewalCount, atRiskMrr, renewals: []}>}
 */
const getCashFlowForecast = async (months = 3) => {
  const now    = new Date();
  const result = [];

  // Fetch all active dunning tenant IDs for at-risk flagging
  const dunningTenantIds = await DunningRecord.distinct('tenantId', { status: { $in: ['pending', 'retrying'] } });
  const dunningSet       = new Set(dunningTenantIds.map(id => id.toString()));

  for (let i = 0; i < months; i++) {
    const ref        = i === 0 ? now : subMonths(now, -i);
    const monthStart = startOfMonth(ref);
    const monthEnd   = endOfMonth(ref);
    const label      = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;

    const subs = await Subscription.aggregate([
      {
        $match: {
          status:             { $in: ['active', 'trialing'] },
          currentPeriodEnd:   { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $lookup: {
          from: 'planversions', localField: 'planVersionId',
          foreignField: '_id', as: 'pv',
        },
      },
      { $unwind: { path: '$pv', preserveNullAndEmpty: true } },
      {
        $lookup: {
          from: 'tenants', localField: 'tenantId',
          foreignField: '_id', as: 'tenant',
        },
      },
      { $unwind: { path: '$tenant', preserveNullAndEmpty: true } },
      {
        $project: {
          tenantId:        1,
          tenantName:      '$tenant.name',
          planName:        '$pv.displayName',
          price:           '$pv.price',
          interval:        '$pv.interval',
          currentPeriodEnd:1,
          monthlyPrice: {
            $cond: [{ $eq: ['$pv.interval', 'annual'] }, { $divide: ['$pv.price', 12] }, '$pv.price'],
          },
        },
      },
    ]);

    let expectedMrr  = 0;
    let atRiskMrr    = 0;
    const renewals   = [];

    subs.forEach(s => {
      const mp     = Math.round(s.monthlyPrice || 0);
      const atRisk = dunningSet.has(s.tenantId.toString());
      expectedMrr += mp;
      if (atRisk) atRiskMrr += mp;
      renewals.push({
        tenantId:        s.tenantId,
        tenantName:      s.tenantName || 'Unknown',
        planName:        s.planName || 'Unknown',
        amount:          mp,
        renewalDate:     s.currentPeriodEnd,
        atRisk,
      });
    });

    result.push({
      month:        label,
      expectedMrr:  Math.round(expectedMrr),
      renewalCount: subs.length,
      atRiskMrr:    Math.round(atRiskMrr),
      renewals:     renewals.sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate)),
    });
  }

  return result;
};

// ── getCohortRetention() ──────────────────────────────────────────────────
/**
 * Compute monthly cohort retention matrix.
 * Each row = tenants who signed up in a given month (cohort).
 * Each cell = % of that cohort still active at M+1, M+2, ... M+N months.
 *
 * @param {number} cohortMonths  Number of monthly cohorts to compute (default 6)
 * @returns {Array<{cohort, cohortSize, retention: number[]}>}
 */
const getCohortRetention = async (cohortMonths = 6) => {
  const now    = new Date();
  const result = [];

  for (let i = cohortMonths - 1; i >= 0; i--) {
    const cohortRef   = subMonths(now, i);
    const cohortStart = startOfMonth(cohortRef);
    const cohortEnd   = endOfMonth(cohortRef);
    const label       = `${cohortRef.getFullYear()}-${String(cohortRef.getMonth() + 1).padStart(2, '0')}`;

    // Tenants who first subscribed in this cohort month
    const cohortTenants = await Subscription.distinct('tenantId', {
      createdAt: { $gte: cohortStart, $lte: cohortEnd },
    });

    if (cohortTenants.length === 0) {
      result.push({ cohort: label, cohortSize: 0, retention: [] });
      continue;
    }

    const cohortSize = cohortTenants.length;
    const retention  = [];

    // M+0 = 100% (the cohort month itself)
    const monthsToCheck = i; // can only check months that have passed
    for (let m = 0; m <= monthsToCheck; m++) {
      const checkRef   = subMonths(now, i - m);
      const checkStart = startOfMonth(checkRef);
      const checkEnd   = endOfMonth(checkRef);

      // Active in this check month = was active at any point during that month
      const active = await Subscription.countDocuments({
        tenantId:  { $in: cohortTenants },
        status:    { $in: ['active', 'trialing'] },
        createdAt: { $lte: checkEnd },
        $or: [
          { cancelledAt: null },
          { cancelledAt: { $gt: checkStart } },
        ],
      });

      retention.push(Math.round((active / cohortSize) * 100));
    }

    result.push({ cohort: label, cohortSize, retention });
  }

  return result;
};

module.exports = {
  getPlatformMetrics,
  listTenants,
  getTenantDetail,
  forceStatusChange,
  listAllInvoices,
  getActiveDunningRecords,
  getQueueStats,
  getMrrMovements,
  getCashFlowForecast,
  getCohortRetention,
};
