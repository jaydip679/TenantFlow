'use strict';

/**
 * Proration Utility Tests
 *
 * Tests the exact scenarios specified in IMPLEMENTATION_ROADMAP.md §6.1 T3.2:
 *   - Upgrade on day 1 of period
 *   - Upgrade on last day of period
 *   - Upgrade on day 15 of a 31-day month
 *   - Annual plan proration
 *   - Case where netAmount = 0 exactly
 *
 * REF: docs/DATABASE_DESIGN.md §7.1 — Core Formula
 * REF: docs/IMPLEMENTATION_ROADMAP.md §6.2 — Acceptance Criteria
 */

const { calculateProration, seatProration } = require('./proration');

// ── calculateProration() ──────────────────────────────────────
describe('calculateProration()', () => {

  // Scenario 1: Upgrade on day 1 of a 30-day period
  // daysInPeriod=30, daysRemaining=30 (period just started)
  it('upgrade on day 1 of period: customer pays almost full new plan price', () => {
    const periodStart = new Date('2024-01-01');
    const periodEnd   = new Date('2024-01-31'); // 30 days
    const changeDate  = new Date('2024-01-01'); // day 1

    const result = calculateProration({
      oldPlanPrice: 99900,   // ₹999 (Starter)
      newPlanPrice: 299900,  // ₹2999 (Growth)
      changeDate,
      periodStart,
      periodEnd,
    });

    expect(result.daysInPeriod).toBe(30);
    expect(result.daysRemaining).toBe(30); // 30 - 0 used
    expect(result.daysUsed).toBe(0);

    // oldDailyRate = Math.round(99900 / 30) = 3330
    // newDailyRate = Math.round(299900 / 30) = 9997
    // creditAmount = 3330 * 30 = 99900
    // chargeAmount = 9997 * 30 = 299910
    // netAmount    = 299910 - 99900 = 200010
    expect(result.oldDailyRate).toBe(Math.round(99900 / 30));
    expect(result.newDailyRate).toBe(Math.round(299900 / 30));
    expect(result.creditAmount).toBe(result.oldDailyRate * 30);
    expect(result.chargeAmount).toBe(result.newDailyRate * 30);
    expect(result.netAmount).toBe(result.chargeAmount - result.creditAmount);
    expect(result.netAmount).toBeGreaterThan(0); // Customer owes money
  });

  // Scenario 2: Upgrade on last day of period
  it('upgrade on last day of period: minimal proration (daysRemaining=1)', () => {
    const periodStart = new Date('2024-01-01');
    const periodEnd   = new Date('2024-01-31'); // 30 days
    const changeDate  = new Date('2024-01-30'); // second to last day (1 day remaining)

    const result = calculateProration({
      oldPlanPrice: 99900,
      newPlanPrice: 299900,
      changeDate,
      periodStart,
      periodEnd,
    });

    expect(result.daysRemaining).toBe(1);
    expect(result.daysUsed).toBe(29);

    // Very small proration amounts
    const oldDailyRate = Math.round(99900 / 30);
    const newDailyRate = Math.round(299900 / 30);
    expect(result.creditAmount).toBe(oldDailyRate * 1);
    expect(result.chargeAmount).toBe(newDailyRate * 1);
    expect(result.netAmount).toBeGreaterThan(0);
    expect(result.netAmount).toBeLessThan(10000); // < ₹100 — tiny amount
  });

  // Scenario 3 (PRIMARY): Upgrade on day 15 of a 31-day month — the key acceptance criterion
  it('upgrade on day 15 of a 31-day month: correct integer paise result', () => {
    const periodStart = new Date('2024-01-01');
    const periodEnd   = new Date('2024-02-01'); // 31 days
    const changeDate  = new Date('2024-01-15'); // day 15 → 17 days remaining

    const result = calculateProration({
      oldPlanPrice: 99900,   // ₹999 Starter
      newPlanPrice: 299900,  // ₹2999 Growth
      changeDate,
      periodStart,
      periodEnd,
    });

    expect(result.daysInPeriod).toBe(31);
    expect(result.daysRemaining).toBe(17); // Jan 15 → Feb 1 = 17 days
    expect(result.daysUsed).toBe(14);

    // Verify exact integer arithmetic
    const expectedOldRate   = Math.round(99900 / 31);   // 3226
    const expectedNewRate   = Math.round(299900 / 31);  // 9674
    const expectedCredit    = expectedOldRate * 17;     // 54842
    const expectedCharge    = expectedNewRate * 17;     // 164458
    const expectedNet       = expectedCharge - expectedCredit; // 109616

    expect(result.oldDailyRate).toBe(expectedOldRate);
    expect(result.newDailyRate).toBe(expectedNewRate);
    expect(result.creditAmount).toBe(expectedCredit);
    expect(result.chargeAmount).toBe(expectedCharge);
    expect(result.netAmount).toBe(expectedNet);

    // All values must be integers (no floats)
    expect(Number.isInteger(result.creditAmount)).toBe(true);
    expect(Number.isInteger(result.chargeAmount)).toBe(true);
    expect(Number.isInteger(result.netAmount)).toBe(true);
  });

  // Scenario 4: Annual plan proration
  it('annual plan proration: correct result for 365-day period', () => {
    const periodStart = new Date('2024-01-01');
    const periodEnd   = new Date('2025-01-01'); // 366 days (2024 is leap year)
    const changeDate  = new Date('2024-07-01'); // ~halfway

    const result = calculateProration({
      oldPlanPrice: 999900,  // ₹9999 (Annual Starter)
      newPlanPrice: 2999900, // ₹29999 (Annual Enterprise)
      changeDate,
      periodStart,
      periodEnd,
    });

    expect(result.daysInPeriod).toBe(366); // 2024 is a leap year
    expect(result.daysRemaining).toBeGreaterThan(0);

    // All values must be integers
    expect(Number.isInteger(result.oldDailyRate)).toBe(true);
    expect(Number.isInteger(result.newDailyRate)).toBe(true);
    expect(Number.isInteger(result.creditAmount)).toBe(true);
    expect(Number.isInteger(result.chargeAmount)).toBe(true);
    expect(Number.isInteger(result.netAmount)).toBe(true);

    expect(result.netAmount).toBeGreaterThan(0);
  });

  // Scenario 5: netAmount = 0 exactly
  it('handles netAmount = 0 when plans have the same price', () => {
    const periodStart = new Date('2024-01-01');
    const periodEnd   = new Date('2024-01-31'); // 30 days
    const changeDate  = new Date('2024-01-15');

    const result = calculateProration({
      oldPlanPrice: 99900,
      newPlanPrice: 99900,  // Same price
      changeDate,
      periodStart,
      periodEnd,
    });

    // oldDailyRate === newDailyRate → credit === charge → net = 0
    expect(result.netAmount).toBe(0);
    expect(result.creditAmount).toBe(result.chargeAmount);
    expect(Number.isInteger(result.netAmount)).toBe(true);
  });

  // Edge case: degenerate period throws
  it('throws an error for degenerate period (start === end)', () => {
    const date = new Date('2024-01-01');
    expect(() =>
      calculateProration({ oldPlanPrice: 99900, newPlanPrice: 299900, changeDate: date, periodStart: date, periodEnd: date })
    ).toThrow('Invalid billing period');
  });
});

// ── seatProration() ───────────────────────────────────────────
describe('seatProration()', () => {
  it('calculates seat proration using 30-day month', () => {
    const changeDate = new Date('2024-01-15');
    const periodEnd  = new Date('2024-02-01');

    const result = seatProration({
      seatPrice:  10000, // ₹100 per seat in paise
      seatsAdded: 2,
      changeDate,
      periodEnd,
    });

    // daysRemaining = 17
    // dailySeatRate = Math.round(10000 / 30) = 333
    // chargeAmount = 333 * 17 * 2 = 11322
    const expectedDailyRate  = Math.round(10000 / 30);
    const expectedCharge     = expectedDailyRate * 17 * 2;

    expect(result).toBe(expectedCharge);
    expect(Number.isInteger(result)).toBe(true);
  });
});
