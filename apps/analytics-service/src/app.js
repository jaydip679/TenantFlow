'use strict';

const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./shared/middleware/errorHandler');
const proxyAuth = require('./shared/middleware/proxyAuth.middleware');
const adminRoutes = require('./modules/admin/admin.routes');

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

// Global Error Handler
app.use(errorHandler);

module.exports = app;
