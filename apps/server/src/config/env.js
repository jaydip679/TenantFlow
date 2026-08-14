'use strict';

/**
 * Environment Variable Validation
 *
 * This MUST be the first import in server.js.
 * Validates all required environment variables at startup.
 * Crashes the process with a clear error if any required variable is missing or invalid.
 *
 * REF: docs/SRS.md §18 — Environment Variables Reference
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.3
 */

const Joi = require('joi');

const envSchema = Joi.object({
  // ── Server ──────────────────────────────────────────────
  NODE_ENV:  Joi.string().valid('development', 'staging', 'production').required(),
  PORT:      Joi.number().default(5000),
  CLIENT_URL: Joi.string().uri().required(),

  // ── Database ────────────────────────────────────────────
  MONGODB_URI: Joi.string().required(),
  REDIS_URL:   Joi.string().required(),

  // ── JWT ─────────────────────────────────────────────────
  JWT_ACCESS_SECRET:  Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // ── Razorpay ────────────────────────────────────────────
  RAZORPAY_KEY_ID:        Joi.string().required(),
  RAZORPAY_KEY_SECRET:    Joi.string().required(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().required(),

  // ── Cloudinary ──────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY:    Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),


  // ── Email ───────────────────────────────────────────────
          
  // ── Super Admin Seed ────────────────────────────────────
  SUPER_ADMIN_EMAIL:    Joi.string().email({ tlds: { allow: false } }).required(),
  SUPER_ADMIN_PASSWORD: Joi.string().min(8).required(),

  // ── Business Config ─────────────────────────────────────
  TAX_RATE:            Joi.number().default(18),
  DEFAULT_TRIAL_DAYS:  Joi.number().default(14),

  // ── Logging ─────────────────────────────────────────────
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),

  // ── Bull Board ──────────────────────────────────────────
  BULL_BOARD_USERNAME: Joi.string().required(),
  BULL_BOARD_PASSWORD: Joi.string().required(),
}).unknown(); // Allow additional env vars from the OS

const { error, value } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  const missing = error.details.map((d) => `  ✗ ${d.message}`).join('\n');
  console.error('\n❌ Environment variable validation failed:\n');
  console.error(missing);
  console.error('\nCheck your .env file against .env.example\n');
  process.exit(1);
}

module.exports = value;
