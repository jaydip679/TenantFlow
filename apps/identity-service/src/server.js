'use strict';

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/mongoose');
const redisClient = require('./config/redis');
const logger = require('./shared/utils/logger');
const { startPublisher, stopPublisher } = require('./jobs/outbox.publisher');
const { startTenantConsumer, stopTenantConsumer } = require('./modules/tenants/consumers/tenant.consumer');

const PORT = process.env.IDENTITY_PORT || 3003;
const server = http.createServer(app);

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      logger.info(`Identity Service running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
    
    // Start background jobs
    startPublisher();
    await startTenantConsumer();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Identity Service');
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed.');
    stopPublisher();
    await stopTenantConsumer();
    try {
      await disconnectDB();
      redisClient.disconnect();
      logger.info('Redis connection closed.');
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Force shutting down due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
