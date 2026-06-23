'use strict';

/**
 * AI Controller
 * Thin HTTP layer — delegates to aiService.
 * SSE streaming for /chat endpoint.
 *
 * REF: docs/SRS.md §10 — AI Module
 * REF: docs/IMPLEMENTATION_ROADMAP.md §11.1 T8.5
 */

const aiService       = require('./ai.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { AppError }    = require('../../shared/errors/AppError');
const { ERROR_CODES } = require('../../shared/errors/errorCodes');
const logger          = require('../../shared/utils/logger');

/**
 * GET /churn/:tenantId — Get latest churn score for a tenant
 */
const getChurnScore = asyncHandler(async (req, res) => {
  const score = await aiService.getChurnScore(req.params.tenantId);
  res.status(200).json({ success: true, data: score || null });
});

/**
 * GET /churn/all — All churn scores sorted by risk desc (super admin)
 */
const getAllChurnScores = asyncHandler(async (req, res) => {
  const { scores, pagination } = await aiService.getAllChurnScores({
    page:  req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json({ success: true, data: { scores, pagination } });
});

/**
 * POST /churn/trigger/:tenantId — Manually trigger churn analysis
 */
const triggerChurnAnalysis = asyncHandler(async (req, res) => {
  const job = await aiService.triggerChurnAnalysis(req.params.tenantId);
  res.status(202).json({
    success: true,
    data: { message: 'Churn analysis job enqueued.', jobId: job.id },
  });
});

/**
 * POST /chat — AI billing assistant (Server-Sent Events streaming)
 *
 * Validates:
 *   - Plan must have ai_assistant feature flag enabled
 * Sets SSE headers then streams delta chunks.
 */
const chat = asyncHandler(async (req, res) => {
  // Feature gate: plan must have ai_assistant flag
  const features = req.tenantContext?.features;
  if (!features?.ai_assistant) {
    throw new AppError(
      'AI assistant requires Growth plan or above.',
      403,
      ERROR_CODES.FEATURE_NOT_AVAILABLE
    );
  }

  const { message, conversationHistory } = req.body;
  const tenantId = req.tenantContext.tenantId;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.flushHeaders();

  let stream;
  try {
    stream = await aiService.chatWithBillingAssistant(tenantId, message, conversationHistory);
  } catch (err) {
    logger.error({ tenantId, err: err.message }, 'AI chat: failed to get stream');
    res.write(`data: ${JSON.stringify({ error: 'AI service unavailable. Please try again.' })}\n\n`);
    res.end();
    return;
  }

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (streamErr) {
    logger.error({ tenantId, err: streamErr.message }, 'AI chat: stream error');
    res.write(`data: ${JSON.stringify({ error: 'Stream interrupted.' })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = { getChurnScore, getAllChurnScores, triggerChurnAnalysis, chat };
