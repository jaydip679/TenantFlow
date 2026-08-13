'use strict';

/**
 * Auth Service
 *
 * Implements all authentication and session management business logic.
 * No req/res objects — accepts plain data parameters, returns plain data.
 *
 * Methods:
 *   register(data)                           → { userId, tenantId }
 *   verifyEmail(email, otp)                  → { accessToken, refreshTokenRaw, user }
 *   login(email, password, meta)             → { accessToken, refreshTokenRaw, user }
 *   refreshTokens(rawToken, meta)            → { accessToken, refreshTokenRaw }
 *   logout(jti, rawRefreshToken, tokenExp)   → void
 *   forgotPassword(email)                    → void
 *   resetPassword(email, otp, newPassword)   → void
 *   getMe(userId)                            → User
 *   updateMe(userId, updates)                → User
 *
 * REF: docs/SRS.md §2 — Authentication Module
 * REF: docs/SYSTEM_DESIGN.md §4 — Authentication & Token Architecture
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.5
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { addDays }    = require('date-fns');
const { addEventToOutbox } = require('../../shared/events/outbox.helper');

// Models
const User         = require('../../models/User.model');
const Tenant       = require('../../models/Tenant.model');
const RefreshToken = require('../../models/RefreshToken.model');

// Utilities
const { signAccessToken, signRefreshToken, ACCESS_TOKEN_TTL_SEC } = require('../../shared/utils/jwtService');
const { generateOTP, storeOTP, verifyOTP, OTP_PURPOSES }          = require('../../shared/utils/otpService');
const { sha256 }                = require('../../shared/utils/cryptoUtils');
const { createAuditLog }        = require('../../shared/utils/auditLogService');
const { enqueueEmail }          = require('../../queues/email.queue');
const { generateSlug }          = require('../../shared/utils/slugify');
const { AppError }              = require('../../shared/errors/AppError');
const { ERROR_CODES }           = require('../../shared/errors/errorCodes');
const redisClient               = require('../../config/redis');
const logger                    = require('../../shared/utils/logger');

const BCRYPT_COST         = 12;
const REFRESH_TOKEN_TTL   = 30 * 24 * 60 * 60; // 30 days in seconds
// Dummy hash for timing-safe user-not-found comparisons (prevents email enumeration)
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2TQ/J1bRKi';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Issue a new access + refresh token pair and persist refresh token hash.
 * @param {Object} user - Mongoose User document
 * @param {Object} meta - { ip, userAgent }
 * @param {string|null} [familyId] - Existing familyId for rotation; null for new family
 * @returns {{ accessToken: string, refreshTokenRaw: string }}
 */
const issueTokenPair = async (user, meta = {}, familyId = null) => {
  const accessToken     = signAccessToken({
    userId:   user._id,
    tenantId: user.tenantId,
    role:     user.role,
    email:    user.email,
  });
  const refreshTokenRaw  = signRefreshToken(); // Opaque UUID v4
  const tokenHash        = sha256(refreshTokenRaw);
  const thisFamily       = familyId || uuidv4();
  const expiresAt        = addDays(new Date(), 30);

  await RefreshToken.create({
    userId:    user._id,
    tokenHash,
    familyId:  thisFamily,
    status:    'active',
    expiresAt,
    ip:        meta.ip        || null,
    userAgent: meta.userAgent || null,
  });

  return { accessToken, refreshTokenRaw };
};

// ── Service Methods ──────────────────────────────────────────

/**
 * Register a new tenant admin.
 * Creates Tenant + User atomically inside a MongoDB transaction.
 *
 * ⚠️ EDGE CASE: Registration must be fully atomic. If any step fails,
 * both the Tenant and User documents must be rolled back.
 *
 * @param {{ email, password, firstName, lastName, companyName }} data
 * @returns {{ userId: string, tenantId: string }}
 */
const register = async ({ email, password, firstName, lastName, companyName }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Pre-check for duplicate email (fast fail before starting transaction)
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    // If the account exists but is NOT yet verified, update it with the latest
    // submitted data (name, password, company name) and resend a fresh OTP.
    // This handles: OTP expired, typo in name, caps mistake, wrong inbox, etc.
    // The user's LATEST attempt is always what ends up verified.
    if (!existing.isEmailVerified) {
      const newPasswordHash  = await bcrypt.hash(password, BCRYPT_COST);
      const newFirstName     = firstName.trim();
      const newLastName      = lastName.trim();

      // Update user with the latest submitted profile data + new password
      await User.findByIdAndUpdate(existing._id, {
        firstName:    newFirstName,
        lastName:     newLastName,
        passwordHash: newPasswordHash,
      });

      // Update tenant company name with the latest submitted value
      if (existing.tenantId) {
        await Tenant.findByIdAndUpdate(existing.tenantId, {
          name: companyName.trim(),
        });
      }

      // Generate and send a fresh OTP
      const otp = generateOTP();
      await storeOTP(OTP_PURPOSES.EMAIL_VERIFY, normalizedEmail, otp);
      await enqueueEmail({
        type:             'email_otp',
        to:               normalizedEmail,
        firstName:        newFirstName,
        otp,
        expiresInMinutes: 10,
      });

      logger.info({ email: normalizedEmail }, 'Updated unverified account and re-sent OTP');
      // Return same shape as a fresh registration — frontend behaviour is identical
      return { userId: String(existing._id), tenantId: String(existing.tenantId) };
    }

    // Account is fully verified — this is a real duplicate
    throw new AppError(
      'An account with this email already exists.',
      409,
      ERROR_CODES.AUTH_EMAIL_EXISTS
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const slug         = await generateSlug(companyName, Tenant);

  let userId, tenantId;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Create tenant first (owner set after user is created)
      const [tenant] = await Tenant.create(
        [{
          name:         companyName,
          slug,
          billingEmail: normalizedEmail,
          status:       'trialing',
          trialEndsAt:  addDays(new Date(), parseInt(process.env.DEFAULT_TRIAL_DAYS || '14', 10)),
          ownerId:      new mongoose.Types.ObjectId(), // Placeholder — updated below
        }],
        { session }
      );

      // Create tenant admin user
      const [user] = await User.create(
        [{
          email:           normalizedEmail,
          passwordHash,
          firstName:       firstName.trim(),
          lastName:        lastName.trim(),
          role:            'tenant_admin',
          tenantId:        tenant._id,
          status:          'active',  // Active but email not yet verified
          isEmailVerified: false,
        }],
        { session }
      );

      // Update tenant ownerId now that user _id is known
      await Tenant.findByIdAndUpdate(tenant._id, { ownerId: user._id }, { session });

      await addEventToOutbox({
        eventType: 'tenant.created',
        eventVersion: 'v1',
        producer: 'identity-service',
        aggregateType: 'tenant',
        aggregateId: tenant._id.toString(),
        tenantId: tenant._id.toString(),
        payload: {
          name: tenant.name,
          slug: tenant.slug,
          email: user.email,
          createdAt: tenant.createdAt,
          aggregateVersion: tenant.aggregateVersion
        },
        session,
      });

      await addEventToOutbox({
        eventType: 'user.created',
        eventVersion: 'v1',
        producer: 'identity-service',
        aggregateType: 'user',
        aggregateId: user._id.toString(),
        tenantId: tenant._id.toString(),
        payload: {
          userId: user._id.toString(),
          email: user.email,
          role: user.role,
          aggregateVersion: user.aggregateVersion
        },
        session,
      });

      userId   = user._id;
      tenantId = tenant._id;
    });
  } finally {
    session.endSession();
  }

  // Create Trial Subscription via Internal Billing API (Phase 4B Decoupling)
  try {
    const Plan = require('../../models/Plan.model');
    const axios = require('axios');
    
    const defaultPlan = await Plan.findOne({ isActive: true, isPublic: true }).sort({ price: 1 }).lean();
    if (defaultPlan) {
      await axios.post(
        `${process.env.BILLING_SERVICE_URL}/api/internal/billing/subscriptions/trial`,
        { tenantId, planId: defaultPlan._id.toString() },
        {
          headers: { 'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET },
          timeout: 5000
        }
      );
    }
  } catch (err) {
    // Non-fatal for registration, but log it as a critical failure
    logger.error({ err: err.message, tenantId }, 'TRIAL_SUBSCRIPTION_FAILED: Failed to create trial subscription during registration');
  }

  // Post-transaction: generate + store OTP (outside transaction — idempotent)
  const otp = generateOTP();
  await storeOTP(OTP_PURPOSES.EMAIL_VERIFY, normalizedEmail, otp);

  // Enqueue OTP email
  await enqueueEmail({
    type:      'email_otp',
    to:        normalizedEmail,
    firstName,
    otp,
    expiresInMinutes: 10,
  });

  // Audit log
  await createAuditLog({
    event:        'user.registered',
    resourceType: 'user',
    resourceId:   userId,
    tenantId,
    actor:        { userId, role: 'tenant_admin', email: normalizedEmail },
  });

  logger.info({ userId, tenantId, email: normalizedEmail }, 'New tenant registered');

  return { userId: String(userId), tenantId: String(tenantId) };
};

/**
 * Verify email via OTP and auto-login the user.
 *
 * @param {string} email
 * @param {string} otp
 * @param {Object} meta - { ip, userAgent }
 * @returns {{ accessToken: string, refreshTokenRaw: string, user: Object }}
 */
const verifyEmail = async (email, otp, meta = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  await verifyOTP(OTP_PURPOSES.EMAIL_VERIFY, normalizedEmail, otp);

  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    { isEmailVerified: true, status: 'active' },
    { new: true }
  );

  if (!user) {
    throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  const { accessToken, refreshTokenRaw } = await issueTokenPair(user, meta);

  // Enqueue welcome email — look up the tenant name so we don't expose the raw ObjectId
  const tenant = await Tenant.findById(user.tenantId).lean();
  await enqueueEmail({
    type:       'welcome',
    to:         normalizedEmail,
    firstName:  user.firstName,
    tenantName: tenant?.name || tenant?.companyName || 'your organization',
  });

  return {
    accessToken,
    refreshTokenRaw,
    user: {
      _id:       user._id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      role:      user.role,
      tenantId:  user.tenantId,
      avatarUrl: user.avatarUrl,
    },
  };
};

/**
 * Login with email + password.
 *
 * ⚠️ EDGE CASE: If user not found, still run bcrypt.compare with DUMMY_HASH
 * to normalize response time and prevent user enumeration via timing attack.
 *
 * @param {string} email
 * @param {string} password
 * @param {Object} meta - { ip, userAgent }
 * @returns {{ accessToken: string, refreshTokenRaw: string, user: Object }}
 */
const login = async (email, password, meta = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Include passwordHash which is excluded from schema defaults via select:false
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  // EDGE CASE: Run dummy compare if user not found to prevent timing-based email enumeration
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('Invalid email or password.', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
  }

  if (!user.isEmailVerified) {
    throw new AppError(
      'Please verify your email address before logging in.',
      403,
      ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED
    );
  }

  if (user.status === 'suspended') {
    throw new AppError(
      'Your account has been suspended. Please contact support.',
      403,
      ERROR_CODES.AUTH_ACCOUNT_SUSPENDED
    );
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordCorrect) {
    throw new AppError('Invalid email or password.', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
  }

  const { accessToken, refreshTokenRaw } = await issueTokenPair(user, meta);

  // Update last login timestamp (fire-and-forget, non-critical)
  User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).catch((err) =>
    logger.warn({ err: err.message }, 'Failed to update lastLoginAt')
  );

  await createAuditLog({
    event:        'user.login',
    resourceType: 'user',
    resourceId:   user._id,
    tenantId:     user.tenantId,
    actor:        { userId: user._id, role: user.role, email: user.email },
    ip:           meta.ip,
    userAgent:    meta.userAgent,
  });

  // Emit lightweight user.login event directly to Redis Streams (Phase 1D-A)
  try {
    const { RedisStreamsEventBus } = require('../../shared/events/redisStreamsEventBus');
    const { createEventEnvelope } = require('../../shared/events/eventEnvelope');
    
    const eventBus = new RedisStreamsEventBus();
    const envelope = createEventEnvelope({
      eventType: 'user.login',
      eventVersion: 'v1',
      producer: 'identity-service',
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      aggregateType: 'user',
      aggregateId: user._id.toString(),
      payload: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        ip: meta.ip || null
      }
    });
    await eventBus.publish(envelope);
  } catch (err) {
    logger.warn({ err: err.message, userId: user._id }, 'Failed to publish user.login event');
  }

  return {
    accessToken,
    refreshTokenRaw,
    user: {
      _id:       user._id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      role:      user.role,
      tenantId:  user.tenantId,
      avatarUrl: user.avatarUrl,
    },
  };
};

/**
 * Rotate refresh tokens.
 *
 * ⚠️ EDGE CASE — Reuse Detection:
 * If the submitted token hash is found with status='invalidated', it is a
 * reuse attack. Invalidate the ENTIRE family and throw AUTH_REFRESH_REUSE.
 *
 * @param {string} rawToken - Raw refresh token from cookie
 * @param {Object} meta     - { ip, userAgent }
 * @returns {{ accessToken: string, refreshTokenRaw: string }}
 */
const refreshTokens = async (rawToken, meta = {}) => {
  const tokenHash = sha256(rawToken);
  const stored    = await RefreshToken.findOne({ tokenHash });

  if (!stored) {
    throw new AppError('Invalid refresh token.', 403, ERROR_CODES.AUTH_REFRESH_INVALID);
  }

  // EDGE CASE: Reuse detection — token was already rotated (invalidated) but used again
  if (stored.status === 'invalidated') {
    // Invalidate the entire family — assume account compromise
    await RefreshToken.updateMany(
      { familyId: stored.familyId },
      { $set: { status: 'invalidated' } }
    );
    logger.warn(
      { userId: stored.userId, familyId: stored.familyId },
      'Refresh token reuse detected — entire family invalidated'
    );
    throw new AppError(
      'Session security violation detected. Please log in again.',
      403,
      ERROR_CODES.AUTH_REFRESH_REUSE
    );
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError('Refresh token has expired.', 403, ERROR_CODES.AUTH_REFRESH_EXPIRED);
  }

  // Invalidate current token (rotation — it becomes 'invalidated' so reuse can be detected)
  await RefreshToken.findByIdAndUpdate(stored._id, { status: 'invalidated' });

  const user = await User.findById(stored.userId);
  if (!user) {
    throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  // Issue new token pair in the same family
  const { accessToken, refreshTokenRaw } = await issueTokenPair(user, meta, stored.familyId);

  return { accessToken, refreshTokenRaw };
};

/**
 * Logout — blacklist JTI in Redis and invalidate refresh token.
 *
 * @param {string} jti             - JWT ID from access token payload
 * @param {string} rawRefreshToken - Raw refresh token from cookie
 * @param {number} tokenExp        - Access token exp (Unix seconds) for TTL calculation
 * @param {Object} actorUser       - req.user
 */
const logout = async (jti, rawRefreshToken, tokenExp, actorUser) => {
  // Blacklist the access token JTI in Redis until it would have expired naturally
  const ttlSeconds = Math.max(tokenExp - Math.floor(Date.now() / 1000), 1);
  await redisClient.set(`blacklist:at:${jti}`, '1', 'EX', ttlSeconds);

  // Invalidate the refresh token
  if (rawRefreshToken) {
    const tokenHash = sha256(rawRefreshToken);
    await RefreshToken.findOneAndUpdate({ tokenHash }, { status: 'invalidated' });
  }

  await createAuditLog({
    event:        'user.logout',
    resourceType: 'user',
    resourceId:   actorUser.id,
    tenantId:     actorUser.tenantId,
    actor:        { userId: actorUser.id, role: actorUser.role, email: actorUser.email },
  });
};

/**
 * Forgot password — always returns 200 to prevent email enumeration.
 *
 * @param {string} email
 */
const forgotPassword = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail });

  // If user not found: return silently — never reveal whether email exists
  if (!user) return;

  const otp = generateOTP();
  await storeOTP(OTP_PURPOSES.PASSWORD_RESET, normalizedEmail, otp);

  await enqueueEmail({
    type:             'password_reset',
    to:               normalizedEmail,
    firstName:        user.firstName,
    otp,
    expiresInMinutes: 10,
  });
};

/**
 * Reset password using OTP.
 * Invalidates ALL active sessions after password change.
 *
 * @param {string} email
 * @param {string} otp
 * @param {string} newPassword
 */
const resetPassword = async (email, otp, newPassword) => {
  const normalizedEmail = email.toLowerCase().trim();

  await verifyOTP(OTP_PURPOSES.PASSWORD_RESET, normalizedEmail, otp);

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await User.findByIdAndUpdate(user._id, { passwordHash });

  // Invalidate ALL active refresh tokens for this user (force re-login all devices)
  await RefreshToken.updateMany(
    { userId: user._id, status: 'active' },
    { $set: { status: 'invalidated' } }
  );

  await createAuditLog({
    event:        'user.password_reset',
    resourceType: 'user',
    resourceId:   user._id,
    tenantId:     user.tenantId,
    actor:        { userId: user._id, role: user.role, email: user.email },
  });
};

/**
 * Get current user profile (no sensitive fields).
 *
 * @param {string} userId
 * @returns {Object} User document (sanitized)
 */
const getMe = async (userId) => {
  const user = await User.findById(userId)
    .select('-passwordHash -inviteToken')
    .lean();

  if (!user) {
    throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  return user;
};

/**
 * Update current user's non-sensitive profile fields.
 *
 * @param {string} userId
 * @param {{ firstName?, lastName?, notificationPreferences? }} updates
 * @returns {Object} Updated user document
 */
const updateMe = async (userId, updates) => {
  const allowedFields = ['firstName', 'lastName', 'notificationPreferences'];
  const sanitized     = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }

  const user = await User.findByIdAndUpdate(userId, sanitized, { new: true })
    .select('-passwordHash -inviteToken')
    .lean();

  if (!user) {
    throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  return user;
};

/**
 * Upload or replace avatar for current user.
 * Uploads to Cloudinary folder: users/{userId}/avatar
 * Auto-crops to 150×150 WebP. Deletes old avatar if exists.
 *
 * @param {string} userId
 * @param {Buffer} fileBuffer - From Multer memory storage (req.file.buffer)
 * @param {string} mimetype   - e.g. 'image/jpeg'
 * @returns {{ avatarUrl: string }}
 */
const updateAvatar = async (userId, fileBuffer, mimetype) => {
  const { cloudinaryUpload, cloudinaryDelete } = require('../../config/cloudinary');

  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);

  // Delete old avatar from Cloudinary if it exists
  if (user.avatarUrl) {
    try {
      // Extract public_id from the secure_url (format: .../users/{userId}/avatar)
      const publicId = `users/${userId}/avatar`;
      await cloudinaryDelete(publicId);
    } catch {
      // Non-critical — log and continue
      logger.warn({ userId }, 'Failed to delete old avatar from Cloudinary');
    }
  }

  const result = await cloudinaryUpload(fileBuffer, {
    folder:         `users/${userId}`,
    public_id:      'avatar',
    overwrite:      true,
    resource_type:  'image',
    transformation: [
      { width: 150, height: 150, crop: 'fill', gravity: 'face' },
      { format: 'webp', quality: 'auto' },
    ],
  });

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { avatarUrl: result.secure_url },
    { new: true }
  ).select('-passwordHash -inviteToken').lean();

  return { avatarUrl: updatedUser.avatarUrl };
};

/**
 * Change password for an authenticated user.
 * Requires knowledge of the current password (unlike resetPassword which uses OTP).
 * Invalidates ALL active sessions after change — forces re-login on all devices.
 *
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError('Current password is incorrect.', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
  }

  if (currentPassword === newPassword) {
    throw new AppError('New password must be different from the current password.', 422, ERROR_CODES.VALIDATION_ERROR);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await User.findByIdAndUpdate(userId, { passwordHash });

  // Invalidate ALL active refresh tokens — user must re-login everywhere
  await RefreshToken.updateMany(
    { userId, status: 'active' },
    { $set: { status: 'invalidated' } }
  );

  await createAuditLog({
    event:        'user.password_changed',
    resourceType: 'user',
    resourceId:   userId,
    tenantId:     user.tenantId,
    actor:        { userId, role: user.role, email: user.email },
  });
};

module.exports = {
  register,
  verifyEmail,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  updateAvatar,
  changePassword,
};
