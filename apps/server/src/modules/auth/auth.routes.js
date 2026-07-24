'use strict';

/**
 * Auth Routes
 *
 * Middleware order on every protected route (MUST NOT be changed):
 *   authenticate → authorize(...roles) → validate(schema) → controller
 *
 * Public routes (no auth): register, verify-email, login, forgot-password, reset-password
 * Protected routes (Bearer): logout, /me (GET + PATCH), /me/avatar
 * Refresh route: uses refresh cookie (no Bearer)
 *
 * REF: docs/SRS.md §2.1 — Auth endpoint specifications
 * REF: docs/MASTER_AGENT_PROMPT.md §9.2 — Route Organization Rules
 */

const express = require('express');
const cookieParser = require('cookie-parser');

const authController         = require('./auth.controller');
const { authenticate }       = require('../../shared/middleware/authenticate.middleware');
const { validate }           = require('../../shared/middleware/validate.middleware');
const { imageUpload }        = require('../../shared/middleware/upload.middleware');
const { authRateLimiter }    = require('../../shared/middleware/rateLimiter.middleware');
const {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateMeSchema,
} = require('./auth.validator');

const router = express.Router();
router.use(cookieParser()); // Parse cookies for refresh token

/**
 * @swagger
 * tags:
 *   name: auth
 *   description: Authentication and session management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new tenant admin
 *     description: |
 *       Creates a new tenant and tenant admin user atomically.
 *       Sends a 6-digit OTP to the provided email for verification.
 *       Returns 201 with userId and tenantId — no tokens yet (email not verified).
 *     tags: [auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, companyName]
 *             properties:
 *               email:       { type: string, format: email, example: admin@acme.com }
 *               password:    { type: string, minLength: 8, example: "Secure@123" }
 *               firstName:   { type: string, example: Priya }
 *               lastName:    { type: string, example: Sharma }
 *               companyName: { type: string, example: Acme Corp }
 *     responses:
 *       201:
 *         description: Registration successful, OTP sent
 *       409:
 *         description: Email already exists (AUTH_EMAIL_EXISTS)
 *       422:
 *         description: Validation error
 */
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email with OTP and auto-login
 *     description: Verifies 6-digit OTP. On success, marks email verified, issues access token + refresh cookie.
 *     tags: [auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp:   { type: string, example: "483921" }
 *     responses:
 *       200:
 *         description: Email verified, access token returned
 *       400:
 *         description: OTP invalid or expired
 *       429:
 *         description: Max OTP attempts exceeded (AUTH_OTP_MAX_ATTEMPTS)
 */
router.post('/verify-email', authRateLimiter, validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: |
 *       Returns access token in response body.
 *       Sets HttpOnly refresh token cookie scoped to /api/v1/auth/refresh.
 *     tags: [auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, access token returned
 *       401:
 *         description: Invalid credentials (AUTH_INVALID_CREDENTIALS)
 *       403:
 *         description: Email not verified or account suspended
 */
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token and issue new access token
 *     description: |
 *       Reads refresh token from HttpOnly cookie.
 *       Issues new access token and rotates refresh token.
 *       Detects reuse attacks and invalidates entire token family on detection.
 *     tags: [auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Refresh token missing
 *       403:
 *         description: Invalid, expired, or reused refresh token
 */
router.post('/refresh', authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and invalidate session
 *     description: Blacklists JTI in Redis, invalidates refresh token, clears cookie.
 *     tags: [auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset OTP
 *     description: Always returns 200 regardless of whether the email exists (prevents enumeration).
 *     tags: [auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset code sent if account exists
 */
router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with OTP
 *     description: Verifies OTP, updates password, and invalidates all active sessions.
 *     tags: [auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:       { type: string, format: email }
 *               otp:         { type: string, example: "123456" }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: OTP invalid or expired
 */
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), authController.resetPassword);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Returns authenticated user's profile. Never returns passwordHash or tokens.
 *     tags: [auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile returned
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /auth/me:
 *   patch:
 *     summary: Update current user profile
 *     description: Update firstName, lastName, or notification preferences.
 *     tags: [auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:               { type: string }
 *               lastName:                { type: string }
 *               notificationPreferences: { type: object }
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch('/me', authenticate, validate(updateMeSchema), authController.updateMe);

/**
 * @swagger
 * /auth/me/avatar:
 *   post:
 *     summary: Upload or replace user avatar
 *     description: |
 *       Accepts multipart/form-data with an image file.
 *       Uploads to Cloudinary (users/{userId}/avatar), auto-crops to 150×150 WebP.
 *       Deletes the previous avatar from Cloudinary if it exists.
 *       Max file size: 5MB. Allowed types: JPEG, PNG, WebP.
 *     tags: [auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully, returns new avatarUrl
 *       422:
 *         description: No file provided or invalid file type
 */
router.post('/me/avatar', authenticate, imageUpload.single('avatar'), authController.updateAvatar);

/**
 * POST /auth/me/change-password
 * Authenticated user changes their own password.
 * Requires current password for verification. Invalidates all sessions after change.
 */
const changePasswordSchema = Joi.object({
  params: Joi.object(),
  query:  Joi.object(),
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({ 'string.pattern.base': 'New password must contain uppercase, lowercase, number and special character.' }),
  }),
});

router.post('/me/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
