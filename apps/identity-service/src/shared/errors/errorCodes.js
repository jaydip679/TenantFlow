'use strict';

/**
 * Error Code Registry
 *
 * All machine-readable error codes used throughout the application.
 * Controllers and services throw AppError with these codes.
 * The globalErrorHandler returns these codes in the JSON error response.
 *
 * Format: DOMAIN_DESCRIPTION (UPPER_SNAKE_CASE)
 * Client applications use these codes for i18n and specific error handling.
 *
 * REF: docs/SYSTEM_DESIGN.md §14.2 — Error Code Registry
 */

const ERROR_CODES = {
  // ── Generic ──────────────────────────────────────────────
  VALIDATION_ERROR:          'VALIDATION_ERROR',
  NOT_FOUND:                 'NOT_FOUND',
  INTERNAL_ERROR:            'INTERNAL_ERROR',
  FORBIDDEN:                 'FORBIDDEN',
  UNAUTHORIZED:              'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED:       'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE:       'SERVICE_UNAVAILABLE',
  BAD_GATEWAY:               'BAD_GATEWAY',

  // ── Auth ─────────────────────────────────────────────────
  AUTH_EMAIL_EXISTS:          'AUTH_EMAIL_EXISTS',
  AUTH_INVALID_CREDENTIALS:   'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_NOT_VERIFIED:    'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_ACCOUNT_SUSPENDED:     'AUTH_ACCOUNT_SUSPENDED',
  AUTH_TOKEN_EXPIRED:         'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID:         'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_MISSING:         'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_BLACKLISTED:     'AUTH_TOKEN_BLACKLISTED',
  AUTH_REFRESH_INVALID:       'AUTH_REFRESH_INVALID',
  AUTH_REFRESH_EXPIRED:       'AUTH_REFRESH_EXPIRED',
  AUTH_REFRESH_REUSE:         'AUTH_REFRESH_REUSE',
  AUTH_OTP_EXPIRED:           'AUTH_OTP_EXPIRED',
  AUTH_OTP_INVALID:           'AUTH_OTP_INVALID',
  AUTH_OTP_MAX_ATTEMPTS:      'AUTH_OTP_MAX_ATTEMPTS',
  AUTH_INSUFFICIENT_ROLE:     'AUTH_INSUFFICIENT_ROLE',

  // ── Tenant ───────────────────────────────────────────────
  TENANT_NOT_FOUND:                 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED:                 'TENANT_SUSPENDED',
  TENANT_SCOPE_MISMATCH:            'TENANT_SCOPE_MISMATCH',
  TENANT_SCOPE_VIOLATION:           'TENANT_SCOPE_VIOLATION',
  TENANT_CANCELLED:                 'TENANT_CANCELLED',

  // ── Users / Members ──────────────────────────────────────
  USER_NOT_FOUND:             'USER_NOT_FOUND',
  USER_ALREADY_MEMBER:        'USER_ALREADY_MEMBER',
  USER_CANNOT_REMOVE_OWNER:   'USER_CANNOT_REMOVE_OWNER',
  USER_CANNOT_SELF_REMOVE:    'USER_CANNOT_SELF_REMOVE',
  INVITE_TOKEN_INVALID:       'INVITE_TOKEN_INVALID',
  INVITE_TOKEN_EXPIRED:       'INVITE_TOKEN_EXPIRED',

  // ── Plans ────────────────────────────────────────────────
  PLAN_NOT_FOUND:                      'PLAN_NOT_FOUND',
  PLAN_ARCHIVED:                       'PLAN_ARCHIVED',
  PLAN_HAS_ACTIVE_SUBS:                'PLAN_HAS_ACTIVE_SUBS',
  PLAN_HAS_ACTIVE_SUBSCRIPTIONS:       'PLAN_HAS_ACTIVE_SUBSCRIPTIONS',

  // ── Subscriptions ────────────────────────────────────────
  SUBSCRIPTION_NOT_FOUND:           'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_INVALID_TRANSITION:  'SUBSCRIPTION_INVALID_TRANSITION',
  SUBSCRIPTION_ALREADY_CANCELLED:   'SUBSCRIPTION_ALREADY_CANCELLED',
  UPGRADE_REQUIRED:                 'UPGRADE_REQUIRED',       // Target plan must be higher-priced
  DOWNGRADE_REQUIRED:               'DOWNGRADE_REQUIRED',     // Target plan must be lower-priced
  SEAT_CONFLICT:                    'SEAT_CONFLICT',          // New plan has fewer seats than active members
  NO_PENDING_DOWNGRADE:             'NO_PENDING_DOWNGRADE',

  // ── Seats ────────────────────────────────────────────────
  SEAT_LIMIT_EXCEEDED:        'SEAT_LIMIT_EXCEEDED',

  // ── Invoices ─────────────────────────────────────────────
  INVOICE_NOT_FOUND:          'INVOICE_NOT_FOUND',
  INVOICE_ALREADY_PAID:       'INVOICE_ALREADY_PAID',
  INVOICE_NOT_OPEN:           'INVOICE_NOT_OPEN',
  INVOICE_VOID:               'INVOICE_VOID',
  INVOICE_LOCK_HELD:          'INVOICE_LOCK_HELD',
  INVOICE_DUPLICATE:          'INVOICE_DUPLICATE',
  PDF_NOT_READY:              'PDF_NOT_READY',

  // ── Payments ─────────────────────────────────────────────
  PAYMENT_NOT_FOUND:          'PAYMENT_NOT_FOUND',
  PAYMENT_SIGNATURE_INVALID:  'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_ALREADY_PROCESSED:  'PAYMENT_ALREADY_PROCESSED',
  PAYMENT_ORDER_EXISTS:       'PAYMENT_ORDER_EXISTS',
  REFUND_NOT_ELIGIBLE:        'REFUND_NOT_ELIGIBLE',
  RAZORPAY_ERROR:             'RAZORPAY_ERROR',

  // ── Dunning ──────────────────────────────────────────────
  DUNNING_RECORD_NOT_FOUND:   'DUNNING_RECORD_NOT_FOUND',
  DUNNING_ALREADY_RESOLVED:   'DUNNING_ALREADY_RESOLVED',
  DUNNING_LOCK_HELD:          'DUNNING_LOCK_HELD',

  // ── Notifications ────────────────────────────────────────
  NOTIFICATION_NOT_FOUND:     'NOTIFICATION_NOT_FOUND',

  // ── AI ───────────────────────────────────────────────────
  AI_PROVIDER_ERROR:          'AI_PROVIDER_ERROR',
  AI_RESPONSE_INVALID:        'AI_RESPONSE_INVALID',
  AI_FEATURE_DISABLED:        'AI_FEATURE_DISABLED',
  AI_SERVICE_UNAVAILABLE:     'AI_SERVICE_UNAVAILABLE',   // 503 — AI API is down
  FEATURE_NOT_AVAILABLE:      'FEATURE_NOT_AVAILABLE',    // 403 — Plan doesn't include feature
  AI_CONFIG_ERROR:            'AI_CONFIG_ERROR',           // 500 — Invalid AI_PROVIDER config
  AI_PARSE_ERROR:             'AI_PARSE_ERROR',            // 500 — AI returned unparseable JSON

  // ── Webhooks ─────────────────────────────────────────────
  WEBHOOK_SIGNATURE_INVALID:  'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_DUPLICATE:          'WEBHOOK_DUPLICATE',
};

module.exports = { ERROR_CODES };
