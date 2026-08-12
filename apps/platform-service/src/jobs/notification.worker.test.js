'use strict';

const { notificationWorker, processNotificationJob } = require('./notification.worker');
const Notification = require('../models/Notification.model');
const redisClient = require('../config/redis');

jest.mock('../models/Notification.model', () => ({
  create: jest.fn().mockResolvedValue({
    _id: 'notif-123',
    userId: 'user-1',
    type: 'invoice_generated',
    title: 'New Invoice',
    body: 'Invoice 001 is ready',
  }),
}));

jest.mock('../config/redis', () => ({
  xadd: jest.fn().mockResolvedValue('123-0'),
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    add: jest.fn(),
  })),
}));

describe('Notification Worker', () => {
  it('creates notification and emits notification.created event', async () => {
    const job = {
      id: 'job-1',
      data: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        type: 'invoice_generated',
        title: 'New Invoice',
        body: 'Invoice 001 is ready',
      }
    };

    await processNotificationJob(job);

    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      tenantId: 'tenant-1',
      type: 'invoice_generated',
    }));

    expect(redisClient.xadd).toHaveBeenCalled();
    const xaddCalls = redisClient.xadd.mock.calls[0];
    expect(xaddCalls[0]).toBe('tenantflow:events');
    expect(xaddCalls[5]).toBe('notification.created');
    const payload = JSON.parse(xaddCalls[xaddCalls.indexOf('payload') + 1]);
    expect(payload.notificationId).toBe('notif-123');
    expect(payload.userId).toBe('user-1');
  });
});
