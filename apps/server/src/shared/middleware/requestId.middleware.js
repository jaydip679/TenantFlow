'use strict';

/**
 * Request ID Middleware
 *
 * Stamps every incoming request with a UUID v4 unique request ID.
 * The ID is:
 *   1. Attached to req.id (used in logging, error responses, audit logs)
 *   2. Returned to the client in X-Request-ID response header
 *
 * This enables end-to-end request tracing across logs and client errors.
 *
 * REF: docs/SYSTEM_DESIGN.md §3.1 — Middleware Execution Order (step 5)
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T1.7
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requestIdMiddleware = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

module.exports = { requestIdMiddleware };
