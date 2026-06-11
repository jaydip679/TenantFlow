'use strict';

/**
 * Auth Controller
 *
 * Thin HTTP layer — extracts params, calls auth.service, formats response.
 * Each function must stay ≤20 lines (business logic belongs in service).
 *
 * Refresh token cookie spec (SRS §2.1):
 *   - HttpOnly, Secure (in production), SameSite=Strict
 *   - Path=/api/v1/auth/refresh (scoped — not sent on other requests)
 *   - Max-Age=2592000 (30 days)
 *
 * REF: docs/SRS.md §2.1 — Auth endpoint specifications
 * REF: docs/MASTER_AGENT_PROMPT.md §9.1 — Response envelope format
 */

const authService        = require('./auth.service');
const { asyncHandler }   = require('../../shared/utils/asyncHandler');
const { verifyAccessToken, decodeToken } = require('../../shared/utils/jwtService');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  path:     '/api/v1/auth/refresh',
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
};

/**
 * Helper: extract client meta from request headers.
 */
const getMeta = (req) => ({
  ip:        req.ip || req.socket?.remoteAddress || null,
  userAgent: req.headers['user-agent'] || null,
});

/**
 * POST /auth/register
 */
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({
    success: true,
    data: {
      userId:   result.userId,
      tenantId: result.tenantId,
      message:  `OTP sent to ${req.body.email}. Verify your email to activate your account.`,
    },
  });
});

/**
 * POST /auth/verify-email
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const { accessToken, refreshTokenRaw, user } = await authService.verifyEmail(email, otp, getMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, refreshTokenRaw, REFRESH_COOKIE_OPTS);
  res.status(200).json({ success: true, data: { accessToken, user } });
});

/**
 * POST /auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { accessToken, refreshTokenRaw, user } = await authService.login(email, password, getMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, refreshTokenRaw, REFRESH_COOKIE_OPTS);
  res.status(200).json({ success: true, data: { accessToken, user } });
});

/**
 * POST /auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawToken) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_TOKEN_MISSING', message: 'Refresh token not found.' } });
  }
  const { accessToken, refreshTokenRaw } = await authService.refreshTokens(rawToken, getMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, refreshTokenRaw, REFRESH_COOKIE_OPTS);
  res.status(200).json({ success: true, data: { accessToken } });
});

/**
 * POST /auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  // Decode token to get exp even if nearly-expired
  const decoded = decodeToken(req.headers.authorization?.slice(7));
  await authService.logout(req.user.jti, rawRefreshToken, decoded?.exp || 0, req.user);
  res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTS, maxAge: 0 });
  res.status(200).json({ success: true, data: { message: 'Logged out successfully.' } });
});

/**
 * POST /auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Always return 200 — never reveal whether email exists
  res.status(200).json({ success: true, data: { message: 'If an account with this email exists, a reset code has been sent.' } });
});

/**
 * POST /auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  await authService.resetPassword(email, otp, newPassword);
  res.status(200).json({ success: true, data: { message: 'Password reset successfully. Please log in with your new password.' } });
});

/**
 * GET /auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

/**
 * PATCH /auth/me
 */
const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user.id, req.body);
  res.status(200).json({ success: true, data: { user } });
});

/**
 * POST /auth/me/avatar
 */
const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Avatar image file is required.' } });
  }
  const result = await authService.updateAvatar(req.user.id, req.file.buffer, req.file.mimetype);
  res.status(200).json({ success: true, data: result });
});

module.exports = { register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword, getMe, updateMe, updateAvatar };
