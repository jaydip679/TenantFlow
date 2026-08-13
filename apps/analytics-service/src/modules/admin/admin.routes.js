'use strict';

const express = require('express');
const adminController = require('./admin.controller');

const router = express.Router();

// Only migrated read-only Admin routes
// Authentication is handled by the API Gateway (Monolith) and verified via proxyAuth

router.get('/tenants', adminController.listTenants);
router.get('/invoices', adminController.listAllInvoices);

// Explicitly deferred routes returns 501 Not Implemented if somehow proxied
const deferredHandler = (req, res) => res.status(501).json({ success: false, message: 'This Admin route is not migrated to Analytics yet.' });

router.get('/metrics', deferredHandler);
router.get('/tenants/:tenantId', deferredHandler);
router.get('/queues', deferredHandler);
router.get('/metrics/mrr-movements', deferredHandler);
router.get('/metrics/cash-flow', deferredHandler);

module.exports = router;
