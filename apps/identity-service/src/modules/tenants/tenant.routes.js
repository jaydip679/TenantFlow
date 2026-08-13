'use strict';

/**
 * Tenant Routes
 *
 * Middleware order on every protected route (MUST NOT be changed):
 *   authenticate → tenantScope() → authorize(...roles) → validate(schema) → controller
 *
 * Accept-invite: public (no auth — token from email link)
 *
 * REF: docs/SRS.md §3.1 — Tenants endpoint specifications
 * REF: docs/MASTER_AGENT_PROMPT.md §9.2 — Route Organization Rules
 */

const express            = require('express');
const cookieParser       = require('cookie-parser');
const tenantController   = require('./tenant.controller');
const { authenticate }   = require('../../shared/middleware/authenticate.middleware');
const { authorize }      = require('../../shared/middleware/authorize.middleware');
const { tenantScope }    = require('../../shared/middleware/tenantScope.middleware');
const { validate }       = require('../../shared/middleware/validate.middleware');
const { imageUpload }    = require('../../shared/middleware/upload.middleware');
const {
  updateTenantSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
} = require('./tenant.validator');

const router = express.Router();
router.use(cookieParser());

/**
 * GET /invite/validate  (public — no auth, token from email link query param)
 * Must be registered BEFORE /:tenantId to avoid param conflict.
 * Returns: { tenantId, tenantName, email, role }
 */
router.get('/invite/validate', tenantController.validateInviteToken);

/**
 * @swagger
 * tags:
 *   name: tenants
 *   description: Tenant profile and member management
 */

/**
 * @swagger
 * /tenants/{tenantId}:
 *   get:
 *     summary: Get tenant profile
 *     description: |
 *       Fetches the tenant's profile, including billing address and current plan name.
 *       Requires tenantScope middleware — cross-tenant reads are blocked (TENANT_SCOPE_VIOLATION).
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tenant profile
 *       403:
 *         description: Cross-tenant access denied (TENANT_SCOPE_VIOLATION)
 */
router.get(
  '/:tenantId',
  authenticate,
  tenantScope(),
  tenantController.getTenant
);

/**
 * @swagger
 * /tenants/{tenantId}:
 *   patch:
 *     summary: Update tenant profile
 *     description: |
 *       Updatable: name, billingEmail, billingAddress, taxId, timezone.
 *       NOT updatable: slug, currency, status, ownerId.
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tenant updated
 *       403:
 *         description: Not authorized
 */
router.patch(
  '/:tenantId',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(updateTenantSchema),
  tenantController.updateTenant
);

/**
 * @swagger
 * /tenants/{tenantId}/logo:
 *   post:
 *     summary: Upload tenant logo
 *     description: |
 *       Accepts multipart/form-data with field name 'logo'.
 *       Crops to 200×200 WebP. Deletes old Cloudinary asset if present.
 *       Invalidates Redis tenant context cache.
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Logo uploaded, returns logoUrl
 *       422:
 *         description: No file provided
 */
router.post(
  '/:tenantId/logo',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  imageUpload.single('logo'),
  tenantController.uploadLogo
);

/**
 * @swagger
 * /tenants/{tenantId}/members:
 *   get:
 *     summary: List tenant members
 *     description: Returns paginated list of active and invited members.
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated member list
 */
router.get(
  '/:tenantId/members',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  tenantController.getMembers
);

/**
 * @swagger
 * /tenants/{tenantId}/members/invite:
 *   post:
 *     summary: Invite a new member
 *     description: |
 *       Seat check is performed FIRST using tenantContext (no extra DB query).
 *       Invited users immediately consume a seat before accepting.
 *       Returns 422 SEAT_LIMIT_EXCEEDED if tenant is at capacity.
 *       Returns 409 USER_ALREADY_MEMBER if email already exists in this tenant.
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string, format: email }
 *               role:  { type: string, enum: [tenant_member, finance_member] }
 *     responses:
 *       201:
 *         description: Invitation sent
 *       409:
 *         description: USER_ALREADY_MEMBER
 *       422:
 *         description: SEAT_LIMIT_EXCEEDED
 */
router.post(
  '/:tenantId/members/invite',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(inviteMemberSchema),
  tenantController.inviteMember
);

/**
 * @swagger
 * /tenants/{tenantId}/members/accept-invite:
 *   post:
 *     summary: Accept a member invitation
 *     description: |
 *       Auth: None (token from email link).
 *       Sets password, activates user, auto-logs in (returns access token + refresh cookie).
 *     tags: [tenants]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, firstName, lastName, password]
 *             properties:
 *               token:     { type: string, format: uuid }
 *               firstName: { type: string }
 *               lastName:  { type: string }
 *               password:  { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Invite accepted, access token + refresh cookie returned
 *       400:
 *         description: INVITE_TOKEN_INVALID or INVITE_TOKEN_EXPIRED
 */
router.post(
  '/:tenantId/members/accept-invite',
  validate(acceptInviteSchema),
  tenantController.acceptInvite
);

/**
 * @swagger
 * /tenants/{tenantId}/members/{userId}:
 *   delete:
 *     summary: Remove a member
 *     description: |
 *       Soft-delete: sets user.status=deleted. Cannot remove owner. Cannot self-remove.
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Member removed
 *       403:
 *         description: Cannot remove owner or self
 */
router.delete(
  '/:tenantId/members/:userId',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  tenantController.removeMember
);

/**
 * @swagger
 * /tenants/{tenantId}/members/{userId}/role:
 *   patch:
 *     summary: Change a member's role
 *     tags: [tenants]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [tenant_admin, tenant_member, finance_member] }
 *     responses:
 *       200:
 *         description: Role updated
 *       403:
 *         description: Cannot change owner role
 */
router.patch(
  '/:tenantId/members/:userId/role',
  authenticate,
  tenantScope(),
  authorize('tenant_admin', 'super_admin'),
  validate(changeMemberRoleSchema),
  tenantController.changeMemberRole
);

module.exports = router;
