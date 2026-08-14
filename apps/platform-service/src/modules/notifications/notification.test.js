'use strict';

const request = require('supertest');
const express = require('express');

// We test the router in isolation or via app.js
const app = require('../../app');

// Mock notification service
jest.mock('./notification.service', () => ({
  listNotifications: jest.fn().mockResolvedValue({
    notifications: [{ id: 'notif-1' }],
    pagination: { page: 1, limit: 20, total: 1 }
  }),
  getUnreadCount: jest.fn().mockResolvedValue(5),
  markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1', isRead: true }),
  markAllRead: jest.fn().mockResolvedValue(3),
  deleteNotification: jest.fn().mockResolvedValue(true),
}));

const notificationService = require('./notification.service');

describe('Notification Routes (Platform)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication & proxyAuth middleware', () => {
    it('should reject requests without x-user-id header', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Missing proxy auth headers');
    });

    it('should accept requests with x-user-id header', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('x-user-id', 'user-123')
        .set('x-tenant-id', 'tenant-456')
        .set('x-user-role', 'tenant_admin');
        
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toHaveLength(1);
    });
  });

  describe('Notification Endpoints', () => {
    it('GET /api/v1/notifications/unread-count', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('x-user-id', 'user-123');
      
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(5);
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith('user-123');
    });

    it('PATCH /api/v1/notifications/read-all', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/read-all') // Note: route is defined as post('/read-all')
        .set('x-user-id', 'user-123');
      
      expect(res.status).toBe(200);
      expect(res.body.data.updatedCount).toBe(3);
      expect(notificationService.markAllRead).toHaveBeenCalledWith('user-123');
    });

    it('PATCH /api/v1/notifications/:notificationId/read', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/64101e82845a722000000001/read') // 24-char hex
        .set('x-user-id', 'user-123');
      
      expect(res.status).toBe(200);
      expect(res.body.data.notification.isRead).toBe(true);
      expect(notificationService.markAsRead).toHaveBeenCalledWith('64101e82845a722000000001', 'user-123');
    });

    it('DELETE /api/v1/notifications/:notificationId', async () => {
      const res = await request(app)
        .delete('/api/v1/notifications/64101e82845a722000000001')
        .set('x-user-id', 'user-123');
      
      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Notification deleted.');
      expect(notificationService.deleteNotification).toHaveBeenCalledWith('64101e82845a722000000001', 'user-123');
    });
  });
});
