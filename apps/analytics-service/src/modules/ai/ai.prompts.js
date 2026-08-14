'use strict';

/**
 * AI Prompt Templates
 *
 * Centralised prompt templates for all AI features.
 * Keeping prompts here (not inline in services) allows:
 *   - Easy iteration and A/B testing
 *   - SHA-256 hashing for audit trail
 *   - Version control of prompt changes
 *
 * REF: docs/SYSTEM_DESIGN.md §11.2 — Churn Analysis Prompt Template
 * REF: docs/SYSTEM_DESIGN.md §11.3 — AI Billing Chat Architecture
 * REF: docs/SRS.md §10 — AI Module
 */

const crypto = require('crypto');

// ── Churn Analysis Prompt ─────────────────────────────────────
/**
 * Build the churn analysis prompt for a given signal bundle.
 * Returns both the prompt string and its SHA-256 hash (for audit).
 *
 * @param {Object} signals
 * @returns {{ prompt: string, hash: string }}
 */
const CHURN_ANALYSIS_PROMPT = (signals) => {
  const prompt = `You are a SaaS customer success AI analyzing subscription health signals.

Tenant signals (last 30-90 days):
- Daily active logins (30d avg): ${signals.login_events_30d ?? 'N/A'}
- Week-over-week login change: ${signals.login_trend_pct ?? 0}%
- Seat utilization: ${signals.seat_utilization_pct ?? 0}%
- Payment failures (90d): ${signals.payment_failures_90d ?? 0}
- Days since last plan change: ${signals.last_plan_change_days ?? 'N/A'}
- Days until renewal: ${signals.days_until_renewal ?? 'N/A'}
- Plan tier: ${signals.plan_name ?? 'Unknown'}
- Months as customer: ${signals.months_as_customer ?? 0}

Analyze these signals and return ONLY a JSON object (no markdown, no explanation):
{
  "churn_risk_score": <integer 0-100>,
  "risk_level": "<low|medium|high>",
  "key_signals": ["<signal1>", "<signal2>"],
  "recommended_action": "<specific action for customer success team>"
}`;

  const hash = crypto.createHash('sha256').update(prompt).digest('hex');
  return { prompt, hash };
};

// ── Billing Assistant System Prompt ──────────────────────────
/**
 * Build the billing assistant system prompt with tenant context injected.
 *
 * @param {Object} context
 * @param {Object} context.tenant
 * @param {Object} context.subscription
 * @param {Object} context.plan
 * @param {Array}  context.recentInvoices
 * @returns {string}
 */
const BILLING_ASSISTANT_SYSTEM_PROMPT = ({ tenant, subscription, plan, recentInvoices }) => {
  const invoiceSummary = (recentInvoices || [])
    .slice(0, 3)
    .map((inv, i) => {
      const amountInRupees = ((inv.total || 0) / 100).toFixed(2);
      const status = inv.status || 'unknown';
      const date   = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : 'N/A';
      return `  ${i + 1}. ${inv.invoiceNumber || 'INV-?'} — ₹${amountInRupees} — ${status} — ${date}`;
    })
    .join('\n') || '  No invoices found.';

  const seatUsed  = subscription?.usedSeats ?? 0;
  const seatTotal = subscription?.totalSeats ?? (plan?.maxSeats ?? 0);
  const subStatus = subscription?.status ?? 'unknown';
  const planName  = plan?.name ?? 'Unknown';
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')
    : 'N/A';

  return `You are a helpful AI billing assistant for ${tenant?.name ?? 'this company'}.
You help tenant admins understand their billing, invoices, and subscription details.

Current tenant billing context:
- Tenant: ${tenant?.name ?? 'Unknown'}
- Plan: ${planName}
- Subscription status: ${subStatus}
- Seats used / available: ${seatUsed} / ${seatTotal}
- Next billing date: ${periodEnd}

Recent invoices (latest 3):
${invoiceSummary}

Guidelines:
- Answer only billing, subscription, and invoice-related questions
- Be concise and helpful
- Reference specific invoice numbers and dates when relevant
- If the user asks about something outside billing, politely redirect them
- All amounts are in Indian Rupees (₹)
- Do not make up information — say "I don't have that information" if unsure
- Keep responses under 200 words`;
};

module.exports = { CHURN_ANALYSIS_PROMPT, BILLING_ASSISTANT_SYSTEM_PROMPT };
