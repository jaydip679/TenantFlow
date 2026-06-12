'use strict';

/**
 * Proration Utility
 *
 * Calculates proration amounts for mid-cycle plan changes.
 *
 * CRITICAL: Integer paise arithmetic only. NO floating-point operations.
 * All division uses Math.round() to stay in integer space.
 *
 * REF: docs/DATABASE_DESIGN.md §7 — Proration Calculation Logic
 * REF: docs/DATABASE_DESIGN.md §7.1 — Core Formula (exact implementation below)
 * REF: docs/DATABASE_DESIGN.md §7.3 — Seat Proration
 */

const { differenceInDays, startOfDay } = require('date-fns');

/**
 * Calculate proration amounts for a mid-cycle plan upgrade.
 *
 * Formula (per DATABASE_DESIGN.md §7.1):
 *   daysInPeriod  = differenceInDays(periodEnd, periodStart)
 *   daysRemaining = differenceInDays(periodEnd, changeDate)  ← exclusive of today
 *   oldDailyRate  = Math.round(oldPlanPrice / daysInPeriod)
 *   newDailyRate  = Math.round(newPlanPrice / daysInPeriod)
 *   creditAmount  = oldDailyRate × daysRemaining   ← refund for unused old plan
 *   chargeAmount  = newDailyRate × daysRemaining   ← charge for remaining on new plan
 *   netAmount     = chargeAmount - creditAmount      ← positive = customer owes; negative = credit
 *
 * @param {Object} params
 * @param {number} params.oldPlanPrice  - Current plan price in paise (integer)
 * @param {number} params.newPlanPrice  - Target plan price in paise (integer)
 * @param {Date}   params.changeDate    - Date of plan change (today)
 * @param {Date}   params.periodStart   - Start of current billing period
 * @param {Date}   params.periodEnd     - End of current billing period
 * @returns {{
 *   creditAmount:  number,   // paise (refund for old plan unused days)
 *   chargeAmount:  number,   // paise (cost for new plan remaining days)
 *   netAmount:     number,   // paise (positive = charge, negative = credit)
 *   daysRemaining: number,
 *   daysInPeriod:  number,
 *   daysUsed:      number,
 *   oldDailyRate:  number,
 *   newDailyRate:  number,
 * }}
 */
const calculateProration = ({
  oldPlanPrice,
  newPlanPrice,
  changeDate,
  periodStart,
  periodEnd,
}) => {
  // Strip time component for day-count accuracy — use UTC day boundaries
  const periodStartDay = startOfDay(new Date(periodStart));
  const periodEndDay   = startOfDay(new Date(periodEnd));
  const changeDateDay  = startOfDay(new Date(changeDate));

  const daysInPeriod  = differenceInDays(periodEndDay, periodStartDay);
  const daysRemaining = differenceInDays(periodEndDay, changeDateDay); // exclusive of today
  const daysUsed      = daysInPeriod - daysRemaining;

  // Guard against degenerate periods (shouldn't happen in production, defensive only)
  if (daysInPeriod <= 0) {
    throw new Error(`Invalid billing period: periodStart=${periodStart}, periodEnd=${periodEnd}`);
  }

  // Integer daily rates — Math.round to stay in paise
  const oldDailyRate = Math.round(oldPlanPrice / daysInPeriod);
  const newDailyRate = Math.round(newPlanPrice / daysInPeriod);

  // Credit: refund for unused days on old plan
  const creditAmount = oldDailyRate * daysRemaining;

  // Charge: cost for remaining days on new plan
  const chargeAmount = newDailyRate * daysRemaining;

  // Net: positive = customer owes money; negative = customer gets credit
  const netAmount = chargeAmount - creditAmount;

  return {
    creditAmount,
    chargeAmount,
    netAmount,
    daysRemaining,
    daysInPeriod,
    daysUsed,
    oldDailyRate,
    newDailyRate,
  };
};

/**
 * Calculate proration for adding seats mid-cycle.
 *
 * Uses a fixed 30-day month for seat proration (simpler UX; standard SaaS practice).
 *
 * REF: docs/DATABASE_DESIGN.md §7.3 — Seat Proration
 *
 * @param {Object} params
 * @param {number} params.seatPrice    - Price per seat in paise (integer)
 * @param {number} params.seatsAdded   - Number of new seats being added
 * @param {Date}   params.changeDate
 * @param {Date}   params.periodEnd
 * @returns {number} chargeAmount in paise (integer)
 */
const seatProration = ({ seatPrice, seatsAdded, changeDate, periodEnd }) => {
  const daysRemaining = differenceInDays(
    startOfDay(new Date(periodEnd)),
    startOfDay(new Date(changeDate))
  );
  // Use 30-day month for seat proration — simpler UX, standard SaaS
  const dailySeatRate = Math.round(seatPrice / 30);
  const chargeAmount  = dailySeatRate * daysRemaining * seatsAdded;
  return chargeAmount;
};

module.exports = { calculateProration, seatProration };
