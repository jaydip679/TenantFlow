'use strict';

const mongoose = require('mongoose');
const logger = require('../shared/utils/logger');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/tenantflow_platform';
    
    await mongoose.connect(mongoUri);
    
    logger.info('MongoDB connected for Platform Service');
  } catch (err) {
    logger.fatal({ err: err.message }, 'MongoDB connection error in Platform Service');
    process.exit(1);
  }
};

mongoose.connection.on('error', (err) => {
  logger.error({ err: err.message }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected');
});

module.exports = connectDB;
