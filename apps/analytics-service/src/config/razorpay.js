'use strict';

/**
 * Razorpay SDK Initialization
 *
 * Creates and exports a single Razorpay instance using credentials from env.
 * Payment orders are ALWAYS created server-side — never client-side.
 *
 * REF: docs/SYSTEM_DESIGN.md §9 — Razorpay Integration Architecture
 * REF: docs/PRD.md §F6 — Payment Processing
 */

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;
