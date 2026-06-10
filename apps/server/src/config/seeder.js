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
 * Main seeder entry point.
 * Called once during server startup after DB connection is established.
 */
const seeder = async () => {
  try {
    await seedSuperAdmin();
    // Phase 2 will add: await seedDefaultPlans();
  } catch (err) {
    logger.error({ err: err.message }, 'Seeder failed');
    // Do not crash the server if seeding fails — log and continue
  }
};

module.exports = { seeder };
