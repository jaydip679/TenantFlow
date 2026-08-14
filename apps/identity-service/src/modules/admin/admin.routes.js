'use strict';

const express = require('express');
const adminController = require('./admin.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { authorize } = require('../../shared/middleware/authorize.middleware');

const router = express.Router();

const adminAuth = [authenticate, authorize('super_admin')];

router.patch('/tenants/:tenantId/status', ...adminAuth, adminController.forceStatusChange);

module.exports = router;
