'use strict';

const ReadTenant = require('../models/ReadTenant.model');
const TenantEngagementMetrics = require('../models/TenantEngagementMetrics.model');
const logger = require('../shared/utils/logger');

const handleTenantCreated = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const existingTenant = await ReadTenant.findOne({ tenantId }).session(session);
  if (!existingTenant) {
    await ReadTenant.create(
      [
        {
          tenantId,
          name: payload.name,
          slug: payload.slug,
          ownerEmail: payload.email,
          status: 'active',
          currentPlanId: null,
          mrr: 0,
          healthScore: null,
          hasActiveDunning: false,
          createdAt: payload.createdAt || envelope.occurredAt || new Date(),
          aggregateVersion: payload.aggregateVersion,
        },
      ],
      { session }
    );
  }

  const existingMetrics = await TenantEngagementMetrics.findOne({ tenantId }).session(session);
  if (!existingMetrics) {
    await TenantEngagementMetrics.create(
      [
        {
          tenantId,
          totalLogins: 0,
          failedPaymentsCount: 0,
          lastLoginAt: null,
        },
      ],
      { session }
    );
  }
};

const handleTenantSuspended = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  
  const tenant = await ReadTenant.findOne({ tenantId }).session(session);
  if (tenant && payload.aggregateVersion > tenant.aggregateVersion) {
    tenant.status = 'suspended';
    tenant.aggregateVersion = payload.aggregateVersion;
    await tenant.save({ session });
  } else if (!tenant) {
    logger.warn({ tenantId }, 'Received tenant.suspended for unknown tenant');
  }
};

const handleTenantRestored = async (envelope, session) => {
  const { tenantId, payload } = envelope;

  const tenant = await ReadTenant.findOne({ tenantId }).session(session);
  if (tenant && payload.aggregateVersion > tenant.aggregateVersion) {
    tenant.status = 'active';
    tenant.aggregateVersion = payload.aggregateVersion;
    await tenant.save({ session });
  } else if (!tenant) {
    logger.warn({ tenantId }, 'Received tenant.restored for unknown tenant');
  }
};

const handleDunningStarted = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  const tenant = await ReadTenant.findOne({ tenantId }).session(session);
  // Dunning events don't strictly have a tenant aggregateVersion, they have Dunning aggregateVersion.
  // We can just apply it unconditionally since dunning represents transient state.
  if (tenant) {
    tenant.hasActiveDunning = true;
    await tenant.save({ session });
  }
};

const handleDunningAbandoned = async (envelope, session) => {
  const { tenantId, payload } = envelope;
  const tenant = await ReadTenant.findOne({ tenantId }).session(session);
  if (tenant) {
    tenant.hasActiveDunning = false;
    await tenant.save({ session });
  }
};

module.exports = {
  handleTenantCreated,
  handleTenantSuspended,
  handleTenantRestored,
  handleDunningStarted,
  handleDunningAbandoned,
};
