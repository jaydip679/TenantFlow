'use strict';

/**
 * MongoDB Connection Manager
 *
 * Establishes Mongoose connection with retry logic and graceful error handling.
 * Connection options are tuned for production reliability.
 * Process exits (code 1) if initial connection fails — never run with no DB.
 *
 * REF: docs/DATABASE_DESIGN.md §11 — MongoDB Configuration
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.4
 */

const mongoose = require('mongoose');
const logger   = require('../shared/utils/logger');

const MONGODB_URI = process.env.MONGODB_URI;

const CONNECTION_OPTIONS = {
  minPoolSize:               2,
  maxPoolSize:               10,
  serverSelectionTimeoutMS:  5000,
  heartbeatFrequencyMS:      10000,
  retryWrites:               true,
  w:                         'majority',
};

/**
 * Connect to MongoDB.
 * Called once during server bootstrap (server.js).
 * @returns {Promise<void>}
 */
const connectDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, CONNECTION_OPTIONS);

    const { host, name } = mongoose.connection;
    logger.info(`MongoDB connected: ${host}/${name}`);

    // Sync all defined indexes to the database.
    // This ensures indexes in model schemas are reflected in MongoDB.
    await mongoose.connection.syncIndexes();
    logger.info('MongoDB indexes synced');
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB initial connection failed — shutting down');
    process.exit(1);
  }

  // Mongoose will auto-reconnect on disconnect — log the event but don't exit.
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err: err.message }, 'MongoDB connection error');
  });
};

module.exports = { connectDatabase };
