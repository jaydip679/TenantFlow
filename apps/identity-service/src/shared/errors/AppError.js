'use strict';

/**
 * AppError — Operational Error Class
 *
 * All intentional application errors thrown by services and controllers
 * must use this class. It is distinguished from programmer errors by the
 * `isOperational = true` flag — the global error handler uses this flag
 * to decide whether to expose the error message to the client.
 *
 * Usage:
 *   throw new AppError('Invoice not found', 404, ERROR_CODES.INVOICE_NOT_FOUND);
 *   throw new AppError('Seat limit exceeded', 422, ERROR_CODES.SEAT_LIMIT_EXCEEDED, { currentSeats, maxSeats });
 *
 * REF: docs/SYSTEM_DESIGN.md §14 — Error Handling Architecture
 */

class AppError extends Error {
  /**
   * @param {string}  message    - Human-readable error description (returned to client)
   * @param {number}  statusCode - HTTP status code (400, 401, 403, 404, 409, 422, 429, etc.)
   * @param {string}  errorCode  - Machine-readable error code constant from errorCodes.js
   * @param {Object}  [details]  - Optional structured details for the client (e.g. field errors)
   */
  constructor(message, statusCode, errorCode, details = null) {
    super(message);

    this.statusCode   = statusCode;
    this.errorCode    = errorCode;
    this.details      = details;
    this.isOperational = true; // Marks this as a known, handled error (vs. programmer error)
    this.status       = String(statusCode).startsWith('4') ? 'fail' : 'error';

    // Capture stack trace, excluding the constructor call from the stack
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
