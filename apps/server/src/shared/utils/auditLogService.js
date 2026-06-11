'use strict';

/**
 * Audit Log Service
 *
 * Centralized helper for creating immutable AuditLog entries.
 * Called from service layer ONLY — never from controllers.
 *
 * RULE: Every significant state change that touches financial documents,
 * user accounts, or subscription state MUST call createAuditLog.
 *
 * Failures are logged but do not throw — audit log creation is a
 * "best effort" side effect and should not break the main transaction.
 *
 * REF: docs/DATABASE_DESIGN.md §1.2 — Financial Data Rules (rule 4)
 * REF: docs/DATABASE_DESIGN.md §3.12 — audit_logs schema
 */

const logger = require('./logger');

// Lazy require to avoid circular deps at module load time
const getAuditLogModel = () => require('../../models/AuditLog.model');

/**
 * @typedef {Object} AuditActor
 * @property {string|import('mongoose').Types.ObjectId} userId
 * @property {string} role
 * @property {string} email
 */

/**
 * Create an immutable audit log entry.
 *
 * @param {Object} params
 * @param {string}       params.event        - e.g. 'user.registered', 'invoice.paid'
 * @param {string}       params.resourceType - 'user' | 'tenant' | 'subscription' | 'invoice' | 'payment' | 'plan'
 * @param {string}       params.resourceId   - MongoDB ObjectId of the affected document
 * @param {AuditActor}   params.actor        - Who performed the action
 * @param {string|null}  [params.tenantId]   - null for super_admin actions
 * @param {Object|null}  [params.before]     - Document state before change
 * @param {Object|null}  [params.after]      - Document state after change
 * @param {string|null}  [params.ip]         - Client IP address
 * @param {string|null}  [params.userAgent]  - Client User-Agent header
 * @param {string|null}  [params.requestId]  - Request UUID from requestId middleware
 * @returns {Promise<void>}
 */
const createAuditLog = async ({
  event,
  resourceType,
  resourceId,
  actor,
  tenantId   = null,
  before     = null,
  after      = null,
  ip         = null,
  userAgent  = null,
  requestId  = null,
}) => {
  try {
    const AuditLog = getAuditLogModel();
    await AuditLog.create({
      tenantId,
      actor: {
        userId: actor?.userId || null,
        role:   actor?.role   || null,
        email:  actor?.email  || null,
      },
      event,
      resourceType,
      resourceId,
      before,
      after,
      ip,
      userAgent,
      requestId,
    });
  } catch (err) {
    // Audit log failure must not break the caller's operation
    logger.error({ err: err.message, event, resourceType, resourceId }, 'AuditLog creation failed');
  }
};

module.exports = { createAuditLog };
