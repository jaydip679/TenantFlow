'use strict';

/**
 * Email Worker
 *
 * BullMQ worker consuming 'email-queue' jobs.
 * Uses Nodemailer with SMTP transport for delivery.
 * Dispatches to the correct HTML template by job.data.type.
 *
 * Concurrency: 5 (process up to 5 emails simultaneously)
 * Retry policy: 3 attempts, exponential backoff (defined on queue)
 *
 * Templates implemented in Phase 1:
 *   - welcome
 *   - email_otp
 *   - password_reset
 *
 * Additional templates added in later phases as needed.
 *
 * REF: docs/SRS.md §16 — Email Template Specifications
 * REF: docs/SRS.md §14.1 — email-queue job payload
 * REF: docs/IMPLEMENTATION_ROADMAP.md §4.2 T1.4
 */

const { Worker }           = require('bullmq');
const nodemailer           = require('nodemailer');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/email.queue');
const {
  welcomeTemplate,
  emailOtpTemplate,
  passwordResetTemplate,
  invoiceGeneratedTemplate,
  paymentSuccessTemplate,
  paymentFailedTemplate,
  memberInviteTemplate,
  trialEndingSoonTemplate,
  accountSuspendedTemplate,
} = require('./email.templates');

// ── Nodemailer SMTP Transporter ───────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_PORT === '465', // true for 465 (SSL), false for 587 (TLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Template dispatcher — maps job type to HTML template function.
 * @param {string} type
 * @param {Object} data
 * @returns {{ subject: string, html: string }}
 */
const getEmailTemplate = (type, data) => {
  const templates = {
    welcome:             () => welcomeTemplate(data),
    email_otp:           () => emailOtpTemplate(data),
    password_reset:      () => passwordResetTemplate(data),
    invoice_generated:   () => invoiceGeneratedTemplate(data),
    payment_success:     () => paymentSuccessTemplate(data),
    payment_failed:      () => paymentFailedTemplate(data),
    member_invite:       () => memberInviteTemplate(data),
    trial_ending_soon:   () => trialEndingSoonTemplate(data),
    account_suspended:   () => accountSuspendedTemplate(data),
  };

  const templateFn = templates[type];
  if (!templateFn) {
    throw new Error(`Unknown email template type: '${type}'`);
  }
  return templateFn();
};

/**
 * Process a single email job.
 * @param {import('bullmq').Job} job
 */
const processEmailJob = async (job) => {
  const { type, to, firstName } = job.data;

  logger.info({ jobId: job.id, type, to }, 'Processing email job');

  const { subject, html } = getEmailTemplate(type, job.data);

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  logger.info({ jobId: job.id, type, to }, 'Email sent successfully');
};

// ── Worker Instance ───────────────────────────────────────────
const emailWorker = new Worker(QUEUE_NAME, processEmailJob, {
  connection:  bullmqConnection,
  concurrency: 5,
});

emailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, type: job.data.type, to: job.data.to }, 'Email job completed');
});

emailWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, type: job?.data?.type, to: job?.data?.to, err: err.message, attempts: job?.attemptsMade },
    'Email job failed'
  );
});

emailWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'Email worker error');
});

module.exports = { emailWorker };
