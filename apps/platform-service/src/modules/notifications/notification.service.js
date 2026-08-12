'use strict';

/**
 * Notification Service
 *
 * REST API operations for the notification bell.
 * Real-time delivery is handled by notification.worker.js + Socket.IO.
 * On reconnect, the frontend fetches this API to get missed notifications.
 *
 * REF: docs/SRS.md §9 — Notifications Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.4
 */

const Notification        = require('../../models/Notification.model');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');

// ── listNotifications() ───────────────────────────────────────
/**
 * Get paginated notifications for the current user.
 *
 * @param {string}  userId
 * @param {Object}  options - { page, limit, isRead }
 * @returns {Promise<{ notifications, pagination }>}
 */
const listNotifications = async (userId, options = {}) => {
  const { page, limit, skip } = parsePagination(options);
  const filter = { userId };

  // Optional isRead filter
  if (options.isRead !== undefined && options.isRead !== null) {
    filter.isRead = options.isRead === 'true' || options.isRead === true;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })  // Newest first
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return { notifications, pagination: paginationMeta(total, page, limit) };
};

// ── getUnreadCount() ──────────────────────────────────────────
/**
 * Get the unread notification count for the notification badge.
 * Not cached — must be accurate.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};

// ── markAsRead() ──────────────────────────────────────────────
/**
 * Mark a single notification as read.
 * Only marks if owned by the requesting user (security scope).
 *
 * @param {string} notificationId
 * @param {string} userId         - Must own this notification
 * @returns {Promise<Notification|null>}
 */
const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },  // Scope to user
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  return notification;
};

// ── markAllRead() ─────────────────────────────────────────────
/**
 * Mark all notifications for a user as read.
 * @param {string} userId
 * @returns {Promise<number>} - Number of notifications updated
 */
const markAllRead = async (userId) => {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return result.modifiedCount;
};

// ── deleteNotification() ──────────────────────────────────────
/**
 * Delete a single notification.
 * Only deletes if owned by the requesting user.
 *
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const deleteNotification = async (notificationId, userId) => {
  const result = await Notification.deleteOne({ _id: notificationId, userId });
  return result.deletedCount === 1;
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  deleteNotification,
};
