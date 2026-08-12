'use strict';

require('dotenv').config();
const http = require('http');
const app = require('./app');
const logger = require('./shared/utils/logger');
const redisClient = require('./config/redis');

const PORT = process.env.PLATFORM_PORT || 3001;

// Initialize workers
const { emailWorker } = require('./jobs/email.worker');
const { pdfWorker } = require('./jobs/pdf.worker');
const { notificationWorker } = require('./jobs/notification.worker');

const server = http.createServer(app);

const connectDB = require('./config/db');

const startServer = async () => {
  try {
    await connectDB();
    
    server.listen(PORT, () => {
      logger.info({ port: PORT }, 'Platform Service started');
    });
  } catch (err) {
    logger.fatal({ err: err.message }, 'Platform Service failed to start');
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  logger.info({ signal }, 'Graceful shutdown initiated');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await emailWorker.close();
      logger.info('Email worker closed');

      await pdfWorker.close();
      logger.info('PDF worker closed');

      await notificationWorker.close();
      logger.info('Notification worker closed');

      await redisClient.quit();
      logger.info('Redis connection closed');

      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');

      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Force shutdown if graceful takes too long
  setTimeout(() => {
    logger.fatal('Force closing Platform Service');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
