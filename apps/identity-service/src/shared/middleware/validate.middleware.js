'use strict';

/**
 * Validate Middleware
 *
 * Wraps Joi schema validation for request body, query params, and URL params.
 * Returns 422 Unprocessable Entity with field-level error details on failure.
 *
 * Usage in route files:
 *   router.post('/', validate(myJoiSchema), controller.create);
 *
 * REF: docs/SYSTEM_DESIGN.md §3.1 — Middleware Execution Order (step 10)
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T1.7
 */

const { AppError }    = require('../errors/AppError');
const { ERROR_CODES } = require('../errors/errorCodes');

/**
 * Validate request against a Joi schema.
 *
 * @param {import('joi').ObjectSchema} schema - Joi schema with optional { body, query, params } keys
 * @returns {Function} Express middleware
 */
const validate = (schema) => (req, res, next) => {
  const target = {
    ...(schema.describe().keys?.body   && { body:   req.body }),
    ...(schema.describe().keys?.query  && { query:  req.query }),
    ...(schema.describe().keys?.params && { params: req.params }),
  };

  // If the schema validates the whole object (not nested body/query/params), validate req.body
  const toValidate = Object.keys(target).length > 0 ? target : req.body;

  const { error, value } = schema.validate(toValidate, {
    abortEarly:  false, // Return all validation errors, not just the first
    stripUnknown: true, // Remove unknown fields from the validated value
    allowUnknown: false,
  });

  if (error) {
    const details = error.details.map((d) => ({
      field:   d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));

    return next(
      new AppError('Validation failed', 422, ERROR_CODES.VALIDATION_ERROR, details)
    );
  }

  // Attach validated (and stripped) value back to the request
  if (Object.keys(target).length > 0) {
    if (target.body)   req.body   = value.body   || req.body;
    if (target.query)  req.query  = value.query  || req.query;
    if (target.params) req.params = value.params || req.params;
  } else {
    req.body = value;
  }

  next();
};

module.exports = { validate };
