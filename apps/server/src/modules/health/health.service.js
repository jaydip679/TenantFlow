'use strict';

/**
 * Health Service
 *
 * Computes and retrieves Customer Health Scores for tenants.
 * Also powers the Expansion Opportunity Engine.
 *
 * Health Score is NOT a prediction — it is an operational snapshot
 * computed from real signal data. It differs from TenantChurnScore which
 * is an AI-generated risk prediction.
 *
 * Components (all 0–100):
 *   paymentHealth      (30%) — On-time invoice payment rate (last 6 months)
 *   seatUtilization    (20%) — Seat fill rate; sweet spot 60–90%
 *   planLongevity      (20%) — Subscription age in days
 *   invoicePaymentSpeed(20%) — Average days from issuance → payment
 *   dunningRisk        (10%) — Active dunning = 0, clean = 100
 *
 * Grade thresholds: A ≥80, B ≥65, C ≥50, D ≥35, F <35
 *
 * REF: docs/SYSTEM_DESIGN.md — Customer Intelligence
 */

const { subMonths, differenceInDays } = require('date-fns');

const TenantHealthScore = require('../../models/TenantHealthScore.model');
const Subscription      = require('../../models/Subscription.model');
const Invoice           = require('../../models/Invoice.model');
const DunningRecord     = require('../../models/DunningRecord.model');
const identityFacade    = require('../../shared/facades/identity.facade');

const { AppError }     = require('../../shared/errors/AppError');
const { ERROR_CODES }  = require('../../shared/errors/errorCodes');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const logger           = require('../../shared/utils/logger');

// ── Grade helpers ──────────────────────────────────────────────────────────────
function toGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Compute signal components for a single tenant and return scored components.
 *
 * @param {string} tenantId
 * @returns {Object} components + weighted score
 */
const computeSignals = async (tenantId) => {
  const now          = new Date();
  const sixMonthsAgo = subMonths(now, 6);

  // ── 1. Payment Health (30%) ─────────────────────────────────────────────────
  // % of non-void invoices in last 6 months that were paid (status = 'paid')
  const [totalInvoices, paidInvoices] = await Promise.all([
    Invoice.countDocuments({
      tenantId,
      createdAt: { $gte: sixMonthsAgo },
      status:    { $nin: ['void', 'draft'] },
    }),
    Invoice.countDocuments({
      tenantId,
      createdAt: { $gte: sixMonthsAgo },
      status:    'paid',
    }),
  ]);

  const paymentRate        = totalInvoices > 0 ? (paidInvoices / totalInvoices) : 1;
  const paymentHealthScore = Math.round(paymentRate * 100);
  const paymentHealthSig   = totalInvoices === 0
    ? 'No invoices yet'
    : `${paidInvoices}/${totalInvoices} invoices paid on time`;

  // ── 2. Seat Utilization (20%) ──────────────────────────────────────────────
  // Sweet spot: 60–90% → 100, <30% → low engagement, >95% → pressure
  const sub = await Subscription.findOne({
    tenantId,
    status: { $in: ['active', 'trialing'] },
  }).populate({
    path:   'planVersionId',
    select: 'features',
  }).lean();

  let seatUtilScore = 50; // default if no subscription data
  let seatUtilSig   = 'No active subscription';
  let maxSeats      = 0;
  let usedSeats     = 0;

  if (sub?.planVersionId?.features) {
    maxSeats  = sub.planVersionId.features.get
      ? sub.planVersionId.features.get('max_seats')
      : sub.planVersionId.features?.max_seats;
    maxSeats  = Number(maxSeats) || 0;

    usedSeats = await identityFacade.getActiveUserCount(tenantId);

    if (maxSeats > 0) {
      const utilPct = usedSeats / maxSeats;
      if (utilPct >= 0.6 && utilPct <= 0.9) {
        seatUtilScore = 100;
      } else if (utilPct > 0.9 && utilPct < 1.0) {
        seatUtilScore = 75; // Near limit — expansion signal, mild pressure
      } else if (utilPct >= 1.0) {
        seatUtilScore = 50; // At limit — cannot grow
      } else if (utilPct >= 0.3) {
        seatUtilScore = 60; // Low engagement
      } else {
        seatUtilScore = 30; // Very low — may churn
      }
      seatUtilSig = `${usedSeats}/${maxSeats} seats used (${Math.round(utilPct * 100)}%)`;
    }
  }

  // ── 3. Plan Longevity (20%) ────────────────────────────────────────────────
  // Based on subscription age in days
  let longevityScore = 20;
  let longevitySig   = 'No active subscription';

  if (sub?.createdAt) {
    const ageDays = differenceInDays(now, new Date(sub.createdAt));
    if (ageDays >= 365)      { longevityScore = 100; longevitySig = `${Math.floor(ageDays / 30)} months subscriber`; }
    else if (ageDays >= 180) { longevityScore = 80;  longevitySig = `${Math.floor(ageDays / 30)} months subscriber`; }
    else if (ageDays >= 90)  { longevityScore = 65;  longevitySig = `${Math.floor(ageDays / 30)} months subscriber`; }
    else if (ageDays >= 30)  { longevityScore = 45;  longevitySig = `${ageDays} days subscriber`; }
    else                     { longevityScore = 25;  longevitySig = `${ageDays} days subscriber (new)`; }
  }

  // ── 4. Invoice Payment Speed (20%) ─────────────────────────────────────────
  // Average days from invoice issuance to payment (lower = better)
  const paidInvoicesWithDates = await Invoice.find({
    tenantId,
    status:    'paid',
    paidAt:    { $exists: true, $ne: null },
    createdAt: { $gte: sixMonthsAgo },
  }).select('createdAt paidAt').lean();

  let paymentSpeedScore = 60; // default
  let paymentSpeedSig   = 'No paid invoices yet';

  if (paidInvoicesWithDates.length > 0) {
    const totalDays = paidInvoicesWithDates.reduce((sum, inv) => {
      return sum + Math.max(0, differenceInDays(new Date(inv.paidAt), new Date(inv.createdAt)));
    }, 0);
    const avgDays = totalDays / paidInvoicesWithDates.length;

    if (avgDays <= 1)       { paymentSpeedScore = 100; paymentSpeedSig = 'Pays same day'; }
    else if (avgDays <= 3)  { paymentSpeedScore = 85;  paymentSpeedSig = `Avg ${Math.round(avgDays)} days to pay`; }
    else if (avgDays <= 7)  { paymentSpeedScore = 70;  paymentSpeedSig = `Avg ${Math.round(avgDays)} days to pay`; }
    else if (avgDays <= 14) { paymentSpeedScore = 50;  paymentSpeedSig = `Avg ${Math.round(avgDays)} days to pay`; }
    else                    { paymentSpeedScore = 25;  paymentSpeedSig = `Avg ${Math.round(avgDays)} days to pay (slow)`; }
  }

  // ── 5. Dunning Risk (10%) ──────────────────────────────────────────────────
  const activeDunning = await DunningRecord.findOne({
    tenantId,
    status: { $in: ['pending', 'retrying'] },
  }).lean();

  const dunningScore = activeDunning ? 0 : 100;
  const dunningSig   = activeDunning
    ? `Active dunning (step ${activeDunning.currentStep || 1})`
    : 'No active dunning';

  // ── Weighted composite score ───────────────────────────────────────────────
  const WEIGHTS = {
    paymentHealth:       0.30,
    seatUtilization:     0.20,
    planLongevity:       0.20,
    invoicePaymentSpeed: 0.20,
    dunningRisk:         0.10,
  };

  const compositeScore = Math.round(
    paymentHealthScore  * WEIGHTS.paymentHealth +
    seatUtilScore       * WEIGHTS.seatUtilization +
    longevityScore      * WEIGHTS.planLongevity +
    paymentSpeedScore   * WEIGHTS.invoicePaymentSpeed +
    dunningScore        * WEIGHTS.dunningRisk
  );

  return {
    score: compositeScore,
    grade: toGrade(compositeScore),
    components: {
      paymentHealth:       { score: paymentHealthScore,  weight: WEIGHTS.paymentHealth,       signal: paymentHealthSig },
      seatUtilization:     { score: seatUtilScore,       weight: WEIGHTS.seatUtilization,     signal: seatUtilSig },
      planLongevity:       { score: longevityScore,      weight: WEIGHTS.planLongevity,        signal: longevitySig },
      invoicePaymentSpeed: { score: paymentSpeedScore,   weight: WEIGHTS.invoicePaymentSpeed,  signal: paymentSpeedSig },
      dunningRisk:         { score: dunningScore,         weight: WEIGHTS.dunningRisk,          signal: dunningSig },
    },
    meta: { usedSeats, maxSeats },
  };
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute and upsert health score for a single tenant.
 *
 * @param {string} tenantId
 * @returns {TenantHealthScore}
 */
const computeHealthScore = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new AppError('Tenant not found.', 404, ERROR_CODES.NOT_FOUND);

  const result = await computeSignals(tenantId);

  const doc = await TenantHealthScore.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        score:       result.score,
        grade:       result.grade,
        components:  result.components,
        computedAt:  new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  logger.info({ tenantId, score: result.score, grade: result.grade }, 'Health score computed');
  return doc;
};

/**
 * Compute health scores for ALL active tenants in batches.
 * Called by admin trigger or cron job.
 *
 * @returns {{ processed: number, errors: number }}
 */
const computeAllHealthScores = async () => {
  const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();
  let processed = 0;
  let errors    = 0;

  for (const t of tenants) {
    try {
      await computeHealthScore(t._id.toString());
      processed++;
    } catch (err) {
      errors++;
      logger.error({ tenantId: t._id, err: err.message }, 'Health score computation failed');
    }
  }

  return { processed, errors };
};

/**
 * Get paginated health scores for all tenants, sorted by worst first.
 *
 * @param {Object} options - { page, limit, grade }
 * @returns {{ scores, pagination }}
 */
const getHealthScores = async (options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const filter = {};
  if (options.grade) filter.grade = options.grade;

  const [scores, total] = await Promise.all([
    TenantHealthScore.find(filter)
      .sort({ score: 1 })  // Worst first
      .skip(skip)
      .limit(limit)
      .populate('tenantId', 'name slug status')
      .lean(),
    TenantHealthScore.countDocuments(filter),
  ]);

  return { scores, pagination: paginationMeta(total, page, limit) };
};

/**
 * Get health score for a single tenant. Triggers fresh computation if not found.
 *
 * @param {string} tenantId
 * @returns {TenantHealthScore}
 */
const getHealthScore = async (tenantId) => {
  let doc = await TenantHealthScore.findOne({ tenantId })
    .populate('tenantId', 'name slug status')
    .lean();

  // Auto-compute on first access
  if (!doc) {
    await computeHealthScore(tenantId);
    doc = await TenantHealthScore.findOne({ tenantId })
      .populate('tenantId', 'name slug status')
      .lean();
  }

  return doc;
};

// ── Expansion Opportunity Engine ───────────────────────────────────────────────

/**
 * Identify tenants who are strong candidates for plan upgrades.
 *
 * Scoring factors (all weighted into 0–100 opportunity score):
 *   seatPressure (40%)   — How close to seat limit (higher = better opportunity)
 *   healthScore  (30%)   — Healthy tenants are better upgrade candidates
 *   paymentScore (20%)   — Good payers are safe to approach for upsell
 *   tenureScore  (10%)   — Tenants subscribed >90 days are more likely to upgrade
 *
 * Excluded: tenants already on the highest-priced plan or with active dunning.
 *
 * @param {number} limit  Max results to return
 * @returns {Array}
 */
const getExpansionOpportunities = async (limit = 20) => {
  // Get the highest plan price to exclude tenants already on top tier
  const allPlans = await Plan.find({ isActive: true }).sort({ price: -1 }).lean();
  const highestPlanPrice = allPlans[0]?.price || Infinity;
  const planPriceMap     = new Map(allPlans.map(p => [p._id.toString(), { price: p.price, displayName: p.displayName, name: p.name }]));

  // Get all active subscriptions with plan + tenant data
  const subs = await Subscription.find({
    status: { $in: ['active', 'trialing'] },
  })
    .populate({ path: 'planVersionId', select: 'features price displayName' })
    .populate({ path: 'planId',        select: 'price displayName name' })
    .populate({ path: 'tenantId',      select: 'name slug status' })
    .lean();

  // Get all active dunning tenant IDs — exclude these
  const dunningTenantIds = await DunningRecord.distinct('tenantId', {
    status: { $in: ['pending', 'retrying'] },
  });
  const dunningSet = new Set(dunningTenantIds.map(id => id.toString()));

  // Get health scores for all tenants in one query
  const healthScoreDocs = await TenantHealthScore.find({}).select('tenantId score grade').lean();
  const healthMap       = new Map(healthScoreDocs.map(d => [d.tenantId.toString(), d.score]));

  const opportunities = [];

  for (const sub of subs) {
    const tenantId  = sub.tenantId?._id?.toString() || sub.tenantId?.toString();
    const planPrice = sub.planId?.price || 0;

    // Exclude: highest plan, dunning, missing data
    if (!tenantId || dunningSet.has(tenantId)) continue;
    if (planPrice >= highestPlanPrice) continue;

    const maxSeats = sub.planVersionId?.features?.get
      ? Number(sub.planVersionId.features.get('max_seats') || 0)
      : Number(sub.planVersionId?.features?.max_seats || 0);

    const usedSeats = await User.countDocuments({
      tenantId,
      status: { $in: ['active', 'invited'] },
    });

    const utilPct = maxSeats > 0 ? usedSeats / maxSeats : 0;

    // Only surface if seat utilization >= 60% (otherwise not a strong signal)
    if (utilPct < 0.6 && healthMap.get(tenantId) === undefined) continue;

    // ── Opportunity Scoring ─────────────────────────────────────────────────
    // Seat pressure (40%)
    let seatPressure = 0;
    if (utilPct >= 1.0)       seatPressure = 100;
    else if (utilPct >= 0.9)  seatPressure = 90;
    else if (utilPct >= 0.8)  seatPressure = 75;
    else if (utilPct >= 0.7)  seatPressure = 55;
    else if (utilPct >= 0.6)  seatPressure = 35;
    else                      seatPressure = 10;

    // Health score (30%) — healthier = better candidate
    const healthScore   = healthMap.get(tenantId) || 50;

    // Payment score (20%) — derive from health score components or use health proxy
    const paymentScore  = Math.min(100, healthScore + 10);  // approximate

    // Tenure score (10%)
    const ageDays     = differenceInDays(new Date(), new Date(sub.createdAt));
    const tenureScore = ageDays >= 365 ? 100 : ageDays >= 180 ? 80 : ageDays >= 90 ? 60 : ageDays >= 30 ? 40 : 20;

    const opportunityScore = Math.round(
      seatPressure * 0.40 +
      healthScore  * 0.30 +
      paymentScore * 0.20 +
      tenureScore  * 0.10
    );

    // Find recommended next plan (next price tier up)
    const currentPrice = planPrice;
    const upgradePlan  = allPlans.find(p => p.price > currentPrice);

    opportunities.push({
      tenantId,
      tenantName:       sub.tenantId?.name || 'Unknown',
      tenantSlug:       sub.tenantId?.slug || '',
      currentPlan:      sub.planId?.displayName || 'Unknown',
      currentPlanPrice: currentPrice,
      usedSeats,
      maxSeats,
      seatUtilPct:      Math.round(utilPct * 100),
      healthScore,
      opportunityScore,
      signals: [
        utilPct >= 0.9 && '🔥 Near seat limit',
        utilPct >= 0.7 && '📈 High seat utilization',
        healthScore >= 70 && '✅ Healthy account',
        ageDays >= 180 && '⏱️ Long-term customer',
      ].filter(Boolean),
      recommendedUpgrade: upgradePlan
        ? { planName: upgradePlan.displayName, price: upgradePlan.price }
        : null,
      subscriptionAge: ageDays,
    });
  }

  // Sort by opportunity score descending
  return opportunities
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);
};

module.exports = {
  computeHealthScore,
  computeAllHealthScores,
  getHealthScores,
  getHealthScore,
  getExpansionOpportunities,
};
