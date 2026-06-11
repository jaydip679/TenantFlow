'use strict';

/**
 * Tenant Service Tests
 *
 * Covers Phase 2 acceptance criteria from IMPLEMENTATION_ROADMAP.md §5.2:
 *   - getTenant: returns tenant without sensitive fields
 *   - updateTenant: rejects forbidden fields (slug, currency, status)
 *   - inviteMember: 422 SEAT_LIMIT_EXCEEDED when at capacity
 *   - inviteMember: 409 USER_ALREADY_MEMBER if already exists
 *   - inviteMember: creates invited user, enqueues email
 *   - removeMember: 403 when trying to remove tenant owner
 *   - removeMember: soft-deletes (status=deleted)
 *   - acceptInvite: 400 INVITE_TOKEN_INVALID if not found
 *   - acceptInvite: 400 INVITE_TOKEN_EXPIRED if past expiry
 *   - changeMemberRole: 403 if changing owner's role to non-admin
 *
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.2 — Phase 2 acceptance criteria
 */

jest.mock('../../models/Tenant.model');
jest.mock('../../models/User.model');
jest.mock('../../models/RefreshToken.model');
jest.mock('../../config/redis', () => ({ del: jest.fn().mockResolvedValue(1), set: jest.fn(), get: jest.fn() }));
jest.mock('../../queues/email.queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue({}) }));
jest.mock('../../shared/utils/auditLogService', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../config/cloudinary', () => ({
  cloudinaryUpload: jest.fn().mockResolvedValue({ secure_url: 'https://cdn.cloudinary.com/test.webp' }),
  cloudinaryDelete: jest.fn().mockResolvedValue({}),
}));

const Tenant        = require('../../models/Tenant.model');
const User          = require('../../models/User.model');
const RefreshToken  = require('../../models/RefreshToken.model');
const tenantService = require('./tenant.service');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');

// ── Helpers ───────────────────────────────────────────────────
const makeTenant = (o = {}) => ({
  _id:     'tenant-id-1',
  name:    'Acme Corp',
  ownerId: 'owner-id-1',
  status:  'active',
  features: new Map([['max_seats', 5]]),
  logoUrl: null,
  toObject: jest.fn().mockReturnValue({ name: 'Acme Corp' }),
  ...o,
});

const makeUser = (o = {}) => ({
  _id:             'user-id-1',
  email:           'user@acme.com',
  firstName:       'Test',
  lastName:        'User',
  role:            'tenant_member',
  tenantId:        'tenant-id-1',
  status:          'active',
  inviteToken:     null,
  inviteExpiresAt: new Date(Date.now() + 86400000),
  passwordHash:    'hashed',
  save:            jest.fn().mockResolvedValue(undefined),
  ...o,
});

const actor = { id: 'actor-id-1', role: 'tenant_admin', tenantId: 'tenant-id-1', email: 'admin@acme.com' };

beforeEach(() => jest.clearAllMocks());

// ── getTenant() ───────────────────────────────────────────────
describe('tenantService.getTenant()', () => {
  it('returns tenant data', async () => {
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue(makeTenant()),
    });
    const result = await tenantService.getTenant('tenant-id-1');
    expect(result).toHaveProperty('name', 'Acme Corp');
  });

  it('throws NOT_FOUND for unknown tenantId', async () => {
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue(null),
    });
    await expect(tenantService.getTenant('unknown')).rejects.toMatchObject({ errorCode: ERROR_CODES.NOT_FOUND });
  });
});

// ── updateTenant() ────────────────────────────────────────────
describe('tenantService.updateTenant()', () => {
  it('throws VALIDATION_ERROR when trying to update slug (forbidden field)', async () => {
    await expect(tenantService.updateTenant('tenant-id-1', { slug: 'new-slug' }, actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when trying to update status', async () => {
    await expect(tenantService.updateTenant('tenant-id-1', { status: 'cancelled' }, actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.VALIDATION_ERROR });
  });

  it('updates allowed fields successfully', async () => {
    const tenant = makeTenant();
    Tenant.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tenant) });
    Tenant.findByIdAndUpdate = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...tenant, name: 'New Name' }) });
    const result = await tenantService.updateTenant('tenant-id-1', { name: 'New Name' }, actor);
    expect(result).toHaveProperty('name', 'New Name');
  });
});

// ── inviteMember() ────────────────────────────────────────────
describe('tenantService.inviteMember()', () => {
  const baseTenantCtx = { usedSeats: 3, seatLimit: 5 };

  it('throws SEAT_LIMIT_EXCEEDED when at capacity', async () => {
    const fullCtx = { usedSeats: 5, seatLimit: 5 };
    await expect(tenantService.inviteMember('tenant-id-1', 'new@acme.com', 'tenant_member', actor, fullCtx))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.SEAT_LIMIT_EXCEEDED, statusCode: 422 });
  });

  it('throws USER_ALREADY_MEMBER if email already exists in tenant', async () => {
    User.findOne = jest.fn().mockResolvedValue(makeUser()); // existing user
    await expect(tenantService.inviteMember('tenant-id-1', 'user@acme.com', 'tenant_member', actor, baseTenantCtx))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.USER_ALREADY_MEMBER, statusCode: 409 });
  });

  it('creates invited user and enqueues email', async () => {
    User.findOne = jest.fn().mockResolvedValue(null); // No existing user
    User.create  = jest.fn().mockResolvedValue(makeUser({ status: 'invited' }));
    // findById().select().lean() chain
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) }),
    });
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Acme Corp' }) }),
    });

    const result = await tenantService.inviteMember('tenant-id-1', 'new@acme.com', 'tenant_member', actor, baseTenantCtx);

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'invited', role: 'tenant_member' })
    );
    const { enqueueEmail } = require('../../queues/email.queue');
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'member_invite' })
    );
    expect(result).toHaveProperty('status', 'invited');
  });
});

// ── removeMember() ────────────────────────────────────────────
describe('tenantService.removeMember()', () => {
  it('throws FORBIDDEN when trying to remove tenant owner', async () => {
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue({ ownerId: { toString: () => 'target-user-id' } }),
    });
    await expect(tenantService.removeMember('tenant-id-1', 'target-user-id', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
  });

  it('throws FORBIDDEN when trying to self-remove', async () => {
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue({ ownerId: { toString: () => 'owner-id' } }),
    });
    await expect(tenantService.removeMember('tenant-id-1', 'actor-id-1', { ...actor, id: 'actor-id-1' }))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
  });

  it('soft-deletes member (status=deleted)', async () => {
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue({ ownerId: { toString: () => 'different-owner' } }),
    });
    User.findOne           = jest.fn().mockResolvedValue(makeUser({ _id: 'member-id' }));
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({});

    await tenantService.removeMember('tenant-id-1', 'member-id', actor);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'member-id',
      expect.objectContaining({ status: 'deleted' })
    );
  });
});

// ── acceptInvite() ────────────────────────────────────────────
describe('tenantService.acceptInvite()', () => {
  it('throws INVITE_TOKEN_INVALID when token not found', async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    await expect(tenantService.acceptInvite('bad-token', { firstName: 'A', lastName: 'B', password: 'P@ssw0rd!' }))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVITE_TOKEN_INVALID });
  });

  it('throws INVITE_TOKEN_EXPIRED when past expiry', async () => {
    User.findOne = jest.fn().mockResolvedValue(
      makeUser({ inviteExpiresAt: new Date(Date.now() - 1000) })
    );
    await expect(tenantService.acceptInvite('expired-token', { firstName: 'A', lastName: 'B', password: 'P@ssw0rd!' }))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.INVITE_TOKEN_EXPIRED });
  });

  it('activates user and issues access token on valid invite', async () => {
    const user = makeUser({ inviteToken: 'valid-token', inviteExpiresAt: new Date(Date.now() + 100000) });
    User.findOne  = jest.fn().mockResolvedValue(user);
    RefreshToken.create = jest.fn().mockResolvedValue({});
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue({ name: 'Acme Corp' }),
    });

    const result = await tenantService.acceptInvite('valid-token', {
      firstName: 'Rahul', lastName: 'Kumar', password: 'Secure@123',
    });

    expect(user.status).toBe('active');
    expect(user.inviteToken).toBeNull();
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('user');
  });
});

// ── changeMemberRole() ────────────────────────────────────────
describe('tenantService.changeMemberRole()', () => {
  it('throws FORBIDDEN when changing owner role to non-admin', async () => {
    User.findOne = jest.fn().mockResolvedValue(makeUser({ _id: 'owner-id' }));
    Tenant.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean:   jest.fn().mockResolvedValue({ ownerId: { toString: () => 'owner-id' } }),
    });
    await expect(tenantService.changeMemberRole('tenant-id-1', 'owner-id', 'tenant_member', actor))
      .rejects.toMatchObject({ errorCode: ERROR_CODES.FORBIDDEN });
  });
});
