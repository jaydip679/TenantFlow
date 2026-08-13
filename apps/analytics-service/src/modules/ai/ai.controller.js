'use strict';

const aiService = require('./ai.service');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const getChurnScore = asyncHandler(async (req, res) => {
  const score = await aiService.getChurnScore(req.params.tenantId);
  res.status(200).json({ success: true, data: score || null });
});

// getAllChurnScores can be implemented if needed, but not required yet.
const getAllChurnScores = asyncHandler(async (req, res) => {
  res.status(501).json({ success: false, message: 'Not implemented in Analytics Service yet.' });
});

const chat = asyncHandler(async (req, res) => {
  const { message, conversationHistory } = req.body;
  const tenantId = req.headers['x-tenant-id']; // Proxied from Monolith

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const response = await aiService.chat({ tenantId }, message);
    res.write(`data: ${JSON.stringify({ delta: response.reply })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = { getChurnScore, getAllChurnScores, chat };
