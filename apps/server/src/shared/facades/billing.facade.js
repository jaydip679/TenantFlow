'use strict';

/**
 * Billing Facade
 * 
 * Provides an internal interface to Billing domain data.
 * Used by Identity and other domains to fetch required context without
 * directly importing Billing Mongoose models.
 * 
 * Future: This will become a REST client or Redis projection lookup
 * when Billing is physically extracted.
 */

const Subscription = require('../../models/Subscription.model');

/**
 * Get the count of active subscriptions referencing a specific plan.
 * Used by the Plan service to determine if a plan can be safely archived.
 * 
 * @param {string} planId 
 * @returns {Promise<number>}
 */
const getActiveSubscriptionCountByPlan = async (planId) => {
  return Subscription.countDocuments({
    planId,
    status: { $in: ['trialing', 'active', 'past_due', 'pending_downgrade'] },
  });
};

/**
 * Creates a trial subscription for a newly registered tenant.
 * Used by auth.service.js during registration.
 * 
 * @param {string} tenantId 
 */
const createTrialSubscription = async (tenantId) => {
  const identityFacade = require('./identity.facade');
  const subscriptionService = require('../../modules/subscriptions/subscription.service');
  
  // Find a default plan (lowest price public plan) via IdentityFacade
  const defaultPlan = await identityFacade.getDefaultPlan();
  if (!defaultPlan) {
    // If no plans exist in the system yet, skip subscription creation.
    return null;
  }
  
  return subscriptionService.createSubscription(tenantId, defaultPlan._id);
};

module.exports = {
  getActiveSubscriptionCountByPlan,
  createTrialSubscription,
};
