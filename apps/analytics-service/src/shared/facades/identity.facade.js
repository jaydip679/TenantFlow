'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL || 'http://localhost:3003';
const headers = { 'x-internal-secret': process.env.INTERNAL_API_SECRET };

const getTenantUsers = async (tenantId) => {
  try {
    const res = await axios.get(`${IDENTITY_URL}/api/internal/identity/tenants/${tenantId}/users`, { headers });
    return res.data;
  } catch (error) {
    logger.error({ err: error.message, tenantId }, 'Failed to fetch tenant users from Identity Service');
    return [];
  }
};

module.exports = {
  getTenantUsers
};
