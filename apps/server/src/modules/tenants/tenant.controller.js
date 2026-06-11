'use strict';

/**
 * Tenant Controller
 * Thin HTTP layer — calls tenant.service, formats response.
 * REF: docs/SRS.md §3 — Tenants Module
 */

const tenantService    = require('./tenant.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');

/**
 * GET /:tenantId
 */
const getTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.getTenant(req.params.tenantId);
  res.status(200).json({ success: true, data: { tenant } });
});

/**
 * PATCH /:tenantId
 */
const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await tenantService.updateTenant(req.params.tenantId, req.body, req.user);
  res.status(200).json({ success: true, data: { tenant } });
});

/**
 * POST /:tenantId/logo
 */
const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Logo image file is required.' },
    });
  }
  const result = await tenantService.uploadLogo(req.params.tenantId, req.file.buffer, req.file.mimetype);
  res.status(200).json({ success: true, data: result });
});

/**
 * GET /:tenantId/members
 */
const getMembers = asyncHandler(async (req, res) => {
  const { members, pagination } = await tenantService.getMembers(
    req.params.tenantId,
    { page: req.query.page, limit: req.query.limit }
  );
  res.status(200).json({ success: true, data: { members, pagination } });
});

/**
 * POST /:tenantId/members/invite
 */
const inviteMember = asyncHandler(async (req, res) => {
  const user = await tenantService.inviteMember(
    req.params.tenantId,
    req.body.email,
    req.body.role,
    req.user,
    req.tenantContext
  );
  res.status(201).json({
    success: true,
    data:    { message: 'Invitation sent successfully.', userId: user._id },
  });
});

/**
 * POST /:tenantId/members/accept-invite
 */
const acceptInvite = asyncHandler(async (req, res) => {
  const meta   = { ip: req.ip, userAgent: req.headers['user-agent'] };
  const result = await tenantService.acceptInvite(req.body.token, req.body, meta);

  res.cookie('refreshToken', result.refreshTokenRaw, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/api/v1/auth/refresh',
    maxAge:   30 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    data:    { accessToken: result.accessToken, user: result.user },
  });
});

/**
 * DELETE /:tenantId/members/:userId
 */
const removeMember = asyncHandler(async (req, res) => {
  await tenantService.removeMember(req.params.tenantId, req.params.userId, req.user);
  res.status(200).json({ success: true, data: { message: 'Member removed successfully.' } });
});

/**
 * PATCH /:tenantId/members/:userId/role
 */
const changeMemberRole = asyncHandler(async (req, res) => {
  const user = await tenantService.changeMemberRole(
    req.params.tenantId,
    req.params.userId,
    req.body.role,
    req.user
  );
  res.status(200).json({ success: true, data: { user } });
});

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
