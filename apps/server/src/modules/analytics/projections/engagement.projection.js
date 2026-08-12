'use strict';

const TenantEngagementMetrics = require('../models/TenantEngagementMetrics.model');
const logger = require('../../../shared/utils/logger');

const handleUserLogin = async (envelope, session) => {
  const { tenantId, occurredAt } = envelope;
  
  if (!tenantId) {
    logger.debug('user.login skipped: no tenant context');
    return;
  }

  const result = await TenantEngagementMetrics.updateOne(
    { tenantId },
    {
      $inc: { totalLogins: 1 },
      $set: { lastLoginAt: occurredAt || new Date() },
    },
    { session }
  );

  if (result.matchedCount === 0) {
    logger.warn({ tenantId }, 'Received user.login for unknown tenant engagement metrics');
  }
};

const handlePaymentFailed = async (envelope, session) => {
  const { tenantId } = envelope;

  if (!tenantId) {
    logger.debug('payment.failed skipped: no tenant context');
    return;
  }

  const result = await TenantEngagementMetrics.updateOne(
    { tenantId },
    {
      $inc: { failedPaymentsCount: 1 },
    },
    { session }
  );

  if (result.matchedCount === 0) {
    logger.warn({ tenantId }, 'Received payment.failed for unknown tenant engagement metrics');
  }
};

module.exports = {
  handleUserLogin,
  handlePaymentFailed,
};
