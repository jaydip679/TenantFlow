'use strict';

/**
 * Seed script: Creates Starter, Growth, Enterprise plans + their PlanVersions.
 * Run: node scripts/seedPlans.js
 */

require('dotenv').config();
const mongoose    = require('mongoose');
const Plan        = require('../src/models/Plan.model');
const PlanVersion = require('../src/models/PlanVersion.model');

// All prices in paise (1 INR = 100 paise)
const PLANS = [
  {
    name:        'starter',
    displayName: 'Starter',
    description: 'Perfect for small teams getting started.',
    price:       99900,     // ₹999/mo
    currency:    'INR',
    interval:    'monthly',
    trialDays:   14,
    sortOrder:   1,
    isActive:    true,
    isPublic:    true,
    features: {
      max_seats:           5,
      api_calls_per_month: 10000,
      storage_gb:          5,
      advanced_analytics:  false,
      ai_assistant:        false,
      priority_support:    false,
    },
  },
  {
    name:        'growth',
    displayName: 'Growth',
    description: 'For growing teams that need advanced features.',
    price:       299900,    // ₹2,999/mo
    currency:    'INR',
    interval:    'monthly',
    trialDays:   14,
    sortOrder:   2,
    isActive:    true,
    isPublic:    true,
    features: {
      max_seats:           20,
      api_calls_per_month: 50000,
      storage_gb:          20,
      advanced_analytics:  true,
      ai_assistant:        true,
      priority_support:    false,
    },
  },
  {
    name:        'enterprise',
    displayName: 'Enterprise',
    description: 'Unlimited scale with all features and priority support.',
    price:       999900,    // ₹9,999/mo
    currency:    'INR',
    interval:    'monthly',
    trialDays:   14,
    sortOrder:   3,
    isActive:    true,
    isPublic:    true,
    features: {
      max_seats:           1000,
      api_calls_per_month: 500000,
      storage_gb:          100,
      advanced_analytics:  true,
      ai_assistant:        true,
      priority_support:    true,
    },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const planData of PLANS) {
    const existing = await Plan.findOne({ name: planData.name });
    if (existing) {
      console.log(`  ⏩  Plan "${planData.displayName}" already exists — skipping`);
      skipped++;
      continue;
    }

    // Create Plan
    const plan = await Plan.create(planData);

    // Create initial PlanVersion snapshot (version 1)
    await PlanVersion.create({
      planId:      plan._id,
      version:     1,
      name:        plan.name,
      displayName: plan.displayName,
      price:       plan.price,
      currency:    plan.currency,
      interval:    plan.interval,
      features:    new Map(Object.entries(plan.features.toObject ? plan.features.toObject() : plan.features)),
      snapshotAt:  new Date(),
    });

    console.log(`  ✅  Created plan "${planData.displayName}" (₹${planData.price / 100}/mo) + PlanVersion v1`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
