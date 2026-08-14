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
const identityFacade   = require('../../shared/facades/identity.facade');
const ReadSubscription = require('../../models/ReadSubscription.model');
const ReadInvoice      = require('../../models/ReadInvoice.model');
const ReadDunningRecord = require('../../models/ReadDunningRecord.model');
const ReadTenant       = require('../../models/ReadTenant.model');
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
    ReadSubscription.aggregate([
      { $match: { status: { $in: ['active', 'trialing'] } } },
      {
        $group: {
          _id:            null,
          mrr:            {
            $sum: {
              $cond: [
                { $eq: ['$planInterval', 'annual'] },
                { $divide: ['$planPrice', 12] },  // Normalize annual → monthly
                '$planPrice',
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
    ReadSubscription.aggregate([
      {
        $match: {
          status:    { $in: ['active', 'trialing', 'cancelled'] },
          subscriptionCreatedAt: { $lte: lastMonthEnd },
          $or: [
            { cancelledAt: null },
            { cancelledAt: { $gt: lastMonthEnd } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [
                { $eq: ['$planInterval', 'annual'] },
                { $divide: ['$planPrice', 12] },
                '$planPrice',
              ],
            },
          },
        },
      },
      { $project: { _id: 0, mrr: { $toLong: '$mrr' } } },
    ]),

    // ── Churn rate (this month) ───────────────────────────
    ReadSubscription.aggregate([
      {
        $facet: {
          atMonthStart: [
            {
              $match: {
                subscriptionCreatedAt: { $lte: thisMonthStart },
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

    // ── Churn rate (last month) ───────────────────────────
    ReadSubscription.aggregate([
      {
        $facet: {
          atMonthStart: [
            {
              $match: {
                subscriptionCreatedAt: { $lte: lastMonthStart },
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
    ReadDunningRecord.countDocuments({ status: 'active' }),

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

    // Format output to match legacy exactly (legacy returned _id)
    const formattedTenants = tenants.map(t => {
      const formatted = { ...t, _id: new mongoose.Types.ObjectId(t.id) };
      delete formatted.id;
      return formatted;
    });

    const total = countResult[0]?.total || 0;
    return { tenants: formattedTenants, pagination: paginationMeta(total, page, limit) };
};

// ── getTenantDetail() ─────────────────────────────────────────
/**
 * Full tenant detail: profile, members, invoices, subscription events, churn.
 * @param {string} tenantId
 * @returns {Promise<Object>}
 */
const getTenantDetail = async (tenantId) => {
  const [readTenant, members, readInvoices, churnScore, readSub, timelineRaw] = await Promise.all([
    ReadTenant.findOne({ tenantId }).lean(),
    identityFacade.getTenantUsers(tenantId),
    ReadInvoice.find({ tenantId })
      .sort({ invoiceCreatedAt: -1 })
      .limit(5)
      .lean(),
    TenantChurnScore.findOne({ tenantId }).lean(),
    ReadSubscription.findOne({ tenantId }).lean(),
    ReadSubscriptionEvent.find({ tenantId }).sort({ createdAt: -1 }).lean(),
  ]);

  if (!readTenant) {
    throw new AppError('Tenant not found.', 404, ERROR_CODES.TENANT_NOT_FOUND);
  }

  const tenant = { ...readTenant, _id: new mongoose.Types.ObjectId(readTenant.tenantId), billingEmail: readTenant.ownerEmail };
  const invoices = readInvoices.map(inv => ({ ...inv, _id: new mongoose.Types.ObjectId(inv.invoiceId), createdAt: inv.invoiceCreatedAt }));
  let subscription = null;
  if (readSub) {
    subscription = {
      ...readSub,
      _id: new mongoose.Types.ObjectId(readSub.subscriptionId),
      planVersionId: {
        name: readSub.planName,
        interval: readSub.planInterval,
        price: readSub.planPrice
      }
    };
  }

  const eventTimeline = timelineRaw.map(ev => ({
    ...ev,
    _id: new mongoose.Types.ObjectId(ev.sourceEventId)
  }));

  return { tenant, subscription, members, recentInvoices: invoices, eventTimeline, churnScore };
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

  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
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
    }
  ];

  const [invoices, totalCount] = await Promise.all([
    ReadInvoice.aggregate(pipeline),
    ReadInvoice.countDocuments(filter),
  ]);

  const formattedInvoices = invoices.map(inv => ({
    ...inv,
    _id: new mongoose.Types.ObjectId(inv.invoiceId)
  }));

  return { invoices: formattedInvoices, pagination: paginationMeta(totalCount, page, limit) };
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
        from:         'analytics_read_tenants',
        localField:   'tenantId',
        foreignField: 'tenantId',
        as:           'tenant',
      },
    },
    { $unwind: '$tenant' },
    {
      $lookup: {
        from:         'analytics_read_invoices',
        localField:   'invoiceId',
        foreignField: 'invoiceId',
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
    ReadDunningRecord.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    ReadDunningRecord.aggregate([...pipeline, { $count: 'total' }]),
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
    const beginSubs = await ReadSubscription.aggregate([
      {
        $match: {
          subscriptionCreatedAt: { $lte: monthStart },
          $or: [
            { cancelledAt: null },
            { cancelledAt: { $gt: monthStart } },
          ],
          status: { $in: ['active', 'trialing'] },
        },
      },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [{ $eq: ['$planInterval', 'annual'] }, { $divide: ['$planPrice', 12] }, { $ifNull: ['$planPrice', 0] }],
            },
          },
        },
      },
    ]);
    const beginMrr = Math.round(beginSubs[0]?.mrr || 0);

    // ── New MRR (new subscriptions started this month) ──────────────
    const newSubs = await ReadSubscription.aggregate([
      { $match: { subscriptionCreatedAt: { $gte: monthStart, $lte: monthEnd } } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [{ $eq: ['$planInterval', 'annual'] }, { $divide: ['$planPrice', 12] }, { $ifNull: ['$planPrice', 0] }],
            },
          },
        },
      },
    ]);
    const newMrr = Math.round(newSubs[0]?.mrr || 0);

    // ── Expansion / Contraction / Churned / Reactivation ─
    let expansionMrr    = 0;
    let contractionMrr  = 0;
    let churnedMrr      = 0;
    let reactivationMrr = 0;

    const events = await ReadSubscriptionEvent.find({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    }).lean();

    for (const ev of events) {
      const meta = ev.metadata || {};
      if (ev.event === 'subscription.upgraded') {
        const fromPrice = meta.fromPlanPrice || 0;
        const fromInterval = meta.fromPlanInterval || 'monthly';
        const toPrice = meta.toPlanPrice || 0;
        const toInterval = meta.toPlanInterval || 'monthly';
        expansionMrr += (monthlyPrice(toPrice, toInterval) - monthlyPrice(fromPrice, fromInterval));
      } else if (ev.event === 'subscription.downgrade_applied') {
        const fromPrice = meta.fromPlanPrice || 0;
        const fromInterval = meta.fromPlanInterval || 'monthly';
        const toPrice = meta.toPlanPrice || 0;
        const toInterval = meta.toPlanInterval || 'monthly';
        contractionMrr += (monthlyPrice(fromPrice, fromInterval) - monthlyPrice(toPrice, toInterval));
      } else if (ev.event === 'subscription.cancelled') {
        const fromPrice = meta.fromPlanPrice || 0;
        const fromInterval = meta.fromPlanInterval || 'monthly';
        churnedMrr += monthlyPrice(fromPrice, fromInterval);
      } else if (ev.event === 'subscription.reactivated') {
        const toPrice = meta.toPlanPrice || 0;
        const toInterval = meta.toPlanInterval || 'monthly';
        reactivationMrr += monthlyPrice(toPrice, toInterval);
      }
    }

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
  const dunningTenantIds = await ReadDunningRecord.distinct('tenantId', { status: 'active' });
  const dunningSet       = new Set(dunningTenantIds.map(id => id.toString()));

  for (let i = 0; i < months; i++) {
    const ref        = i === 0 ? now : subMonths(now, -i);
    const monthStart = startOfMonth(ref);
    const monthEnd   = endOfMonth(ref);
    const label      = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;

    const subs = await ReadSubscription.aggregate([
      {
        $match: {
          status:             { $in: ['active', 'trialing'] },
          currentPeriodEnd:   { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $lookup: {
          from: 'analytics_read_tenants', localField: 'tenantId',
          foreignField: 'tenantId', as: 'tenant',
        },
      },
      { $unwind: { path: '$tenant', preserveNullAndEmpty: true } },
      {
        $project: {
          tenantId:        1,
          tenantName:      '$tenant.name',
          planName:        '$planName',
          price:           '$planPrice',
          interval:        '$planInterval',
          currentPeriodEnd:1,
          monthlyPrice: {
            $cond: [{ $eq: ['$planInterval', 'annual'] }, { $divide: ['$planPrice', 12] }, '$planPrice'],
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
    const cohortTenants = await ReadSubscription.distinct('tenantId', {
      subscriptionCreatedAt: { $gte: cohortStart, $lte: cohortEnd },
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
      const active = await ReadSubscription.countDocuments({
        tenantId:  { $in: cohortTenants },
        status:    { $in: ['active', 'trialing'] },
        subscriptionCreatedAt: { $lte: checkEnd },
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
  listAllInvoices,
  getActiveDunningRecords,
  getQueueStats,
  getMrrMovements,
  getCashFlowForecast,
  getCohortRetention,
};
