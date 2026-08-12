'use strict';

/**
 * Email HTML Templates
 *
 * Pure functions returning { subject, html } for each email type.
 * HTML uses inline CSS for Gmail compatibility.
 * All templates use a shared header + footer layout.
 *
 * REF: docs/SRS.md §16 — Email Template Specifications
 */

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ── Shared Layout Helpers ─────────────────────────────────────

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f6f9; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 32px 40px; text-align: center; }
  .header-title { color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
  .body { padding: 40px; color: #374151; line-height: 1.6; }
  .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #111827; }
  .text { font-size: 15px; color: #4b5563; margin-bottom: 16px; }
  .otp-box { background: #f3f4f6; border: 2px dashed #6366f1; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0; }
  .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; font-family: monospace; }
  .otp-expiry { font-size: 13px; color: #9ca3af; margin-top: 8px; }
  .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 24px 0; }
  .btn-danger { background: #dc2626; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  .footer { background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb; }
  .footer-text { font-size: 12px; color: #9ca3af; margin: 0; line-height: 1.8; }
`;

const renderEmail = (header, body) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${header}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">⚡ TenantFlow</p>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p class="footer-text">
        © ${new Date().getFullYear()} TenantFlow. All rights reserved.<br>
        You're receiving this email because you have an account on TenantFlow.<br>
        <a href="${CLIENT_URL}" style="color: #6366f1;">Visit Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

// ── Templates ─────────────────────────────────────────────────

/**
 * REF: docs/SRS.md §16.1 — welcome template
 */
const welcomeTemplate = ({ firstName, tenantName }) => ({
  subject: `Welcome to TenantFlow — let's get started`,
  html: renderEmail('Welcome to TenantFlow', `
    <p class="greeting">Welcome aboard, ${firstName}! 👋</p>
    <p class="text">
      Your account for <strong>${tenantName}</strong> has been successfully verified and is ready to use.
    </p>
    <p class="text">
      TenantFlow helps you manage your subscriptions, billing, and team — all in one place.
      Start by exploring your dashboard.
    </p>
    <div style="text-align: center;">
      <a href="${CLIENT_URL}/dashboard" class="btn">Go to Dashboard</a>
    </div>
    <hr class="divider">
    <p class="text" style="font-size: 13px;">
      If you need help getting started, our support team is here for you.
    </p>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — email_otp template
 */
const emailOtpTemplate = ({ firstName, otp, expiresInMinutes = 10 }) => ({
  subject: `Your TenantFlow verification code: ${otp}`,
  html: renderEmail('Email Verification', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text">Use the verification code below to confirm your email address.</p>
    <div class="otp-box">
      <p class="otp-code">${otp}</p>
      <p class="otp-expiry">Expires in ${expiresInMinutes} minutes · Do not share this code</p>
    </div>
    <p class="text">
      If you did not register for a TenantFlow account, you can safely ignore this email.
    </p>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — password_reset template
 */
const passwordResetTemplate = ({ firstName, otp, expiresInMinutes = 10 }) => ({
  subject: `Reset your TenantFlow password`,
  html: renderEmail('Password Reset', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text">
      We received a request to reset your password. Use the code below to proceed.
    </p>
    <div class="otp-box">
      <p class="otp-code">${otp}</p>
      <p class="otp-expiry">Expires in ${expiresInMinutes} minutes · One-time use only</p>
    </div>
    <p class="text">
      If you did not request a password reset, please ignore this email.
      Your password will remain unchanged.
    </p>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — invoice_generated template
 */
const invoiceGeneratedTemplate = ({ firstName, invoiceNumber, amount, dueDate, viewUrl, payUrl }) => ({
  subject: `Invoice ${invoiceNumber} ready — ₹${(amount / 100).toFixed(2)}`,
  html: renderEmail('Invoice Ready', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text">Your invoice <strong>${invoiceNumber}</strong> for ₹${(amount / 100).toFixed(2)} is ready.</p>
    <p class="text">Due date: <strong>${new Date(dueDate).toLocaleDateString('en-IN')}</strong></p>
    <div style="text-align: center;">
      <a href="${payUrl}" class="btn">Pay Now</a>
      &nbsp;&nbsp;
      <a href="${viewUrl}" style="color: #4f46e5; font-size: 14px;">View Invoice</a>
    </div>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — payment_success template
 */
const paymentSuccessTemplate = ({ firstName, invoiceNumber, amount, paidAt, viewUrl }) => ({
  subject: `Payment confirmed — Invoice ${invoiceNumber}`,
  html: renderEmail('Payment Confirmed', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text" style="color: #16a34a; font-weight: 600;">✓ Payment of ₹${(amount / 100).toFixed(2)} received</p>
    <p class="text">Invoice <strong>${invoiceNumber}</strong> has been marked as paid on ${new Date(paidAt).toLocaleDateString('en-IN')}.</p>
    <div style="text-align: center;">
      <a href="${viewUrl}" class="btn">View Receipt</a>
    </div>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — payment_failed template
 */
const paymentFailedTemplate = ({ firstName, invoiceNumber, amount, retryUrl, daysUntilSuspension }) => ({
  subject: `Action required: Payment failed for ${invoiceNumber}`,
  html: renderEmail('Payment Failed', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text" style="color: #dc2626; font-weight: 600;">⚠ Payment of ₹${(amount / 100).toFixed(2)} could not be processed.</p>
    <p class="text">
      Invoice <strong>${invoiceNumber}</strong> remains unpaid. Please update your payment method
      to avoid service interruption. Your account may be suspended in
      <strong>${daysUntilSuspension} day${daysUntilSuspension !== 1 ? 's' : ''}</strong> if payment is not received.
    </p>
    <div style="text-align: center;">
      <a href="${retryUrl}" class="btn btn-danger">Retry Payment</a>
    </div>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — member_invite template
 */
const memberInviteTemplate = ({ inviterName, tenantName, role, acceptUrl, expiresAt }) => ({
  subject: `${inviterName} has invited you to ${tenantName}`,
  html: renderEmail('Team Invitation', `
    <p class="greeting">You're invited!</p>
    <p class="text">
      <strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong>
      on TenantFlow as a <strong>${role.replace('_', ' ')}</strong>.
    </p>
    <div style="text-align: center;">
      <a href="${acceptUrl}" class="btn">Accept Invitation</a>
    </div>
    <p class="text" style="font-size: 13px; color: #9ca3af;">
      This invitation expires on ${new Date(expiresAt).toLocaleDateString('en-IN')}.
    </p>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — trial_ending_soon template
 */
const trialEndingSoonTemplate = ({ firstName, daysRemaining, trialEndsAt, upgradeUrl }) => ({
  subject: `Your trial ends in ${daysRemaining} days — upgrade to continue`,
  html: renderEmail('Trial Ending Soon', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text">
      Your TenantFlow trial ends on <strong>${new Date(trialEndsAt).toLocaleDateString('en-IN')}</strong>
      — that's <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong> from now.
    </p>
    <p class="text">Upgrade to a paid plan to keep uninterrupted access to all features.</p>
    <div style="text-align: center;">
      <a href="${upgradeUrl}" class="btn">Upgrade Now</a>
    </div>
  `),
});

/**
 * REF: docs/SRS.md §16.1 — account_suspended template
 */
const accountSuspendedTemplate = ({ firstName, amount, payUrl, supportUrl }) => ({
  subject: `Account suspended — Resolve payment to restore access`,
  html: renderEmail('Account Suspended', `
    <p class="greeting">Hi ${firstName},</p>
    <p class="text" style="color: #dc2626; font-weight: 600;">Your TenantFlow account has been suspended due to an outstanding payment.</p>
    <p class="text">
      An outstanding balance of <strong>₹${(amount / 100).toFixed(2)}</strong> remains unpaid.
      Pay now to immediately restore access to your account and data.
    </p>
    <div style="text-align: center;">
      <a href="${payUrl}" class="btn btn-danger">Resolve Payment</a>
    </div>
    <p class="text" style="font-size: 13px;">
      Need help? <a href="${supportUrl}" style="color: #4f46e5;">Contact Support</a>
    </p>
  `),
});

module.exports = {
  welcomeTemplate,
  emailOtpTemplate,
  passwordResetTemplate,
  invoiceGeneratedTemplate,
  paymentSuccessTemplate,
  paymentFailedTemplate,
  memberInviteTemplate,
  trialEndingSoonTemplate,
  accountSuspendedTemplate,
};
