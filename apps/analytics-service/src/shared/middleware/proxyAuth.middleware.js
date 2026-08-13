'use strict';

/**
 * proxyAuth.middleware.js
 * 
 * Middleware for services running behind the API Gateway (Monolith).
 * Instead of verifying JWTs directly, it trusts the x-user-* headers
 * injected by the gateway's http-proxy-middleware.
 */
const proxyAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const tenantId = req.headers['x-tenant-id'];
  const role = req.headers['x-user-role'];

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Missing proxy auth headers' });
  }

  req.user = {
    id: userId,
    tenantId: tenantId || null,
    role: role || 'user',
  };

  next();
};

module.exports = { proxyAuth };
