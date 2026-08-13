'use strict';

/**
 * Identity Facade (Phase 4C)
 * 
 * Provides an internal interface to Identity & Tenant domain data.
 * Used by Billing and other domains to fetch required context.
 * Now acts as an HTTP client communicating with the Identity Service
 * Internal APIs, entirely decoupling the MongoDB models.
 */

const internalClient = require('../utils/internalClient');
const logger = require('../utils/logger');

// Identity Service URL base
const getBaseUrl = () => process.env.IDENTITY_SERVICE_URL || 'http://localhost:3003';

/**
 * Fetch a Plan by ID.
 * @param {string} planId 
 * @returns {Promise<Object>} Lean Plan document
 */
const getPlan = async (planId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/plans/${planId}`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

/**
 * Fetch the default public plan (lowest price).
 * @returns {Promise<Object>} Lean Plan document
 */
const getDefaultPlan = async () => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/plans/default`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

/**
 * Fetch a PlanVersion by ID.
 * @param {string} planVersionId 
 * @returns {Promise<Object>} Lean PlanVersion document
 */
const getPlanVersion = async (planVersionId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/plan-versions/${planVersionId}`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

/**
 * Fetch the minimal Tenant profile required for billing/invoicing.
 * @param {string} tenantId 
 * @returns {Promise<Object>} Lean Tenant document with billing fields
 */
const getTenantBillingProfile = async (tenantId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/tenants/${tenantId}/billing-profile`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

/**
 * Fetch minimal Tenant profiles for a list of IDs (used to avoid N+1 queries).
 * @param {string[]} tenantIds 
 * @returns {Promise<Object>} Map of tenantId -> Tenant
 */
const getTenantProfiles = async (tenantIds) => {
  if (!tenantIds?.length) return {};
  try {
    const res = await internalClient.post(`${getBaseUrl()}/api/internal/identity/tenants/profiles`, { tenantIds });
    return res.data;
  } catch (err) {
    throw err;
  }
};



/**
 * Get active/invited user count for a tenant to check seat limits.
 * @param {string} tenantId 
 * @returns {Promise<number>}
 */
const getActiveUserCount = async (tenantId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/tenants/${tenantId}/users/count`);
    return res.data.count;
  } catch (err) {
    throw err;
  }
};

/**
 * Get users for a tenant.
 */
const getTenantUsers = async (tenantId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/tenants/${tenantId}/users`);
    return res.data;
  } catch (err) {
    throw err;
  }
};

/**
 * Get tenant scope context (used by tenantScope.middleware.js)
 */
const getTenantScopeContext = async (tenantId) => {
  try {
    const res = await internalClient.get(`${getBaseUrl()}/api/internal/identity/tenants/${tenantId}/scope`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

/**
 * Get the latest PlanVersion for a plan, or create one if none exists.
 * In Phase 4C, this is simplified.
 */
const getLatestPlanVersion = async (planId, plan) => {
  try {
    const res = await internalClient.post(`${getBaseUrl()}/api/internal/identity/plans/${planId}/snapshot`);
    return res.data;
  } catch (err) {
    throw err;
  }
};

/**
 * Create a new PlanVersion snapshot for a given plan (used on upgrade).
 * @param {Object} plan 
 * @param {Object} [session] 
 */
const createPlanVersionSnapshot = async (plan, session = null) => {
  if (session) {
    logger.warn('MongoDB session passed to identityFacade.createPlanVersionSnapshot but cannot be used across HTTP boundary.');
  }
  try {
    const res = await internalClient.post(`${getBaseUrl()}/api/internal/identity/plans/${plan._id}/snapshot`);
    return res.data;
  } catch (err) {
    throw err;
  }
};

module.exports = {
  getPlan,
  getDefaultPlan,
  getPlanVersion,
  getTenantBillingProfile,
  getTenantProfiles,
  getActiveUserCount,
  getTenantUsers,
  getTenantScopeContext,
  getLatestPlanVersion,
  createPlanVersionSnapshot,
};
