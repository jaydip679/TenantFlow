'use strict';

/**
 * Internal Auth Middleware
 * 
 * Protects /api/internal/* routes from external access.
 * Validates the X-Internal-Secret header.
 */

const { AppError } = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

const internalAuth = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  
  if (!secret || secret !== process.env.INTERNAL_SERVICE_SECRET) {
    return next(new AppError('Unauthorized internal access', 401, ERROR_CODES.AUTH_UNAUTHORIZED));
  }
  
  next();
};

module.exports = { internalAuth };
