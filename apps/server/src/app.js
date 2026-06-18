'use strict';

/**
 * Express Application Factory
 *
 * Creates and configures the Express application with all middleware
 * in the mandatory order specified in SYSTEM_DESIGN.md §3.1.
 *
 * Middleware chain (MUST NOT be reordered):
 *   [1] Helmet          → Security headers
 *   [2] CORS            → Cross-origin policy
 *   [3] Global Rate Limit → Redis sliding window
 *   [4] Body Parser     → JSON + URL-encoded (10KB limit)
 *   [5] Request ID      → UUID stamp on every request
 *   [6] Morgan          → HTTP request logger (Winston stream)
 *   [7] Health endpoint → GET /health
 *   [8] Swagger         → GET /api/docs (non-production)
 *   [9] API Routes      → /api/v1/* (mounted in later phases)
 *   [10] 404 Handler    → Unknown route catcher
 *   [11] Global Error Handler → LAST middleware
 *
 * REF: docs/SYSTEM_DESIGN.md §3 — Request Lifecycle
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.8
 */

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

const { globalRateLimiter }   = require('./shared/middleware/rateLimiter.middleware');
const { requestIdMiddleware }  = require('./shared/middleware/requestId.middleware');
const { globalErrorHandler }  = require('./shared/errors/globalErrorHandler');
const { AppError }             = require('./shared/errors/AppError');
const { ERROR_CODES }          = require('./shared/errors/errorCodes');
const { setupSwagger }         = require('./docs/swagger.config');
const logger                   = require('./shared/utils/logger');
const redisClient              = require('./config/redis');

const app = express();

// ── [1] Helmet — Security Headers ────────────────────────────
// REF: docs/SYSTEM_DESIGN.md §16.1
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],  // Allow Swagger UI inline scripts
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for Swagger UI compatibility
  })
);

// ── [2] CORS ─────────────────────────────────────────────────
app.use(
  cors({
    origin:      process.env.CLIENT_URL,
    credentials: true, // Required for HttpOnly refresh token cookies
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  })
);

// ── [3] Global Rate Limiter ───────────────────────────────────
app.use(globalRateLimiter);

// ── [4] Body Parsers ─────────────────────────────────────────
// Webhook route uses express.raw() — configured in payment routes
// All other routes use JSON with 10KB limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── [5] Request ID ───────────────────────────────────────────
app.use(requestIdMiddleware);

// ── [5.5] Cookie Parser ───────────────────────────────────────
// Required for reading HttpOnly refresh token cookie on /auth/refresh
app.use(cookieParser());

// ── [6] HTTP Request Logger (Morgan → Winston) ───────────────
app.use(
  morgan(':method :url :status :response-time ms - :res[content-length]', {
    stream: logger.stream,
    skip: () => process.env.NODE_ENV === 'test',
  })
);

// ── [7] Health Endpoint ───────────────────────────────────────
// REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.9
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the server and its dependencies (MongoDB, Redis).
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All services healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:    { type: string, example: ok }
 *                 services:  { type: object }
 *                 timestamp: { type: string, format: date-time }
 *                 version:   { type: string }
 *       503:
 *         description: One or more services degraded
 */
app.get('/health', async (req, res) => {
  const dbState    = mongoose.connection.readyState; // 1 = connected
  const redisState = redisClient.status;             // 'ready' = connected

  const isHealthy = dbState === 1 && redisState === 'ready';
  const status    = isHealthy ? 'ok' : 'degraded';

  res.status(isHealthy ? 200 : 503).json({
    status,
    services: {
      db:    dbState === 1 ? 'ok' : 'unavailable',
      redis: redisState === 'ready' ? 'ok' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || '1.0.0',
    env:       process.env.NODE_ENV,
  });
});

// ── [8] Swagger Documentation (non-production) ───────────────
setupSwagger(app);

// ── [9] API Routes ────────────────────────────────────────────
// Phase 1: Auth routes
const authRoutes = require('./modules/auth/auth.routes');
app.use('/api/v1/auth', authRoutes);

// Phase 2 — Plan Catalog & Tenant Management
const planRoutes   = require('./modules/plans/plan.routes');
const tenantRoutes = require('./modules/tenants/tenant.routes');
app.use('/api/v1/plans',   planRoutes);
app.use('/api/v1/tenants', tenantRoutes);

// Phase 3 — Subscription Lifecycle
const subscriptionRoutes = require('./modules/subscriptions/subscription.routes');
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Phase 4 — Invoicing & PDF Generation
const invoiceRoutes = require('./modules/invoices/invoice.routes');
app.use('/api/v1/invoices', invoiceRoutes);

// Phase 5 — Payment Processing
const paymentRoutes = require('./modules/payments/payment.routes');
app.use('/api/v1/payments', paymentRoutes);


// ── [10] 404 Handler ──────────────────────────────────────────
app.all('*', (req, res, next) => {
  next(
    new AppError(
      `Route ${req.method} ${req.originalUrl} not found`,
      404,
      ERROR_CODES.NOT_FOUND
    )
  );
});

// ── [11] Global Error Handler (MUST be last) ──────────────────
app.use(globalErrorHandler);

module.exports = app;
