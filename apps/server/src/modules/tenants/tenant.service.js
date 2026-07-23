'use strict';

/**
 * Tenant Service
 *
 * Business logic for tenant profile management and member operations.
 *
 * Methods:
 *   getTenant(tenantId)
 *   updateTenant(tenantId, updates, actorUser)
 *   uploadLogo(tenantId, fileBuffer, mimetype)
 *   getMembers(tenantId, queryOptions)
 *   inviteMember(tenantId, email, role, actorUser, tenantContext)
 *   acceptInvite(token, { firstName, lastName, password }, meta)
 *   removeMember(tenantId, userId, actorUser)
 *   changeMemberRole(tenantId, userId, newRole, actorUser)
 *
 * REF: docs/SRS.md §3 — Tenants Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §5.1 T2.4
 */

const { v4: uuidv4 }  = require('uuid');
const { addHours }    = require('date-fns');
const bcrypt          = require('bcrypt');

const Tenant           = require('../../models/Tenant.model');
const User             = require('../../models/User.model');
const { AppError }     = require('../../shared/errors/AppError');
const { ERROR_CODES }  = require('../../shared/errors/errorCodes');
const { createAuditLog } = require('../../shared/utils/auditLogService');
const { enqueueEmail }   = require('../../queues/email.queue');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const redisClient      = require('../../config/redis');
const logger           = require('../../shared/utils/logger');
const { signAccessToken, signRefreshToken } = require('../../shared/utils/jwtService');
const { sha256 }       = require('../../shared/utils/cryptoUtils');
const RefreshToken     = require('../../models/RefreshToken.model');

const BCRYPT_COST      = 12;
const INVITE_EXPIRY_H  = 72; // 72 hours
const TENANT_CTX_KEY   = (tenantId) => `tenant:ctx:${tenantId}`;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Invalidate tenant context Redis cache.
 * Called after any tenant mutation (logo, profile, member changes).
 */
const invalidateTenantCache = async (tenantId) => {
  await redisClient.del(TENANT_CTX_KEY(tenantId)).catch((err) =>
    logger.warn({ err: err.message, tenantId }, 'Failed to invalidate tenant cache')
  );
};

// ── Service Methods ───────────────────────────────────────────

/**
 * Get tenant profile (public-facing fields).
 * @param {string} tenantId
 */
const getTenant = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId)
    .select('-features -deletedAt -razorpayCustomerId -razorpaySubscriptionId')
    .lean();
  if (!tenant) throw new AppError('Tenant not found.', 404, ERROR_CODES.NOT_FOUND);
  return tenant;
};

/**
 * Update tenant profile.
 * Updatable: name, billingEmail, billingAddress, taxId, timezone
 * NOT updatable: slug, currency, status, ownerId (enforced here, not just at validator)
 *
 * @param {string} tenantId
 * @param {Object} updates
 * @param {Object} actorUser - req.user
 */
const updateTenant = async (tenantId, updates, actorUser) => {
  const FORBIDDEN = ['slug', 'currency', 'status', 'ownerId', 'features'];
  for (const key of FORBIDDEN) {
    if (updates[key] !== undefined) {
      throw new AppError(`Field '${key}' cannot be updated directly.`, 422, ERROR_CODES.VALIDATION_ERROR);
    }
  }

  const before = await Tenant.findById(tenantId).lean();
  if (!before) throw new AppError('Tenant not found.', 404, ERROR_CODES.NOT_FOUND);

  const tenant = await Tenant.findByIdAndUpdate(tenantId, updates, { new: true, runValidators: true }).lean();

  await Promise.all([
    invalidateTenantCache(tenantId),
    createAuditLog({
      event: 'tenant.updated', resourceType: 'tenant', resourceId: tenantId,
      tenantId, actor: actorUser, before, after: tenant,
    }),
  ]);

  return tenant;
};

/**
 * Upload tenant logo to Cloudinary.
 * Crops to 200×200 WebP. Deletes old asset before uploading.
 * Invalidates Redis tenant context cache.
 *
 * @param {string} tenantId
 * @param {Buffer} fileBuffer
 * @param {string} mimetype
 */
const uploadLogo = async (tenantId, fileBuffer, mimetype) => {
  const { cloudinaryUpload, cloudinaryDelete } = require('../../config/cloudinary');

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new AppError('Tenant not found.', 404, ERROR_CODES.NOT_FOUND);

  // Delete old logo if exists
  if (tenant.logoUrl) {
    try {
      await cloudinaryDelete(`tenants/${tenantId}/logo`);
    } catch {
      logger.warn({ tenantId }, 'Failed to delete old tenant logo from Cloudinary');
    }
  }

  const result = await cloudinaryUpload(fileBuffer, {
    folder:         `tenants/${tenantId}`,
    public_id:      'logo',
    overwrite:      true,
    resource_type:  'image',
    transformation: [
      { width: 200, height: 200, crop: 'fill', gravity: 'center' },
      { format: 'webp', quality: 'auto' },
    ],
  });

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { logoUrl: result.secure_url },
    { new: true }
  ).lean();

  await invalidateTenantCache(tenantId);

  return { logoUrl: updated.logoUrl };
};

/**
 * Get paginated list of tenant members.
 * @param {string} tenantId
 * @param {{ page?, limit? }} options
 */
const getMembers = async (tenantId, options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const filter = {
    tenantId,
    status: { $in: ['active', 'invited'] },
  };

  const [members, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash -inviteToken -inviteExpiresAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { members, pagination: paginationMeta(total, page, limit) };
};

/**
 * Invite a new member to the tenant.
 *
 * ⚠️ SEAT CHECK FIRST — check tenantContext (passed in), NOT a new DB query.
 * An invited user consumes a seat immediately before accepting.
 *
 * @param {string} tenantId
 * @param {string} email
 * @param {string} role - 'tenant_member' | 'finance_member'
 * @param {Object} actorUser - req.user
 * @param {Object} tenantContext - req.tenantContext (from tenantScope middleware)
 */
const inviteMember = async (tenantId, email, role, actorUser, tenantContext) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Seat limit check — from tenantContext (already loaded by middleware, no extra DB query)
  const { usedSeats, seatLimit } = tenantContext;
  if (usedSeats >= seatLimit) {
    throw new AppError(
      `Seat limit reached (${usedSeats}/${seatLimit}). Remove a member or upgrade your plan.`,
      422,
      ERROR_CODES.SEAT_LIMIT_EXCEEDED
    );
  }

  // Check if email already a member of THIS tenant
  const existingInTenant = await User.findOne({ tenantId, email: normalizedEmail });
  if (existingInTenant) {
    throw new AppError('This email is already a member of this workspace.', 409, ERROR_CODES.USER_ALREADY_MEMBER);
  }

  // Check if email is already registered on TenantFlow (any tenant).
  // Because email is globally unique, we cannot create a second User record for this email.
  // The person would need to use a different email address for this workspace.
  const existingGlobal = await User.findOne({ email: normalizedEmail });
  if (existingGlobal) {
    throw new AppError(
      'This email is already registered on TenantFlow with another account. ' +
      'They must use a different email address to join this workspace, or contact support for cross-workspace access.',
      409,
      ERROR_CODES.USER_ALREADY_MEMBER
    );
  }

  const inviteToken = uuidv4();

  let invitedUser;
  try {
    invitedUser = await User.create({
      tenantId,
      email:           normalizedEmail,
      passwordHash:    'INVITE_PENDING', // placeholder — set on acceptInvite
      firstName:       'Invited',        // placeholder — overwritten on acceptInvite
      lastName:        'User',           // placeholder — overwritten on acceptInvite
      role,
      status:          'invited',
      isEmailVerified: false,
      invitedBy:       actorUser.id,
      inviteToken,
      inviteExpiresAt: addHours(new Date(), INVITE_EXPIRY_H),
    });
  } catch (err) {
    // E11000 = MongoDB duplicate key — email already registered (race condition or missed pre-check)
    if (err.code === 11000) {
      throw new AppError(
        'This email is already registered on TenantFlow. They must use a different email address for this workspace.',
        409,
        ERROR_CODES.USER_ALREADY_MEMBER
      );
    }
    throw err;
  }

  // Fetch inviter name for email
  const inviter = await User.findById(actorUser.id).select('firstName lastName').lean();
  const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : 'A team member';

  const tenant = await Tenant.findById(tenantId).select('name').lean();

  const acceptUrl = `${process.env.CLIENT_URL}/accept-invite?token=${inviteToken}`;

  await enqueueEmail({
    type:        'member_invite',
    to:          normalizedEmail,
    inviterName,
    tenantName:  tenant?.name || 'Your organization',
    role,
    acceptUrl,
    expiresAt:   addHours(new Date(), INVITE_EXPIRY_H),
  });

  await createAuditLog({
    event: 'user.invited', resourceType: 'user', resourceId: invitedUser._id,
    tenantId, actor: actorUser, after: { email: normalizedEmail, role },
  });

  return invitedUser;
};

/**
 * Accept an invitation.
 * Auth: None (token from email link).
 *
 * @param {string} token
 * @param {{ firstName, lastName, password }} data
 * @param {Object} meta - { ip, userAgent }
 */
const acceptInvite = async (token, { firstName, lastName, password }, meta = {}) => {
  const user = await User.findOne({ inviteToken: token });

  if (!user) {
    throw new AppError('Invalid invitation token.', 400, ERROR_CODES.INVITE_TOKEN_INVALID);
  }

  if (user.inviteExpiresAt < new Date()) {
    throw new AppError('Invitation has expired. Please request a new invitation.', 400, ERROR_CODES.INVITE_TOKEN_EXPIRED);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  user.firstName       = firstName.trim();
  user.lastName        = lastName.trim();
  user.passwordHash    = passwordHash;
  user.status          = 'active';
  user.isEmailVerified = true;
  user.inviteToken     = null;
  user.inviteExpiresAt = null;
  await user.save();

  // Auto-login: issue token pair
  const { v4: uuidv4_ } = require('uuid');
  const { addDays }      = require('date-fns');
  const accessToken    = signAccessToken({
    userId: user._id, tenantId: user.tenantId, role: user.role, email: user.email,
  });
  const refreshTokenRaw = signRefreshToken();
  await RefreshToken.create({
    userId:    user._id,
    tokenHash: sha256(refreshTokenRaw),
    familyId:  uuidv4_(),
    status:    'active',
    expiresAt: addDays(new Date(), 30),
    ip:        meta.ip || null,
    userAgent: meta.userAgent || null,
  });

  const tenant = await Tenant.findById(user.tenantId).select('name').lean();

  await enqueueEmail({
    type:       'welcome',
    to:         user.email,
    firstName:  user.firstName,
    tenantName: tenant?.name || 'your organization',
  });

  return {
    accessToken,
    refreshTokenRaw,
    user: {
      _id:      user._id,
      email:    user.email,
      firstName:user.firstName,
      lastName: user.lastName,
      role:     user.role,
      tenantId: user.tenantId,
    },
  };
};

/**
 * Remove (soft-delete) a member.
 * Cannot remove the tenant owner. Cannot self-remove.
 *
 * @param {string} tenantId
 * @param {string} targetUserId
 * @param {Object} actorUser - req.user
 */
const removeMember = async (tenantId, targetUserId, actorUser) => {
  const tenant = await Tenant.findById(tenantId).select('ownerId').lean();
  if (!tenant) throw new AppError('Tenant not found.', 404, ERROR_CODES.NOT_FOUND);

  // Cannot remove tenant owner
  if (tenant.ownerId.toString() === targetUserId) {
    throw new AppError('Cannot remove the tenant owner.', 403, ERROR_CODES.FORBIDDEN);
  }

  // Cannot self-remove
  if (actorUser.id === targetUserId) {
    throw new AppError('You cannot remove yourself from the tenant.', 403, ERROR_CODES.FORBIDDEN);
  }

  const targetUser = await User.findOne({ _id: targetUserId, tenantId });
  if (!targetUser) throw new AppError('Member not found.', 404, ERROR_CODES.NOT_FOUND);

  await User.findByIdAndUpdate(targetUserId, {
    status:    'deleted',
    deletedAt: new Date(),
  });

  await Promise.all([
    invalidateTenantCache(tenantId),
    createAuditLog({
      event: 'user.removed', resourceType: 'user', resourceId: targetUserId,
      tenantId, actor: actorUser, before: { status: targetUser.status },
    }),
  ]);
};

/**
 * Change a member's role.
 *
 * @param {string} tenantId
 * @param {string} targetUserId
 * @param {string} newRole
 * @param {Object} actorUser
 */
const changeMemberRole = async (tenantId, targetUserId, newRole, actorUser) => {
  const user = await User.findOne({ _id: targetUserId, tenantId });
  if (!user) throw new AppError('Member not found.', 404, ERROR_CODES.NOT_FOUND);

  // Cannot change role of tenant owner to non-admin
  const tenant = await Tenant.findById(tenantId).select('ownerId').lean();
  if (tenant?.ownerId.toString() === targetUserId && newRole !== 'tenant_admin') {
    throw new AppError('Cannot change the role of the tenant owner.', 403, ERROR_CODES.FORBIDDEN);
  }

  const before = { role: user.role };
  user.role = newRole;
  await user.save();

  await createAuditLog({
    event: 'user.role_changed', resourceType: 'user', resourceId: targetUserId,
    tenantId, actor: actorUser, before, after: { role: newRole },
  });

  return await User.findById(targetUserId).select('-passwordHash -inviteToken').lean();
};

module.exports = {
  getTenant,
  updateTenant,
  uploadLogo,
  getMembers,
  inviteMember,
  acceptInvite,
  removeMember,
  changeMemberRole,
};
