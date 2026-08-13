'use strict';

const logger = require('../shared/utils/logger');
const internalClient = require('../shared/utils/internalClient');

// Identity Service URL base
const getBaseUrl = () => process.env.IDENTITY_SERVICE_URL || 'http://localhost:3003';

const seeder = async () => {
  try {
    await internalClient.post(`${getBaseUrl()}/api/internal/identity/seed`);
    logger.info('Monolith trigger: Identity Service seed successful');
  } catch (err) {
    logger.error({ err: err.message }, 'Monolith trigger: Identity Service seed failed');
  }
};

module.exports = { seeder };
