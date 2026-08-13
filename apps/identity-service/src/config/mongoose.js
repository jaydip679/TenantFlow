'use strict';

const mongoose = require('mongoose');
const logger = require('../shared/utils/logger');


/**
 * Configure MongoDB
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/tenantflow_identity';
  try {
    await mongoose.connect(uri);
    logger.info(`MongoDB connected to ${uri}`);
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection error');
    throw err;
  }
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('MongoDB disconnected through app termination');
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
