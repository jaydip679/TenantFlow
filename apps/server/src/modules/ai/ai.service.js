'use strict';

/**
 * AI Service
 *
 * Implements all AI-powered features:
 *   - computeChurnSignals() — MongoDB aggregation pipelines for signal bundle
 *   - getChurnScore()       — Cache-first churn score retrieval
 *   - triggerChurnAnalysis() — Enqueue churn analysis job
 *   - getAllChurnScores()   — Admin: all tenants sorted by risk
 *   - chatWithBillingAssistant() — Streaming SSE billing chat
 *
 * AI Provider:
 *   Determined by AI_PROVIDER env var: 'openai' | 'gemini'
 *   Both providers are supported with the same interface.
 *
 * Services NEVER accept req/res objects.
 *
 * REF: docs/SYSTEM_DESIGN.md §11 — AI Integration Architecture
 * REF: docs/SRS.md §10 — AI Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.3
 */

const { subDays, differenceInDays, differenceInMonths } = require('date-fns');
const TenantChurnScore = require('../../models/TenantChurnScore.model');
const Tenant           = require('../../models/Tenant.model');
const Subscription     = require('../../models/Subscription.model');
const Plan             = require('../../models/Plan.model');
const Invoice          = require('../../models/Invoice.model');
const AuditLog         = require('../../models/AuditLog.model');
const { AppError }     = require('../../shared/errors/AppError');
const { parsePagination, paginationMeta } = require('../../shared/utils/pagination');
const redisClient      = require('../../config/redis');
const logger           = require('../../shared/utils/logger');
const { CHURN_ANALYSIS_PROMPT, BILLING_ASSISTANT_SYSTEM_PROMPT } = require('./ai.prompts');

const CHURN_CACHE_TTL = 3600;  // 1 hour
const HIGH_RISK_THRESHOLD = 75;

// ── AI Provider Factory ───────────────────────────────────────
/**
 * Get the AI provider client (OpenAI or Gemini) based on AI_PROVIDER env var.
 * Lazy-initialised to avoid import errors when API keys are not needed in tests.
 */
let _openaiClient = null;
let _geminiClient = null;

const getOpenAIClient = () => {
  if (!_openaiClient) {
    const { OpenAI } = require('openai');
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
};

const getGeminiClient = () => {
  if (!_geminiClient) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    _geminiClient = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }
  return _geminiClient;
};

// ── computeChurnSignals() ─────────────────────────────────────
/**
 * Run MongoDB aggregation pipelines in parallel to build a signal bundle.
 *
 * Signals computed:
 *   - login_events_30d:       Distinct login audit log events in last 30 days
 *   - login_events_7d:        Distinct login events in last 7 days
 *   - login_trend_pct:        (7d / 30d * 4) — week-over-week trend percentage
 *   - seat_utilization_pct:   usedSeats / totalSeats * 100
 *   - payment_failures_90d:   Failed transactions in last 90 days
 *   - last_plan_change_days:  Days since last subscription_changed event
 *   - days_until_renewal:     Days until currentPeriodEnd
 *   - plan_name:              Current plan name
 *   - months_as_customer:     Months since tenant.createdAt
 *
 * @param {string} tenantId
 * @returns {Promise<Object>} — Signal bundle
 */
const computeChurnSignals = async (tenantId) => {
  const now      = new Date();
  const ago30d   = subDays(now, 30);
  const ago90d   = subDays(now, 90);

  // Run all aggregations in parallel
  const [
    subscription,
    loginCount30d,
    loginCount7d,
    paymentFailures,
    lastPlanChange,
    tenant,
  ] = await Promise.all([
    // Subscription + plan
    Subscription.findOne({ tenantId })
      .populate('planVersionId', 'name')
      .lean(),

    // Login events in last 30 days (audit_logs)
    AuditLog.countDocuments({
      tenantId,
      event:     'auth.login',
      createdAt: { $gte: ago30d },
    }),

    // Login events in last 7 days
    AuditLog.countDocuments({
      tenantId,
      event:     'auth.login',
      createdAt: { $gte: subDays(now, 7) },
    }),

    // Payment failures in last 90 days
    (() => {
      const PaymentTransaction = require('../../models/PaymentTransaction.model');
      return PaymentTransaction.countDocuments({
        tenantId,
        status:    'failed',
        createdAt: { $gte: ago90d },
      });
    })(),

    // Last plan change event
    AuditLog.findOne({
      tenantId,
      event: 'subscription.plan_changed',
    })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean(),

    // Tenant base info
    Tenant.findById(tenantId).select('createdAt name').lean(),
  ]);

  const planName      = subscription?.planVersionId?.name || 'Unknown';
  const usedSeats     = subscription?.usedSeats || 0;
  const totalSeats    = subscription?.totalSeats || 1;
  const periodEnd     = subscription?.currentPeriodEnd;
  const daysUntilRenewal = periodEnd ? differenceInDays(new Date(periodEnd), now) : null;
  const monthsAsCustomer = tenant?.createdAt
    ? differenceInMonths(now, new Date(tenant.createdAt))
    : 0;
  const lastPlanChangeDays = lastPlanChange?.createdAt
    ? differenceInDays(now, new Date(lastPlanChange.createdAt))
    : null;

  // Week-over-week login trend: (7d_logins / (30d_logins / 4) - 1) * 100
  const weeklyAvg     = loginCount30d / 4;
  const loginTrendPct = weeklyAvg > 0
    ? Math.round(((loginCount7d - weeklyAvg) / weeklyAvg) * 100)
    : 0;

  return {
    login_events_30d:       loginCount30d,
    login_events_7d:        loginCount7d,
    login_trend_pct:        loginTrendPct,
    seat_utilization_pct:   Math.round((usedSeats / totalSeats) * 100),
    payment_failures_90d:   paymentFailures,
    last_plan_change_days:  lastPlanChangeDays,
    days_until_renewal:     daysUntilRenewal,
    plan_name:              planName,
    months_as_customer:     monthsAsCustomer,
  };
};

// ── _callAiProvider() ─────────────────────────────────────────
/**
 * Call the configured AI provider and return the raw response text.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
const _callAiProvider = async (prompt) => {
  const provider = process.env.AI_PROVIDER;

  if (provider === 'openai') {
    const openai   = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model:      'gpt-4o',
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 300,
    });
    return response.choices[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const model    = getGeminiClient();
    const result   = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new AppError('Invalid AI_PROVIDER configuration.', 500, 'AI_CONFIG_ERROR');
};

// ── _parseChurnResponse() ─────────────────────────────────────
/**
 * Parse and validate the AI JSON response for churn analysis.
 * Strips markdown fences if present.
 *
 * @param {string} rawText
 * @returns {{ churn_risk_score, risk_level, key_signals, recommended_action }}
 */
const _parseChurnResponse = (rawText) => {
  // Strip markdown code fences (```json ... ```)
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AppError(`AI returned invalid JSON: ${cleaned.slice(0, 100)}`, 500, 'AI_PARSE_ERROR');
  }

  // Validate required fields
  const { churn_risk_score, risk_level, key_signals, recommended_action } = parsed;
  if (
    typeof churn_risk_score !== 'number' ||
    !['low', 'medium', 'high'].includes(risk_level) ||
    !Array.isArray(key_signals)
  ) {
    throw new AppError('AI response missing required fields.', 500, 'AI_PARSE_ERROR');
  }

  return { churn_risk_score, risk_level, key_signals, recommended_action };
};

// ── getChurnScore() ───────────────────────────────────────────
/**
 * Cache-first retrieval of the latest churn score for a tenant.
 *
 * @param {string} tenantId
 * @returns {Promise<TenantChurnScore|null>}
 */
const getChurnScore = async (tenantId) => {
  const cacheKey = `ai:churn:${tenantId}`;

  // Check Redis cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.debug({ tenantId }, 'Churn score cache hit');
      return JSON.parse(cached);
    }
  } catch (redisErr) {
    logger.warn({ err: redisErr.message }, 'Redis unavailable for churn cache — falling back to DB');
  }

  // Cache miss — query DB
  const score = await TenantChurnScore.findOne({ tenantId }).lean();

  if (score) {
    // Cache result (TTL 1 hour)
    await redisClient.set(cacheKey, JSON.stringify(score), 'EX', CHURN_CACHE_TTL).catch(() => {});
  }

  return score || null;
};

// ── triggerChurnAnalysis() ────────────────────────────────────
/**
 * Compute churn signals and enqueue an AI analysis job.
 * Called by the churn analysis cron and the manual trigger endpoint.
 *
 * @param {string} tenantId
 * @returns {Promise<import('bullmq').Job>}
 */
const triggerChurnAnalysis = async (tenantId) => {
  const signals = await computeChurnSignals(tenantId);
  const { enqueueAiJob } = require('../../queues/ai.queue');
  return enqueueAiJob({ tenantId, signals });
};

// ── runChurnAnalysis() — called by ai.worker.js ───────────────
/**
 * Perform the actual AI analysis and persist results.
 * Called by ai.worker.js, not by HTTP layer.
 *
 * @param {string} tenantId
 * @param {Object} signals
 * @returns {Promise<TenantChurnScore>}
 */
const runChurnAnalysis = async (tenantId, signals) => {
  const { prompt, hash } = CHURN_ANALYSIS_PROMPT(signals);
  const aiProvider = process.env.AI_PROVIDER === 'gemini' ? 'gemini-1.5-pro' : 'gpt-4o';

  let rawText;
  try {
    rawText = await _callAiProvider(prompt);
  } catch (err) {
    throw new AppError(`AI provider call failed: ${err.message}`, 503, 'AI_SERVICE_UNAVAILABLE');
  }

  const { churn_risk_score, risk_level, key_signals, recommended_action } = _parseChurnResponse(rawText);

  // Upsert TenantChurnScore (one document per tenant)
  const score = await TenantChurnScore.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        churnRiskScore:      Math.round(churn_risk_score),
        riskLevel:           risk_level,
        keySignals:          key_signals,
        recommendedAction:   recommended_action,
        signals:             signals,
        aiModel:             aiProvider,
        analysisPromptHash:  hash,
        updatedAt:           new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // Invalidate Redis cache
  await redisClient.del(`ai:churn:${tenantId}`).catch(() => {});

  logger.info({ tenantId, churnRiskScore: score.churnRiskScore, riskLevel: score.riskLevel }, 'Churn analysis complete');

  // Proactive outreach email if score > 75 and not yet sent
  if (score.churnRiskScore > HIGH_RISK_THRESHOLD && !score.outreachEmailSent) {
    try {
      const { enqueueEmail } = require('../../queues/email.queue');
      const tenant = await Tenant.findById(tenantId).select('name').lean();

      await enqueueEmail({
        type:      'churn_risk_high',
        tenantId,
        templateVars: {
          tenantName:        tenant?.name || 'Unknown',
          churnRiskScore:    score.churnRiskScore,
          keySignals:        score.keySignals,
          recommendedAction: score.recommendedAction,
        },
      });

      // Mark email as sent to prevent duplicate outreach
      await TenantChurnScore.findByIdAndUpdate(score._id, {
        outreachEmailSent:    true,
        outreachEmailSentAt:  new Date(),
      });

      logger.info({ tenantId, churnRiskScore: score.churnRiskScore }, 'High churn risk outreach email enqueued');
    } catch (emailErr) {
      logger.warn({ err: emailErr.message }, 'Failed to enqueue churn outreach email');
    }
  }

  return score;
};

// ── getAllChurnScores() ───────────────────────────────────────
/**
 * Get all churn scores sorted by risk (highest first).
 * For super admin only.
 *
 * @param {Object} options - { page, limit }
 * @returns {Promise<{ scores, pagination }>}
 */
const getAllChurnScores = async (options = {}) => {
  const { page, limit, skip } = parsePagination(options);

  const [scores, total] = await Promise.all([
    TenantChurnScore.find({})
      .sort({ churnRiskScore: -1 })
      .skip(skip)
      .limit(limit)
      .populate('tenantId', 'name slug status')
      .lean(),
    TenantChurnScore.countDocuments({}),
  ]);

  return { scores, pagination: paginationMeta(total, page, limit) };
};

// ── chatWithBillingAssistant() ────────────────────────────────
/**
 * Stream a billing assistant response as Server-Sent Events.
 * Returns an async iterable of chunks (OpenAI) or a string (Gemini).
 *
 * The controller pipes this to the SSE response stream.
 * Plan feature gate (ai_assistant) is enforced at the controller/middleware level.
 *
 * @param {string}  tenantId
 * @param {string}  message
 * @param {Array}   conversationHistory - [{ role, content }, ...]
 * @returns {Promise<AsyncIterable>}
 */
const chatWithBillingAssistant = async (tenantId, message, conversationHistory = []) => {
  // Load tenant billing context
  const [tenant, subscription, recentInvoices] = await Promise.all([
    Tenant.findById(tenantId).select('name status').lean(),
    Subscription.findOne({ tenantId }).populate('planVersionId', 'name maxSeats').lean(),
    Invoice.find({ tenantId }).sort({ createdAt: -1 }).limit(3).lean(),
  ]);

  // Extract plan from populated planVersionId
  const plan = subscription?.planVersionId || null;

  const systemPrompt = BILLING_ASSISTANT_SYSTEM_PROMPT({
    tenant,
    subscription,
    plan,
    recentInvoices,
  });

  // Cap conversation history at 10 messages (5 turns) to manage token budget
  const cappedHistory = (conversationHistory || []).slice(-10);

  const provider = process.env.AI_PROVIDER;

  if (provider === 'openai') {
    const openai = getOpenAIClient();
    const stream = await openai.chat.completions.create({
      model:      'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...cappedHistory,
        { role: 'user', content: message },
      ],
      max_tokens: 500,
      stream:     true,
    });
    return stream;
  }

  if (provider === 'gemini') {
    // Gemini does not natively support SSE streaming in the same way.
    // We build a full response and return a fake async iterable for compatibility.
    const model   = getGeminiClient();
    const fullMsg = `${systemPrompt}\n\nUser: ${message}`;
    const result  = await model.generateContent(fullMsg);
    const text    = result.response.text();

    // Wrap as fake async iterable compatible with the SSE controller
    const chunks  = text.match(/.{1,20}/g) || [text];
    async function* geminiStream() {
      for (const chunk of chunks) {
        yield { choices: [{ delta: { content: chunk } }] };
      }
    }
    return geminiStream();
  }

  throw new AppError('Invalid AI_PROVIDER configuration.', 500, 'AI_CONFIG_ERROR');
};

module.exports = {
  computeChurnSignals,
  getChurnScore,
  triggerChurnAnalysis,
  runChurnAnalysis,
  getAllChurnScores,
  chatWithBillingAssistant,
};
