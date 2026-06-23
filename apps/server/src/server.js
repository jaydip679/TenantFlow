'use strict';

/**
 * Server Entry Point
 *
 * Bootstrap order (MUST NOT be changed):
 *   1. env.js       — Validates all environment variables (crashes if invalid)
 *   2. logger       — Sets up logging before any other module uses it
 *   3. database     — Connects to MongoDB (crashes if initial connection fails)
 *   4. app          — Express application
 *   5. HTTP server  — Starts listening on PORT
 *   6. Graceful shutdown handlers — SIGTERM / SIGINT
 *
 * Workers and crons are initialized after DB + Redis are confirmed healthy.
 * They are added here in later phases.
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.8
 * REF: docs/SYSTEM_DESIGN.md §2 — Production Folder Structure
 */

// ── MUST be FIRST import — validates all env vars or crashes ─
require('./config/env');

const http    = require('http');
const app     = require('./app');
const logger  = require('./shared/utils/logger');
const { connectDatabase } = require('./config/database');
const { seeder } = require('./config/seeder');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // ── Connect to MongoDB ──────────────────────────────────
  await connectDatabase();

  // ── Run database seeders ────────────────────────────────
  // Seeds super admin and default plans on first startup.
  await seeder();

  // ── Start BullMQ Workers ────────────────────────────────────────
  // Workers must start after DB + Redis are healthy
  require('./jobs/email.worker');
  logger.info('Email worker started');

  // Phase 4 workers
  require('./jobs/invoice.worker');
  logger.info('Invoice worker started');

  require('./jobs/pdf.worker');
  logger.info('PDF worker started');

  // Phase 4 — Billing Renewal Cron (daily at 01:00 UTC)
  const { initBillingRenewCron } = require('./cron/billingRenew.cron');
  initBillingRenewCron();

  // Phase 5 workers
  require('./jobs/payment.worker');
  logger.info('Payment worker started');

  // Phase 6 workers
  require('./jobs/dunning.worker');
  logger.info('Dunning worker started');

  // Phase 6 — Dunning Check Cron (daily at 08:00 UTC)
  const { initDunningCheckCron } = require('./cron/dunningCheck.cron');
  initDunningCheckCron();

  // ── Create HTTP server ──────────────────────────────
  // MUST be created before Socket.IO initialization (Phase 7)
  const server = http.createServer(app);

  // Phase 7 — Socket.IO (MUST be initialized before notification worker)
  const { initializeSocketIO } = require('./sockets');
  const io = initializeSocketIO(server);
  app.set('io', io);  // Make io accessible in workers via app.get('io')
  logger.info('Socket.IO initialized');

  // Phase 7 workers
  require('./jobs/notification.worker');
  logger.info('Notification worker started');

  // Phase 8 workers
  require('./jobs/ai.worker');
  logger.info('AI worker started');

  // Phase 8 — Churn Analysis Cron (daily at 03:00 UTC)
  const { initChurnAnalysisCron } = require('./cron/churnAnalysis.cron');
  initChurnAnalysisCron();

  // ── Start listening ───────────────────────────────
  server.listen(PORT, () => {
    logger.info(`TenantFlow server running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Socket.IO:    ws://localhost:${PORT}/notifications`);

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`Swagger UI:   http://localhost:${PORT}/api/docs`);
    }
  });

  // ── Graceful Shutdown ────────────────────────────────────
  // Allow in-flight requests to complete before shutting down.
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received — starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed — no more new connections accepted');

      try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        const redisClient = require('./config/redis');
        await redisClient.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error({ err: err.message }, 'Error during graceful shutdown');
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 30 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  // ── Unhandled Rejections / Exceptions ───────────────────
  // Log and exit — let the process manager (Docker / PM2) restart.
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason: String(reason), promise }, 'Unhandled Promise Rejection');
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message, stack: err.stack }, 'Uncaught Exception — shutting down');
    gracefulShutdown('uncaughtException');
  });

  return server;
};

startServer();
