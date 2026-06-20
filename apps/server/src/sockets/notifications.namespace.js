'use strict';

/**
 * Notifications Namespace Handler
 *
 * Namespace: /notifications
 *
 * Rooms:
 *   user:{userId}          — Every authenticated user joins this room
 *   tenant:{tenantId}      — tenant_admin and finance_member join this room
 *
 * Emitter helpers (called from notification.worker.js):
 *   emitToUser(io, userId, event, data)   — Send to a specific user
 *   emitToTenant(io, tenantId, event, data) — Broadcast to all tenant members
 *
 * REF: docs/SYSTEM_DESIGN.md §8.1, §8.3, §8.4
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.2
 */

const logger = require('../shared/utils/logger');

const TENANT_ROLES = ['tenant_admin', 'finance_member'];

/**
 * Register the /notifications namespace on the io instance.
 * @param {import('socket.io').Server} io
 */
const registerNotificationsNamespace = (io) => {
  const nsp = io.of('/notifications');

  nsp.on('connection', (socket) => {
    const { id: userId, tenantId, role } = socket.user;

    // Every user joins their personal room
    socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, 'Socket connected to /notifications');

    // Tenant members join the tenant room for broadcast events
    if (TENANT_ROLES.includes(role) && tenantId) {
      socket.join(`tenant:${tenantId}`);
    }

    socket.on('disconnect', (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, 'Socket disconnected from /notifications');
    });
  });
};

/**
 * Emit a notification event to a specific user's room.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} event
 * @param {Object} data
 */
const emitToUser = (io, userId, event, data) => {
  io.of('/notifications').to(`user:${userId}`).emit(event, data);
};

/**
 * Emit an event to all members of a tenant's room.
 * @param {import('socket.io').Server} io
 * @param {string} tenantId
 * @param {string} event
 * @param {Object} data
 */
const emitToTenant = (io, tenantId, event, data) => {
  io.of('/notifications').to(`tenant:${tenantId}`).emit(event, data);
};

module.exports = { registerNotificationsNamespace, emitToUser, emitToTenant };
