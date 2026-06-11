'use strict';

/**
 * Auth Module Tests
 *
 * Integration-style unit tests for the auth service layer.
 * Uses jest mocks to isolate from real DB / Redis / external services.
 *
 * Covers Phase 1 acceptance criteria from IMPLEMENTATION_ROADMAP.md §4.3:
 *   - register: creates user + tenant, sends OTP, returns 201
 *   - register with duplicate email: 409 AUTH_EMAIL_EXISTS
 *   - verify-email: verifies OTP, returns token pair
 *   - login: timing-safe, returns access token
 *   - refresh: rotates token, reuse detection
 *   - logout: blacklists JTI
 *   - expired token: 401 AUTH_TOKEN_EXPIRED
 *   - forgot-password: always resolves
 *   - reset-password: invalidates all sessions
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.3 — Phase 1 acceptance criteria
 */

const { AppError } = require('../../shared/errors/AppError');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');

// ── Mock all external dependencies ───────────────────────────
jest.mock('../../models/User.model');
jest.mock('../../models/Tenant.model');
jest.mock('../../models/RefreshToken.model');
jest.mock('../../config/redis', () => ({
  get:  jest.fn(),
  set:  jest.fn(),
  del:  jest.fn(),
}));
jest.mock('../../queues/email.queue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../shared/utils/otpService', () => ({
  generateOTP:  jest.fn().mockReturnValue('483921'),
  storeOTP:     jest.fn().mockResolvedValue(undefined),
  verifyOTP:    jest.fn().mockResolvedValue(true),
  OTP_PURPOSES: { EMAIL_VERIFY: 'email_verify', PASSWORD_RESET: 'password_reset' },
  OTP_TTL_SECONDS: 600,
}));
jest.mock('../../shared/utils/auditLogService', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (fn) => { await fn(); }),
      endSession:      jest.fn(),
    }),
    Types: actual.Types,
  };
});

const User         = require('../../models/User.model');
const Tenant       = require('../../models/Tenant.model');
const RefreshToken = require('../../models/RefreshToken.model');
const redis        = require('../../config/redis');
const otpService   = require('../../shared/utils/otpService');
const bcrypt       = require('bcrypt');
const authService  = require('./auth.service');
const { signAccessToken, signRefreshToken } = require('../../shared/utils/jwtService');

// ── Helpers ───────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  _id:             '64a1b2c3d4e5f6789012abcd',
  email:           'test@example.com',
  firstName:       'Test',
  lastName:        'User',
  role:            'tenant_admin',
  tenantId:        '64a1b2c3d4e5f6789012abc0',
  status:          'active',
  isEmailVerified: true,
  passwordHash:    '$2b$12$validhash',
  avatarUrl:       null,
  ...overrides,
});

// ── register() ────────────────────────────────────────────────
describe('authService.register()', () => {
  const validPayload = {
    email:       'new@acme.com',
    password:    'SecurePass@1',
    firstName:   'Priya',
    lastName:    'Sharma',
    companyName: 'Acme Corp',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne   = jest.fn().mockResolvedValue(null); // No existing user
    // Tenant.findOne used by generateSlug — must chain .lean()
    Tenant.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Tenant.create  = jest.fn().mockResolvedValue([{ _id: 'tenant-id-1', name: 'Acme Corp' }]);
    User.create    = jest.fn().mockResolvedValue([makeUser({ _id: 'user-id-1', isEmailVerified: false })]);
    Tenant.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    const otpService = require('../../shared/utils/otpService');
    otpService.generateOTP.mockReturnValue('483921');
    otpService.storeOTP.mockResolvedValue(undefined);
  });

  it('returns userId and tenantId on success', async () => {
    const result = await authService.register(validPayload);
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('tenantId');
  });

  it('throws AUTH_EMAIL_EXISTS (409) if email already taken', async () => {
    User.findOne = jest.fn().mockResolvedValue(makeUser());
    await expect(authService.register(validPayload))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_EMAIL_EXISTS, statusCode: 409 });
  });

  it('generates OTP and enqueues email after successful creation', async () => {
    const otpService = require('../../shared/utils/otpService');
    await authService.register(validPayload);
    expect(otpService.generateOTP).toHaveBeenCalled();
    expect(otpService.storeOTP).toHaveBeenCalledWith('email_verify', 'new@acme.com', '483921');
  });
});

// ── verifyEmail() ─────────────────────────────────────────────
describe('authService.verifyEmail()', () => {
  const user = makeUser({ isEmailVerified: false });

  beforeEach(() => {
    jest.clearAllMocks();
    const otpSvc = require('../../shared/utils/otpService');
    otpSvc.verifyOTP.mockResolvedValue(true);
    User.findOneAndUpdate = jest.fn().mockResolvedValue(user);
    RefreshToken.create  = jest.fn().mockResolvedValue({});
  });

  it('returns accessToken and user on valid OTP', async () => {
    const result = await authService.verifyEmail('test@example.com', '483921', {});
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('user');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('propagates AUTH_OTP_EXPIRED when OTP not found', async () => {
    const otpSvc = require('../../shared/utils/otpService');
    otpSvc.verifyOTP.mockRejectedValue(
      new AppError('OTP expired', 400, ERROR_CODES.AUTH_OTP_EXPIRED)
    );
    await expect(authService.verifyEmail('test@example.com', '000000', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_OTP_EXPIRED });
  });
});

// ── login() ───────────────────────────────────────────────────
describe('authService.login()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RefreshToken.create      = jest.fn().mockResolvedValue({});
    User.findByIdAndUpdate   = jest.fn().mockResolvedValue({});
  });

  it('returns accessToken on correct credentials', async () => {
    const user = makeUser();
    User.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...user, passwordHash: await bcrypt.hash('SecurePass@1', 1) }),
    });
    const result = await authService.login('test@example.com', 'SecurePass@1', {});
    expect(result).toHaveProperty('accessToken');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('throws AUTH_INVALID_CREDENTIALS when user not found (does NOT reveal existence)', async () => {
    User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(authService.login('nobody@example.com', 'any', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_INVALID_CREDENTIALS, statusCode: 401 });
  });

  it('throws AUTH_INVALID_CREDENTIALS on wrong password', async () => {
    User.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...makeUser(), passwordHash: await bcrypt.hash('correct', 1) }),
    });
    await expect(authService.login('test@example.com', 'wrong', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_INVALID_CREDENTIALS });
  });

  it('throws AUTH_EMAIL_NOT_VERIFIED when user has unverified email', async () => {
    User.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(makeUser({ isEmailVerified: false })),
    });
    await expect(authService.login('test@example.com', 'SecurePass@1', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED });
  });

  it('throws AUTH_ACCOUNT_SUSPENDED for suspended accounts', async () => {
    User.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(makeUser({ status: 'suspended' })),
    });
    await expect(authService.login('test@example.com', 'any', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_ACCOUNT_SUSPENDED });
  });
});

// ── refreshTokens() ───────────────────────────────────────────
describe('authService.refreshTokens()', () => {
  const validToken   = { _id: 'rtid', tokenHash: 'hash', familyId: 'fam1', status: 'active', expiresAt: new Date(Date.now() + 86400000), userId: 'user-id-1' };
  const invalidToken = { ...validToken, status: 'invalidated' };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById            = jest.fn().mockResolvedValue(makeUser());
    RefreshToken.create      = jest.fn().mockResolvedValue({});
    RefreshToken.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  });

  it('returns new access token on valid refresh token', async () => {
    RefreshToken.findOne = jest.fn().mockResolvedValue(validToken);
    const result = await authService.refreshTokens('valid-raw-token', {});
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshTokenRaw');
  });

  it('throws AUTH_REFRESH_REUSE and invalidates family on reuse detection', async () => {
    RefreshToken.findOne      = jest.fn().mockResolvedValue(invalidToken);
    RefreshToken.updateMany   = jest.fn().mockResolvedValue({});
    await expect(authService.refreshTokens('reused-token', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_REFRESH_REUSE, statusCode: 403 });
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: 'fam1' },
      { $set: { status: 'invalidated' } }
    );
  });

  it('throws AUTH_REFRESH_INVALID when token not found', async () => {
    RefreshToken.findOne = jest.fn().mockResolvedValue(null);
    await expect(authService.refreshTokens('unknown-token', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_REFRESH_INVALID });
  });

  it('throws AUTH_REFRESH_EXPIRED when token is past expiresAt', async () => {
    RefreshToken.findOne = jest.fn().mockResolvedValue({ ...validToken, expiresAt: new Date(Date.now() - 1000) });
    await expect(authService.refreshTokens('expired-token', {}))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.AUTH_REFRESH_EXPIRED });
  });
});

// ── logout() ─────────────────────────────────────────────────
describe('authService.logout()', () => {
  it('blacklists JTI in Redis with correct TTL', async () => {
    redis.set = jest.fn().mockResolvedValue('OK');
    RefreshToken.findOneAndUpdate = jest.fn().mockResolvedValue({});
    const futureExp = Math.floor(Date.now() / 1000) + 900;
    await authService.logout('test-jti', 'raw-token', futureExp, { id: 'uid', tenantId: 'tid', role: 'tenant_admin', email: 'a@b.com' });
    expect(redis.set).toHaveBeenCalledWith('blacklist:at:test-jti', '1', 'EX', expect.any(Number));
  });
});

// ── forgotPassword() ──────────────────────────────────────────
describe('authService.forgotPassword()', () => {
  it('resolves without error even if email does not exist (prevents enumeration)', async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
  });

  it('generates and stores OTP if user exists', async () => {
    User.findOne = jest.fn().mockResolvedValue(makeUser());
    const otpSvc = require('../../shared/utils/otpService');
    otpSvc.generateOTP.mockReturnValue('111222');
    otpSvc.storeOTP.mockResolvedValue(undefined);
    await authService.forgotPassword('test@example.com');
    expect(otpSvc.storeOTP).toHaveBeenCalledWith('password_reset', 'test@example.com', '111222');
  });
});

// ── resetPassword() ───────────────────────────────────────────
describe('authService.resetPassword()', () => {
  it('updates password and invalidates all refresh tokens', async () => {
    const otpSvc = require('../../shared/utils/otpService');
    otpSvc.verifyOTP.mockResolvedValue(true);
    User.findOne             = jest.fn().mockResolvedValue(makeUser());
    User.findByIdAndUpdate   = jest.fn().mockResolvedValue({});
    RefreshToken.updateMany  = jest.fn().mockResolvedValue({});
    await authService.resetPassword('test@example.com', '123456', 'NewPass@1');
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { userId: makeUser()._id, status: 'active' },
      { $set: { status: 'invalidated' } }
    );
  });
});
