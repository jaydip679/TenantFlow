'use strict';

/**
 * Notification Controller
 * Thin HTTP layer — delegates to notification.service.
 * REF: docs/SRS.md §9 — Notifications Module
 */

const notificationService = require('./notification.service');
const { asyncHandler }    = require('../../shared/utils/asyncHandler');
const { AppError }        = require('../../shared/errors/AppError');
const { ERROR_CODES }     = require('../../shared/errors/errorCodes');

/**
 * GET / — List notifications (paginated + optional isRead filter)
 */
const listNotifications = asyncHandler(async (req, res) => {
  const { notifications, pagination } = await notificationService.listNotifications(
    req.user.id,
    { page: req.query.page, limit: req.query.limit, isRead: req.query.isRead }
  );
  res.status(200).json({ success: true, data: { notifications, pagination } });
});

/**
 * GET /unread-count — Get unread notification count for badge
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  res.status(200).json({ success: true, data: { count } });
});

/**
 * PATCH /:notificationId/read — Mark single notification as read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.params.notificationId, req.user.id);
  if (!notification) {
    throw new AppError('Notification not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  res.status(200).json({ success: true, data: { notification } });
});

/**
 * PATCH /read-all — Mark all notifications as read
 */
const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllRead(req.user.id);
  res.status(200).json({ success: true, data: { updatedCount: count } });
});

/**
 * DELETE /:notificationId — Delete single notification
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const deleted = await notificationService.deleteNotification(req.params.notificationId, req.user.id);
  if (!deleted) {
    throw new AppError('Notification not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  res.status(200).json({ success: true, data: { message: 'Notification deleted.' } });
});

module.exports = { listNotifications, getUnreadCount, markAsRead, markAllRead, deleteNotification };
