'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const redisClient = require('./config/redis');
const logger = require('./shared/utils/logger');
const { globalErrorHandler } = require('./shared/errors/globalErrorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
  skip: (req) => req.url === '/health'
}));

// Health Check
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const redisState = redisClient.status;

  const isHealthy = dbState === 1 && redisState === 'ready';
  const status = isHealthy ? 'ok' : 'degraded';

  res.status(isHealthy ? 200 : 503).json({
    status,
    services: {
      db: dbState === 1 ? 'ok' : 'unavailable',
      redis: redisState === 'ready' ? 'ok' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/plans', require('./modules/plans/plan.routes'));
app.use('/api/v1/tenants', require('./modules/tenants/tenant.routes'));
app.use('/api/v1/admin', require('./modules/admin/admin.routes'));

// Internal API Routes
app.use('/api/internal/identity', require('./modules/internal/internal.routes'));

app.use(globalErrorHandler);

module.exports = app;
