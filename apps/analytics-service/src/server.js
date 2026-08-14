'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./app');
const logger = require('./shared/utils/logger');
const mongoose = require('mongoose');

const PORT = process.env.ANALYTICS_PORT || 3002;

const connectDatabase = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/tenantflow_analytics';
    await mongoose.connect(uri);
    logger.info(`Connected to MongoDB Analytics DB: ${mongoose.connection.name}`);
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to connect to Analytics Database');
    process.exit(1);
  }
};

const startServer = async () => {
  // Connect to MongoDB
  await connectDatabase();

  // Start the Analytics Event Consumer
  const { startAnalyticsConsumer } = require('./consumers/analytics.consumer');
  await startAnalyticsConsumer();
  logger.info('Analytics Consumer started');

  // Start AI and Forecast workers
  require('./consumers/ai.worker');
  require('./consumers/forecast.worker');
  logger.info('AI and Forecast workers started');

  // Start HTTP server
  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info(`Analytics Service running on port ${PORT}`);
  });

  // Graceful shutdown logic
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    
    server.close(() => {
      logger.info('HTTP server closed.');
    });

    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
