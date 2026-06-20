'use strict';

/**
 * Admin Namespace Handler
 *
 * Namespace: /admin
 *
 * Security: Non-super_admin connections are immediately disconnected.
 * Room: admin:global — All super_admins join this room.
 *
 * Emitter helper (called from dunning.service.js, etc.):
 *   emitToAdmins(io, event, data)
 *
 * REF: docs/SYSTEM_DESIGN.md §8.1, §8.3, §8.4
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.2
 */

const logger = require('../shared/utils/logger');

/**
 * Register the /admin namespace on the io instance.
 * @param {import('socket.io').Server} io
 */
const registerAdminNamespace = (io) => {
  const nsp = io.of('/admin');

  nsp.on('connection', (socket) => {
    // Guard: immediately disconnect non-super_admin connections
    if (socket.user?.role !== 'super_admin') {
      logger.warn(
        { userId: socket.user?.id, role: socket.user?.role, socketId: socket.id },
        'Non-super_admin attempted /admin namespace connection — disconnecting'
      );
      socket.disconnect(true);
      return;
    }

    socket.join('admin:global');
    logger.info({ userId: socket.user.id, socketId: socket.id }, 'Super admin connected to /admin namespace');

    socket.on('disconnect', (reason) => {
      logger.info({ userId: socket.user.id, socketId: socket.id, reason }, 'Admin socket disconnected');
    });
  });
};

/**
 * Emit an event to all connected super admins.
 * @param {import('socket.io').Server} io
 * @param {string} event
 * @param {Object} data
 */
const emitToAdmins = (io, event, data) => {
  io.of('/admin').to('admin:global').emit(event, data);
};

module.exports = { registerAdminNamespace, emitToAdmins };
