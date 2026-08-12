'use strict';

const express = require('express');
const app = express();

app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'platform-service' });
});

// Notifications API (proxied from Monolith)
const notificationRoutes = require('./modules/notifications/notification.routes');
app.use('/api/v1/notifications', notificationRoutes);

module.exports = app;
