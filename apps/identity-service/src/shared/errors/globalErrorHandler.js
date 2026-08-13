'use strict';

/**
 * Global Error Handler — Express Error Middleware
 *
 * This is the LAST middleware registered in app.js.
 * It catches all errors passed via next(err) and formats them
 * into the standard TenantFlow error response envelope.
 *
 * Operational errors (AppError instances): message exposed to client.
 * Programming errors (unhandled exceptions): generic message, details hidden.
 *
 * REF: docs/SYSTEM_DESIGN.md §14 — Error Handling Architecture
 * REF: docs/SRS.md §1.2 — Response Envelope
 */

const { AppError } = require('./AppError');
const { ERROR_CODES } = require('./errorCodes');
const logger = require('../utils/logger');

/**
 * Handle Mongoose CastError (e.g. invalid ObjectId in URL param).
 * @param {Error} err
 * @returns {AppError}
 */
const handleCastError = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400, ERROR_CODES.VALIDATION_ERROR);

/**
 * Handle Mongoose duplicate key error (code 11000).
 * @param {Error} err
 * @returns {AppError}
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field];
  return new AppError(
    `Duplicate value for field '${field}': ${value}`,
    409,
    ERROR_CODES.VALIDATION_ERROR,
    { field, value }
  );
};

/**
 * Handle Mongoose ValidationError (schema-level validation failures).
 * @param {Error} err
 * @returns {AppError}
 */
const handleValidationError = (err) => {
  const details = Object.values(err.errors).map((e) => ({
    field:   e.path,
    message: e.message,
  }));
  return new AppError('Validation failed', 422, ERROR_CODES.VALIDATION_ERROR, details);
};

/**
 * Handle JWT errors.
 * @param {Error} err
 * @returns {AppError}
 */
const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401, ERROR_CODES.AUTH_TOKEN_INVALID);

const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again.', 401, ERROR_CODES.AUTH_TOKEN_EXPIRED);

/**
 * Send full error details (development only).
 */
const sendDevError = (err, req, res) => {
  logger.error({
    requestId:  req.id,
    method:     req.method,
    url:        req.originalUrl,
    statusCode: err.statusCode,
    errorCode:  err.errorCode,
    stack:      err.stack,
  }, err.message);

  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      code:      err.errorCode || ERROR_CODES.INTERNAL_ERROR,
      message:   err.message,
      details:   err.details || null,
      stack:     err.stack,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * Send safe error response (staging / production).
 * Hides stack traces and internal details for non-operational errors.
 */
const sendProdError = (err, req, res) => {
  if (err.isOperational) {
    // Operational error: safe to expose message to client
    res.status(err.statusCode).json({
      success: false,
      error: {
        code:      err.errorCode,
        message:   err.message,
        details:   err.details || null,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } else {
    // Programming error: log fully, return generic message to client
    logger.error({
      requestId:  req.id,
      method:     req.method,
      url:        req.originalUrl,
      stack:      err.stack,
    }, `UNHANDLED ERROR: ${err.message}`);

    res.status(500).json({
      success: false,
      error: {
        code:      ERROR_CODES.INTERNAL_ERROR,
        message:   'Something went wrong. Please try again later.',
        details:   null,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Global error handling middleware.
 * Must be registered as the LAST middleware in app.js.
 *
 * @param {Error}              err
 * @param {express.Request}    req
 * @param {express.Response}   res
 * @param {express.NextFunction} next
 */
const globalErrorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  err.statusCode = err.statusCode || 500;

  // Transform known third-party errors into AppError instances
  let processedErr = err;
  if (err.name === 'CastError')           processedErr = handleCastError(err);
  if (err.code === 11000)                 processedErr = handleDuplicateKeyError(err);
  if (err.name === 'ValidationError')     processedErr = handleValidationError(err);
  if (err.name === 'JsonWebTokenError')   processedErr = handleJWTError();
  if (err.name === 'TokenExpiredError')   processedErr = handleJWTExpiredError();

  if (process.env.NODE_ENV === 'development') {
    sendDevError(processedErr, req, res);
  } else {
    sendProdError(processedErr, req, res);
  }
};

module.exports = { globalErrorHandler };
