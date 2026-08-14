'use strict';

const express = require('express');
const cors = require('cors');
const { globalErrorHandler } = require('./shared/errors/globalErrorHandler');
const { proxyAuth } = require('./shared/middleware/proxyAuth.middleware');
const adminRoutes = require('./modules/admin/admin.routes');
const healthRoutes = require('./modules/health/health.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use(proxyAuth);

// Mount Admin Routes
app.use('/api/v1/admin', adminRoutes);

// Mount AI Routes
const aiRoutes = require('./modules/ai/ai.routes');
app.use('/api/v1/ai', aiRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'analytics-service' });
});

// Phase 3A: Endpoints will be migrated later.

// Mount Health Routes
app.use('/api/v1/health', healthRoutes);

// Global Error Handler
app.use(globalErrorHandler);

module.exports = app;
