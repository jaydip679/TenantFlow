'use strict';

/**
 * Socket.IO Initialization
 *
 * Creates the io server, registers JWT authentication middleware,
 * registers namespace handlers, and returns the io instance.
 *
 * Usage in server.js:
 *   const { initializeSocketIO } = require('./sockets');
 *   const io = initializeSocketIO(httpServer);
 *   app.set('io', io);  // Make available in workers via req.app.get('io')
 *
 * JWT auth flow:
 *   1. Read socket.handshake.auth.token
 *   2. Verify with verifyAccessToken (throws on invalid/expired)
 *   3. Check Redis blacklist (blacklist:at:{jti})
 *   4. Attach socket.user = { id, tenantId, role, email }
 *   5. On failure: next(new Error('...')) rejects the handshake
 *
 * REF: docs/SYSTEM_DESIGN.md §8.2 — Connection Authentication
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.2
 */

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../shared/utils/jwtService');
const redisClient = require('../config/redis');
const logger      = require('../shared/utils/logger');
const { registerNotificationsNamespace } = require('./notifications.namespace');
const { registerAdminNamespace }         = require('./admin.namespace');

/**
 * Initialize Socket.IO server with authentication middleware and namespaces.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
const initializeSocketIO = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── JWT Authentication Middleware (applied globally to all namespaces) ─
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      logger.warn({ socketId: socket.id, err: err.message }, `Socket auth failed: ${message}`);
      return next(new Error(message));
    }

    // Check JWT blacklist (revoked tokens)
    try {
      const isBlacklisted = await redisClient.get(`blacklist:at:${payload.jti}`);
      if (isBlacklisted) {
        logger.warn({ socketId: socket.id, jti: payload.jti }, 'Socket: token has been revoked');
        return next(new Error('Token revoked'));
      }
    } catch (redisErr) {
      // If Redis is down, allow connection (fail-open for reliability)
      logger.warn({ err: redisErr.message }, 'Socket: Redis unavailable during auth — allowing connection');
    }

    // Attach user context to socket
    socket.user = {
      id:       payload.sub,
      tenantId: payload.tenantId || null,
      role:     payload.role,
      email:    payload.email || null,
    };

    next();
  });

  // ── Register Namespace Handlers ─────────────────────────────
  registerNotificationsNamespace(io);
  registerAdminNamespace(io);

  logger.info('Socket.IO initialized with /notifications and /admin namespaces');

  return io;
};

module.exports = { initializeSocketIO };
