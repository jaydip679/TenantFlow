'use strict';

/**
 * asyncHandler — Async Controller Wrapper
 *
 * Wraps async controller functions to automatically catch Promise rejections
 * and forward them to Express's error handling middleware (next(err)).
 *
 * Without this, an unhandled async error would crash the process.
 * Every controller method MUST be wrapped with asyncHandler.
 *
 * Usage:
 *   exports.createOrder = asyncHandler(async (req, res) => {
 *     const order = await paymentService.createOrder(...);
 *     res.status(201).json({ success: true, data: order });
 *   });
 *
 * REF: docs/SYSTEM_DESIGN.md §3.3 — asyncHandler Pattern
 */

/**
 * @param {Function} fn - Async controller function (req, res, next) => Promise
 * @returns {Function} Express middleware that catches async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
