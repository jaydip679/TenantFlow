'use strict';

const request = require('supertest');
const app = require('./app');

jest.mock('./shared/middleware/rateLimiter.middleware', () => ({
  globalRateLimiter: (req, res, next) => next(),
}));

// Mock Redis to avoid connection issues during tests
jest.mock('./config/redis', () => ({
  status: 'ready',
  get: jest.fn().mockResolvedValue(null),
}));

// Mock Mongoose to avoid connection issues
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connection: { readyState: 1 },
  };
});

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => (req, res, next) => {
    // Dummy proxy middleware that just sends a 200 with proxied true
    res.status(200).json({ proxied: true, headers: req.headers });
  })
}));

describe('API Gateway (app.js)', () => {
  describe('Proxy Authentication', () => {
    it('should reject unauthenticated requests to /api/v1/admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/health-scores')
        .set('x-user-id', 'attacker')
        .set('x-user-role', 'super_admin');
      
      // Expected 401 because authenticate is now attached
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: { message: 'Authentication token is required.' }
      });
    });

    it('should reject unauthenticated requests to /api/v1/ai', async () => {
      const res = await request(app)
        .get('/api/v1/ai/forecast')
        .set('x-user-id', 'attacker');
      
      expect(res.status).toBe(401);
    });
  });
});
