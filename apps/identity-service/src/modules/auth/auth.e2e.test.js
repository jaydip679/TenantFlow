'use strict';

/**
 * E2E Test: Full Authentication Flow
 *
 * Uses Supertest to fire real HTTP requests against the Express app.
 * MongoDB and Redis must be running (provided by CI service containers
 * or a local docker-compose up).
 *
 * Covers:
 *   1. Register → OTP verify → login → access protected route → logout → reject
 *   2. Refresh token rotation (3 consecutive rotations)
 *   3. Refresh token reuse detection (family invalidation)
 *   4. Password reset (full OTP flow)
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §14.1 T11.5
 */

const request   = require('supertest');
const mongoose  = require('mongoose');
const app       = require('../../app');
const redis     = require('../../config/redis');

jest.setTimeout(30000);

// ── Helpers ───────────────────────────────────────────────────────────────────

const rand = () => Math.random().toString(36).slice(2, 8);

function makeUser() {
  return {
    firstName: 'Test',
    lastName:  'User',
    email:     `e2e_${rand()}@test.tenantflow.dev`,
    password:  'SecurePass@123',
    companyName: `E2E Corp ${rand()}`,
  };
}

/** Extract OTP from Redis — avoids needing a real email service in CI */
async function getOtpFromRedis(email, purpose) {
  // OTP is stored as:  otp:{purpose}:{email}
  const key   = `otp:${purpose}:${email.toLowerCase()}`;
  const value = await redis.get(key);
  if (!value) throw new Error(`No OTP found in Redis for key "${key}"`);
  const parsed = JSON.parse(value);
  return parsed.code ?? parsed; // handle both { code, attempts } and raw string
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('E2E — Auth Flow', () => {
  let server;

  beforeAll(async () => {
    // Ensure DB is connected (app.js connects lazily in some configurations)
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    server = app.listen(0); // random port
  });

  afterAll(async () => {
    server.close();
    // Clean up test data to keep the DB tidy between runs
    await mongoose.connection.collection('users').deleteMany({
      email: { $regex: /e2e_.*@test\.tenantflow\.dev/ },
    });
    await mongoose.connection.collection('tenants').deleteMany({
      name: { $regex: /^E2E Corp / },
    });
    await mongoose.connection.collection('refreshtokens').deleteMany({});
  });

  // ── Test 1: Full register → verify → login → protect → logout flow ──────
  describe('Test 1: Register → Verify → Login → Protected → Logout', () => {
    const user = makeUser();
    let accessToken;
    let refreshToken;
    let cookieHeader;

    it('1a. POST /auth/register — 201 with message', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send(user)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/otp|verify|sent/i);
    });

    it('1b. POST /auth/verify-email — 200 with token pair', async () => {
      const otp = await getOtpFromRedis(user.email, 'email_verify');

      const res = await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ email: user.email, otp })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      accessToken  = res.body.data.accessToken;
      cookieHeader = res.headers['set-cookie'];
    });

    it('1c. POST /auth/login — 200 with new token pair', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      accessToken  = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
      cookieHeader = res.headers['set-cookie'];
    });

    it('1d. GET /auth/me — 200 with user profile (protected route)', async () => {
      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      
      if (res.status !== 200) console.error('GET ME FAILED. Token:', accessToken, 'Body:', res.body);
      expect(res.status).toBe(200);

      expect(res.body.data.user.email).toBe(user.email.toLowerCase());
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.user).not.toHaveProperty('inviteToken');
    });

    it('1e. POST /auth/logout — 200, blacklists token', async () => {
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);
      
      if (res.status !== 200) console.error('LOGOUT FAILED:', res.body);
      expect(res.status).toBe(200);
    });

    it('1f. GET /auth/me — 401 after logout (token blacklisted)', async () => {
      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ── Test 2: Refresh token rotation ──────────────────────────────────────
  describe('Test 2: Refresh token rotation — 3 consecutive rotations', () => {
    const user = makeUser();
    let cookieHeader;

    beforeAll(async () => {
      // Register + verify + login to get initial tokens
      const regRes = await request(server).post('/api/v1/auth/register').send(user);
      if (regRes.status !== 201) console.error('TEST 2 REGISTER FAILED:', regRes.body);
      const otp = await getOtpFromRedis(user.email, 'email_verify');
      await request(server).post('/api/v1/auth/verify-email').send({ email: user.email, otp });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password });
      cookieHeader = loginRes.headers['set-cookie'];
    });

    it('2a–2c. Rotate refresh token 3 times, each produces a new valid token', async () => {
      for (let i = 0; i < 3; i++) {
        const rotateRes = await request(server)
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookieHeader)
          .expect(200);

        expect(rotateRes.body.data.accessToken).toBeDefined();
        cookieHeader = rotateRes.headers['set-cookie'];
      }
    });
  });

  // ── Test 3: Refresh token reuse detection ───────────────────────────────
  describe('Test 3: Refresh token reuse detection — family invalidation', () => {
    const user = makeUser();
    let initialCookieHeader;
    let rotatedCookieHeader;

    beforeAll(async () => {
      const regRes = await request(server).post('/api/v1/auth/register').send(user);
      if (regRes.status !== 201) console.error('TEST REGISTER FAILED:', regRes.body);
      const otp = await getOtpFromRedis(user.email, 'email_verify');
      await request(server).post('/api/v1/auth/verify-email').send({ email: user.email, otp });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password });
      initialCookieHeader = loginRes.headers['set-cookie'];

      // Perform one rotation
      const rotateRes = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialCookieHeader);
      rotatedCookieHeader = rotateRes.headers['set-cookie'];
    });

    it('3a. Reuse the already-consumed initial token — 403 + family invalidated', async () => {
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialCookieHeader)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('3b. The rotated token is also now invalid (family was wiped)', async () => {
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookieHeader)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ── Test 4: Password reset flow ─────────────────────────────────────────
  describe('Test 4: Password reset — full OTP flow', () => {
    const user     = makeUser();
    const newPass  = 'NewSecurePass@456';

    beforeAll(async () => {
      const regRes = await request(server).post('/api/v1/auth/register').send(user);
      if (regRes.status !== 201) console.error('TEST REGISTER FAILED:', regRes.body);
      const otp = await getOtpFromRedis(user.email, 'email_verify');
      await request(server).post('/api/v1/auth/verify-email').send({ email: user.email, otp });
    });

    it('4a. POST /auth/forgot-password — always 200 (timing-safe)', async () => {
      await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);
    });

    it('4b. POST /auth/forgot-password with non-existent email — also 200', async () => {
      await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@nowhere.dev' })
        .expect(200);
    });

    it('4c. POST /auth/reset-password with valid OTP — 200, password changed', async () => {
      const otp = await getOtpFromRedis(user.email, 'password_reset');

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ email: user.email, otp, newPassword: newPass })
        .expect(200);
    });

    it('4d. Login with old password — 401', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('4e. Login with new password — 200', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: newPass })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
    });
  });
});
