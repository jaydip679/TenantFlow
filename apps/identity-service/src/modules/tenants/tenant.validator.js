'use strict';

/**
 * Tenant Validators
 * REF: docs/SRS.md §3 — Tenants Module
 */

const Joi = require('joi');

const billingAddressSchema = Joi.object({
  line1:      Joi.string().max(100).optional(),
  line2:      Joi.string().max(100).allow('', null).optional(),
  city:       Joi.string().max(100).optional(),
  state:      Joi.string().max(100).optional(),
  country:    Joi.string().length(2).uppercase().default('IN').optional(),
  postalCode: Joi.string().max(20).optional(),
});

const updateTenantSchema = Joi.object({
  body: Joi.object({
    name:           Joi.string().trim().min(2).max(100),
    billingEmail:   Joi.string().email().lowercase(),
    billingAddress: billingAddressSchema,
    taxId:          Joi.string().max(50).allow('', null),
    timezone:       Joi.string().max(60),
  }).min(1),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const inviteMemberSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().lowercase().required(),
    role:  Joi.string().valid('tenant_member', 'finance_member').required(),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const acceptInviteSchema = Joi.object({
  body: Joi.object({
    token:     Joi.string().uuid().required(),
    firstName: Joi.string().trim().min(1).max(50).required(),
    lastName:  Joi.string().trim().min(1).max(50).required(),
    password:  Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character.',
      }),
  }),
  params: Joi.object({ tenantId: Joi.string().required() }),
  query:  Joi.object(),
});

const changeMemberRoleSchema = Joi.object({
  body: Joi.object({
    role: Joi.string().valid('tenant_admin', 'tenant_member', 'finance_member').required(),
  }),
  params: Joi.object({
    tenantId: Joi.string().required(),
    userId:   Joi.string().required(),
  }),
  query: Joi.object(),
});

module.exports = {
  updateTenantSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
};
