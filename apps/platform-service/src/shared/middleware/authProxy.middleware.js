'use strict';

/**
 * Middleware to extract authenticated user context passed from the Monolith API Gateway via headers.
 */
const proxyAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const tenantId = req.headers['x-tenant-id'];
  const role = req.headers['x-user-role'];

  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Missing proxy auth headers' });
  }

  req.user = {
    id: userId,
    tenantId: tenantId || null,
    role: role || 'user'
  };

  next();
};

module.exports = { proxyAuth };
