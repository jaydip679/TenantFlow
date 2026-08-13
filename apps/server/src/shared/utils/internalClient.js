'use strict';

const axios = require('axios');

/**
 * internalClient
 * 
 * Pre-configured Axios instance for service-to-service communication.
 * Automatically injects the X-Internal-Secret header.
 */
const internalClient = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

internalClient.interceptors.request.use((config) => {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret) {
    config.headers['X-Internal-Secret'] = secret;
  }
  return config;
});

module.exports = internalClient;
