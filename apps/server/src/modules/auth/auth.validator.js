'use strict';

/**
 * Auth Validators — Joi Schemas
 *
 * One schema per endpoint request body.
 * All schemas use abortEarly: false (done in validate.middleware).
 * All schemas strip unknown fields (done in validate.middleware).
 *
 * REF: docs/SRS.md §2.1 — Validation rules per endpoint
 */

const Joi = require('joi');

// ── Reusable Field Definitions ────────────────────────────────

/**
 * Password must contain: uppercase, lowercase, digit, special char.
 * Min 8 chars. Matches SRS §2.1 validation rules.
 */
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#\-_])[A-Za-z\d@$!%*?&^#\-_]+$/)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain at least one uppercase letter, lowercase letter, number, and special character',
    'string.min':          'Password must be at least 8 characters',
  });

const nameSchema = (field) =>
  Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s'-]+$/)
    .required()
    .messages({
      'string.pattern.base': `${field} can only contain letters, spaces, hyphens, and apostrophes`,
    });

const emailSchema = Joi.string().email({ tlds: { allow: false } }).lowercase().max(255).required();
const otpSchema   = Joi.string().length(6).pattern(/^\d{6}$/).required()
  .messages({ 'string.pattern.base': 'OTP must be a 6-digit number' });

// ── Request Body Schemas ──────────────────────────────────────

const registerSchema = Joi.object({
  email:       emailSchema,
  password:    passwordSchema,
  firstName:   nameSchema('First name'),
  lastName:    nameSchema('Last name'),
  companyName: Joi.string().trim().min(2).max(100).required(),
});

const verifyEmailSchema = Joi.object({
  email: emailSchema,
  otp:   otpSchema,
});

const loginSchema = Joi.object({
  email:    emailSchema,
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: emailSchema,
});

const resetPasswordSchema = Joi.object({
  email:       emailSchema,
  otp:         otpSchema,
  newPassword: passwordSchema,
});

const updateMeSchema = Joi.object({
  firstName: nameSchema('First name').optional(),
  lastName:  nameSchema('Last name').optional(),
  notificationPreferences: Joi.object({
    email: Joi.boolean(),
    inApp: Joi.boolean(),
  }).optional(),
}).min(1);

module.exports = {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateMeSchema,
};
