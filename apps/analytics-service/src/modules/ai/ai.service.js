'use strict';

const crypto = require('crypto');
const redisClient = require('../../config/redis');
const logger = require('../../shared/utils/logger');
const TenantChurnScore = require('../../models/TenantChurnScore.model');
const { AppError } = require('../../shared/errors/AppError');

const CHURN_CACHE_TTL = 3600; // 1 hour

// ── AI Prompt Construction ────────────────────────────────────
const CHURN_ANALYSIS_PROMPT = (signals) => {
  const prompt = `You are a SaaS Churn Prediction AI.
Analyze the following tenant signals and return a JSON object (strictly JSON, no markdown fences) containing a churn risk assessment.

Signals:
${JSON.stringify(signals, null, 2)}

Required JSON Output Format:
{
  "churn_risk_score": <number 0-100>,
  "risk_level": "<low|medium|high>",
  "key_signals": ["string", "string"],
  "recommended_action": "string"
}`;

  const hash = crypto.createHash('sha256').update(prompt).digest('hex');
  return { prompt, hash };
};

// ── AI Clients ────────────────────────────────────────────────
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

const _callAiProvider = async (prompt) => {
  const provider = process.env.AI_PROVIDER;

  if (provider === 'openai') {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    });
    return response.choices[0]?.message?.content || '';
  }

  if (provider === 'gemini' || !provider) { // Default to gemini
    const model = getGeminiClient();
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new AppError('Invalid AI_PROVIDER configuration.', 500, 'AI_CONFIG_ERROR');
};

const _parseChurnResponse = (rawText) => {
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AppError(`AI returned invalid JSON: ${cleaned.slice(0, 100)}`, 500, 'AI_PARSE_ERROR');
  }

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

// ── runChurnAnalysis() ─────────────────────────────────────────
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

  const score = await TenantChurnScore.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        churnRiskScore: churn_risk_score,
        riskLevel: risk_level,
        keySignals: key_signals,
        recommendedAction: recommended_action,
        signals: signals,
        aiModel: aiProvider,
        analysisPromptHash: hash,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const cacheKey = `ai:churn:${tenantId}`;
  await redisClient.set(cacheKey, JSON.stringify(score), 'EX', CHURN_CACHE_TTL).catch(() => {});

  return score;
};

// ── getChurnScore() ────────────────────────────────────────────
const getChurnScore = async (tenantId) => {
  const cacheKey = `ai:churn:${tenantId}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.debug({ tenantId }, 'Churn score cache hit');
      return JSON.parse(cached);
    }
  } catch (redisErr) {
    logger.warn({ err: redisErr.message }, 'Redis unavailable for churn cache — falling back to DB');
  }

  const score = await TenantChurnScore.findOne({ tenantId }).lean();
  if (score) {
    await redisClient.set(cacheKey, JSON.stringify(score), 'EX', CHURN_CACHE_TTL).catch(() => {});
  }
  return score || null;
};

// ── chat() ─────────────────────────────────────────────────────
const chat = async (message, context) => {
  const prompt = `You are the TenantFlow AI Assistant.
User Context: Tenant ${context.tenantId} | Role ${context.role}
User says: "${message}"

Respond concisely and professionally in plain text.`;

  const rawText = await _callAiProvider(prompt);
  return { reply: rawText.trim() };
};

module.exports = {
  runChurnAnalysis,
  getChurnScore,
  chat,
};
