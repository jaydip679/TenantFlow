'use strict';

/**
 * Subscription State Machine
 *
 * Defines valid status transitions for the subscription lifecycle.
 * Any attempt to make an invalid transition throws a 422 AppError.
 *
 * State diagram (REF: docs/SRS.md §5 — State Machine):
 *
 *   trialing         → active, cancelled
 *   active           → past_due, cancelled, paused, pending_downgrade
 *   pending_downgrade→ active, past_due, cancelled
 *   past_due         → active, suspended, cancelled
 *   paused           → active, cancelled
 *   suspended        → active, cancelled
 *   cancelled        → active  (reactivation only)
 *
 * REF: docs/SRS.md §5 — Subscription State Machine
 * REF: docs/IMPLEMENTATION_ROADMAP.md §6.1 T3.3
 */

const { AppError }     = require('../../shared/errors/AppError');
const { ERROR_CODES }  = require('../../shared/errors/errorCodes');

const ALLOWED_TRANSITIONS = {
  trialing:          ['active', 'cancelled', 'pending_downgrade'],  // can schedule downgrade during trial
  active:            ['past_due', 'cancelled', 'paused', 'pending_downgrade'],
  pending_downgrade: ['active', 'past_due', 'cancelled'],
  past_due:          ['active', 'suspended', 'cancelled'],
  paused:            ['active', 'cancelled'],
  suspended:         ['active', 'cancelled'],
  cancelled:         ['active'],  // reactivation only
};

/**
 * Validate a subscription status transition.
 * Throws 422 SUBSCRIPTION_INVALID_TRANSITION if the transition is not allowed.
 *
 * @param {string} fromStatus - Current subscription status
 * @param {string} toStatus   - Requested new status
 * @throws {AppError} 422 if transition is invalid
 */
const validateTransition = (fromStatus, toStatus) => {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];

  if (!allowed) {
    throw new AppError(
      `Unknown subscription status: '${fromStatus}'`,
      422,
      ERROR_CODES.SUBSCRIPTION_INVALID_TRANSITION,
      { fromStatus, toStatus }
    );
  }

  if (!allowed.includes(toStatus)) {
    throw new AppError(
      `Cannot transition subscription from '${fromStatus}' to '${toStatus}'`,
      422,
      ERROR_CODES.SUBSCRIPTION_INVALID_TRANSITION,
      { fromStatus, toStatus, allowed }
    );
  }
};

module.exports = { ALLOWED_TRANSITIONS, validateTransition };
