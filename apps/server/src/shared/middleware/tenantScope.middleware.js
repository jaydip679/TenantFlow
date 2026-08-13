'use strict';

/**
 * Tenant Scope Middleware — Full Implementation
 *
 * Loads tenant context on every route that requires it.
 * Uses Redis-first caching (TTL 300s) to minimize DB queries.
 *
 * Flow:
 *   1. Super admin → bypass (no tenant scope needed)
 *   2. Validate paramTenantId matches JWT tenantId (cross-tenant protection)
 *   3. Check Redis cache: tenant:ctx:{tenantId}
 *   4. On cache miss: parallel DB queries → Tenant + active Subscription + usedSeats count
 *   5. Suspended tenant check (blockable with allowSuspended option)
 *   6. Attach req.tenantContext
 *
 * req.tenantContext shape:
 *   { tenantId, status, planId, subscriptionStatus, seatLimit, usedSeats, features }
 *
 * REF: docs/SRS.md §12.2 — tenantScope.middleware.js specification
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.3
 */

const redisClient    = require('../../config/redis');
const { AppError }   = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');
const { asyncHandler } = require('../utils/asyncHandler');

// Lazy requires to avoid circular deps at load time
const identityFacade = require('../facades/identity.facade');
const getSubscription = () => require('../../models/Subscription.model');

const CACHE_TTL = 300; // 5 minutes

/**
 * Tenant scope middleware factory.
 *
 * @param {{ allowSuspended?: boolean }} options
 *   allowSuspended: if true, suspended tenants are allowed through (for payment routes)
 * @returns {import('express').RequestHandler}
 */
const tenantScope = (options = {}) =>
  asyncHandler(async (req, res, next) => {
    // 1. Super admin bypasses all tenant scope checks
    if (req.user?.role === 'super_admin') return next();

    // 2. Extract tenantId from route params, body, or JWT
    const paramTenantId = req.params.tenantId || req.body?.tenantId || null;

    if (paramTenantId) {
      // Validate cross-tenant access — JWT tenantId must match param
      if (paramTenantId !== req.user.tenantId) {
        throw new AppError(
          'Access to this tenant is not authorized.',
          403,
          ERROR_CODES.TENANT_SCOPE_VIOLATION
        );
      }
    }

    const tenantId = req.user.tenantId;

    if (!tenantId) {
      throw new AppError('No tenant associated with this user.', 403, ERROR_CODES.TENANT_SCOPE_VIOLATION);
    }

    // 3. Try Redis cache first
    const cacheKey = `tenant:ctx:${tenantId}`;
    const cached   = await redisClient.get(cacheKey);

    if (cached) {
      req.tenantContext = JSON.parse(cached);
    } else {
      // 4. Cache miss — parallel DB queries
      // Fetch from Identity Service over HTTP and Billing local DB in parallel
      const [scopeContext, activeSub] = await Promise.all([
        identityFacade.getTenantScopeContext(tenantId),
        getSubscription().findOne({
          tenantId: tenantId,
          status: { $in: ['active', 'trialing', 'pending_downgrade', 'past_due'] },
        }).lean(),
      ]);

      if (!scopeContext) {
        throw new AppError('Tenant not found', 404, ERROR_CODES.TENANT_NOT_FOUND);
      }

      const { status, features, usedSeats } = scopeContext;

      // Convert Mongoose Map → plain object safely.
      // lean() may return a plain object (already iterable) or a Mongoose Map.
      // Array.from() handles both cases without crashing.
      let featuresObj = {};
      if (features) {
        try {
          featuresObj = features instanceof Map
            ? Object.fromEntries(Array.from(features))
            : Object.fromEntries(Object.entries(features));
        } catch {
          featuresObj = {};
        }
      }

      req.tenantContext = {
        tenantId,
        status:             tenant.status,
        // seatLimit = the plan's max allowed seats (from tenant.features, set when plan is assigned/upgraded)
        // seatCount on the subscription = USED seats — must NOT be used as the limit
        seatLimit:          featuresObj?.max_seats ?? 0,
        usedSeats,
        features:           featuresObj,
      };

      // 5. Populate cache
      await redisClient.set(cacheKey, JSON.stringify(req.tenantContext), 'EX', CACHE_TTL);
    }

    // 6. Block suspended tenants (unless explicitly allowed — e.g. payment routes)
    if (req.tenantContext.status === 'suspended' && !options.allowSuspended) {
      throw new AppError(
        'Your account has been suspended due to an outstanding payment. Please resolve your balance to restore access.',
        403,
        ERROR_CODES.TENANT_SUSPENDED
      );
    }

    next();
  });

module.exports = { tenantScope };
