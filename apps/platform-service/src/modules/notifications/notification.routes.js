'use strict';

/**
 * Notification Routes
 *
 * Base path: /api/v1/notifications
 *
 * All endpoints require authentication.
 * Results are scoped to req.user.id — users can only see their own notifications.
 *
 * REF: docs/SRS.md §9 — Notifications Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §10.1 T7.4
 */

const express                = require('express');
const notificationController = require('./notification.controller');
const { proxyAuth }          = require('../../shared/middleware/authProxy.middleware');
const Joi                    = require('joi');

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate({
    body: req.body,
    query: req.query,
    params: req.params,
  }, { abortEarly: false, allowUnknown: true });
  
  if (error) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: error.details.map((d) => d.message),
    });
  }
  next();
};

const router = express.Router();

const listSchema = Joi.object({
  params: Joi.object(),
  body:   Joi.object(),
  query:  Joi.object({
    page:   Joi.number().integer().min(1).default(1),
    limit:  Joi.number().integer().min(1).max(100).default(20),
    isRead: Joi.boolean().optional(),
  }),
});

const notificationIdSchema = Joi.object({
  params: Joi.object({ notificationId: Joi.string().length(24).hex().required() }),
  body:   Joi.object(),
  query:  Joi.object(),
});

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notifications (paginated, optional isRead filter)
 *     tags: [notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isRead
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         description: Notifications list
 */
router.get(
  '/',
  proxyAuth,
  validate(listSchema),
  notificationController.listNotifications
);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notification count for badge
 *     tags: [notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
router.get(
  '/unread-count',
  proxyAuth,
  notificationController.getUnreadCount
);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.post(
  '/read-all',
  proxyAuth,
  notificationController.markAllAsRead
);

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark single notification as read
 *     tags: [notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notification marked read
 *       404:
 *         description: Notification marked as read
 */
router.patch(
  '/:notificationId/read',
  proxyAuth,
  validate(notificationIdSchema),
  notificationController.markAsRead
);

/**
 * @swagger
 * /notifications/{notificationId}:
 *   delete:
 *     summary: Delete single notification
 *     tags: [notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Not found or not owned by user
 */
router.delete('/:notificationId', authenticate, validate(notificationIdSchema), notificationController.deleteNotification);

module.exports = router;
