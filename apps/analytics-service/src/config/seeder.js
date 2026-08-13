'use strict';

/**
 * Database Seeder
 *
 * Seeds essential initial data on server startup:
 *   1. Super Admin user — created if SUPER_ADMIN_EMAIL doesn't exist
 *   2. Default plan tiers — seeded if plans collection is empty
 *      (Plans seeded in Phase 2; stub here for Phase 0)
 *
 * This is idempotent — safe to call on every server restart.
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T1.9 — Super Admin Seeder
 * REF: docs/PRD.md §4.1 — Super Admin persona
 * REF: docs/DATABASE_DESIGN.md §3.1 — users schema
 */

const bcrypt = require('bcrypt');
const logger = require('../shared/utils/logger');

// Models are imported lazily here to avoid circular dependency issues
// at startup (models require constants, seeder runs after DB connects)

const BCRYPT_COST_FACTOR = 12;

/**
 * Seed the super admin user if it doesn't exist.
 * Super admin has tenantId: null and bypasses all tenant scope checks.
 */
const seedSuperAdmin = async () => {
  // Dynamic require to avoid circular imports at module load time
  const User = require('../models/User.model');

  const existingSuperAdmin = await User.findOne({
    email: process.env.SUPER_ADMIN_EMAIL.toLowerCase(),
  });

  if (existingSuperAdmin) {
    logger.info('Super admin already exists — skipping seed');
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, BCRYPT_COST_FACTOR);

  await User.create({
    email:           process.env.SUPER_ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    firstName:       'Super',
    lastName:        'Admin',
    role:            'super_admin',
    tenantId:        null,       // Super admin has no tenant
    isEmailVerified: true,
    status:          'active',
  });

  logger.info(`Super admin seeded: ${process.env.SUPER_ADMIN_EMAIL}`);
};

/**
 * Seed the 4 default plan tiers if the plans collection is empty.
 *
 * Prices from docs/PRD.md §5.3 — Plan Catalog:
 *   Free:       ₹0         (2 seats, no trial)
 *   Starter:    ₹999/mo    (5 seats, 14-day trial)
 *   Growth:     ₹2,999/mo  (25 seats, 14-day trial)
 *   Enterprise: ₹9,999/mo  (200 seats, 14-day trial)
 *
 * CRITICAL: Prices stored in paise (integer). ₹999 → 99900
 */
const seedDefaultPlans = async () => {
  const Plan        = require('../models/Plan.model');
  const PlanVersion = require('../models/PlanVersion.model');

  const count = await Plan.countDocuments();
  if (count > 0) {
    logger.info(`Plans already seeded (${count} found) — skipping`);
    return;
  }

  const defaultPlans = [
    {
      name:        'free',
      displayName: 'Free',
      description: 'For individuals and small teams getting started.',
      price:       0,          // ₹0
      currency:    'INR',
      interval:    'monthly',
      trialDays:   0,          // No trial on Free plan
      features: {
        max_seats:           2,
        api_calls_per_month: 1000,
        storage_gb:          1,
        advanced_analytics:  false,
        ai_assistant:        false,
        priority_support:    false,
      },
      isActive:  true,
      isPublic:  true,
      sortOrder: 0,
    },
    {
      name:        'starter',
      displayName: 'Starter',
      description: 'For small teams ready to grow.',
      price:       99900,      // ₹999 in paise
      currency:    'INR',
      interval:    'monthly',
      trialDays:   14,
      features: {
        max_seats:           5,
        api_calls_per_month: 10000,
        storage_gb:          5,
        advanced_analytics:  false,
        ai_assistant:        false,
        priority_support:    false,
      },
      isActive:  true,
      isPublic:  true,
      sortOrder: 1,
    },
    {
      name:        'growth',
      displayName: 'Growth',
      description: 'For growing teams that need more power.',
      price:       299900,     // ₹2,999 in paise
      currency:    'INR',
      interval:    'monthly',
      trialDays:   14,
      features: {
        max_seats:           25,
        api_calls_per_month: 100000,
        storage_gb:          50,
        advanced_analytics:  true,
        ai_assistant:        false,
        priority_support:    false,
      },
      isActive:  true,
      isPublic:  true,
      sortOrder: 2,
    },
    {
      name:        'enterprise',
      displayName: 'Enterprise',
      description: 'For large organizations with advanced needs.',
      price:       999900,     // ₹9,999 in paise
      currency:    'INR',
      interval:    'monthly',
      trialDays:   14,
      features: {
        max_seats:           200,
        api_calls_per_month: 1000000,
        storage_gb:          500,
        advanced_analytics:  true,
        ai_assistant:        true,
        priority_support:    true,
      },
      isActive:  true,
      isPublic:  true,
      sortOrder: 3,
    },
  ];

  for (const planData of defaultPlans) {
    const plan = await Plan.create(planData);
    // Create initial PlanVersion snapshot (version 1) for each plan
    await PlanVersion.create({
      planId:      plan._id,
      version:     1,
      name:        plan.name,
      displayName: plan.displayName,
      price:       plan.price,
      currency:    plan.currency,
      interval:    plan.interval,
      features:    plan.features,
      snapshotAt:  new Date(),
    });
  }

  logger.info('Default plans seeded: Free, Starter, Growth, Enterprise');
};

/**
 * Main seeder entry point.
 * Called once during server startup after DB connection is established.
 */
const seeder = async () => {
  try {
    await seedSuperAdmin();
    await seedDefaultPlans();
  } catch (err) {
    logger.error({ err: err.message }, 'Seeder failed');
    // Do not crash the server if seeding fails — log and continue
  }
};

module.exports = { seeder };

