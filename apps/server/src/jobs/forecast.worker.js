'use strict';

/**
 * Forecast Worker
 *
 * BullMQ worker consuming 'forecast-queue' jobs.
 *
 * Algorithm:
 *   1. Fetch last 6 months of ending MRR from admin.service.getMrrMovements()
 *   2. Run Ordinary Least Squares (OLS) linear regression over the MRR time series
 *   3. Project slope forward 3 months for forecastedMrr values
 *   4. Compute ±1 standard error bands (low/high confidence interval)
 *   5. Calculate R² as confidence metric (clamped 0–100)
 *   6. Call Gemini (if AI_PROVIDER=gemini or OPENAI_API_KEY available) for natural-
 *      language narrative. Falls back to a deterministic template if AI is unavailable.
 *   7. Persist RevenueForecast document
 *   8. Emit Socket.IO: admin:forecast:updated to /admin namespace
 *
 * Regression model:
 *   x = [0, 1, 2, 3, 4, 5] (month index)
 *   y = endingMrr in paise per month
 *   Forecast: y_hat = slope * x + intercept
 *   Confidence bands: ±1.5 * RMSE
 *
 * REF: docs/SYSTEM_DESIGN.md — Revenue Forecasting
 */

const { Worker }           = require('bullmq');
const { bullmqConnection } = require('../config/bullmq');
const logger               = require('../shared/utils/logger');
const { QUEUE_NAME }       = require('../queues/forecast.queue');

// ── Linear Regression (OLS) ───────────────────────────────────────────────────
/**
 * Ordinary Least Squares linear regression.
 * @param {number[]} y  Array of dependent values (MRR series)
 * @returns {{ slope, intercept, rSquared, rmse }}
 */
function linearRegression(y) {
  const n = y.length;
  const x = y.map((_, i) => i);

  const sumX  = x.reduce((a, b) => a + b, 0);
  const sumY  = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);

  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const yMean    = sumY / n;
  const ssTot    = y.reduce((s, yi) => s + Math.pow(yi - yMean, 2), 0);
  const ssRes    = y.reduce((s, yi, i) => s + Math.pow(yi - (slope * i + intercept), 2), 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const rmse     = Math.sqrt(ssRes / n);

  return { slope, intercept, rSquared, rmse };
}

// ── Deterministic narrative fallback ──────────────────────────────────────────
function buildFallbackNarrative(history, forecast, trend, confidence) {
  const latestMrr   = history[history.length - 1]?.endingMrr || 0;
  const projectedMrr= forecast[forecast.length - 1]?.forecastedMrr || 0;
  const change      = projectedMrr - latestMrr;
  const changePct   = latestMrr > 0 ? Math.round((change / latestMrr) * 100) : 0;
  const trendWord   = trend === 'growth' ? 'growing' : trend === 'decline' ? 'declining' : 'stable';

  return `Based on ${history.length} months of MRR data, revenue is ${trendWord}. ` +
    `The 3-month projection shows a ${changePct >= 0 ? '+' : ''}${changePct}% change. ` +
    `Forecast confidence is ${confidence}% (R² = ${(confidence / 100).toFixed(2)}).`;
}

// ── AI Narrative (Gemini) ─────────────────────────────────────────────────────
async function generateNarrative(history, forecast, trend, confidence) {
  try {
    const provider = process.env.AI_PROVIDER || 'gemini';
    if (provider !== 'gemini' && !process.env.OPENAI_API_KEY) {
      return { text: buildFallbackNarrative(history, forecast, trend, confidence), model: 'fallback' };
    }

    const historyText = history.map(m =>
      `${m.month}: MRR=₹${Math.round((m.endingMrr || 0) / 100).toLocaleString('en-IN')}, ` +
      `New=₹${Math.round((m.newMrr || 0) / 100).toLocaleString('en-IN')}, ` +
      `Churned=₹${Math.round((m.churnedMrr || 0) / 100).toLocaleString('en-IN')}, ` +
      `NRR=${m.nrr}%`
    ).join('\n');

    const forecastText = forecast.map(f =>
      `${f.month}: Forecasted MRR=₹${Math.round(f.forecastedMrr / 100).toLocaleString('en-IN')} ` +
      `[₹${Math.round(f.low / 100).toLocaleString('en-IN')} – ₹${Math.round(f.high / 100).toLocaleString('en-IN')}]`
    ).join('\n');

    const prompt = `You are a SaaS revenue analyst. Analyse the following MRR data and write a concise 2-3 sentence insight for a super admin dashboard. Focus on key trends, risks, and opportunities. Do not repeat raw numbers already shown in the chart — synthesise insights.\n\nHistorical MRR (last ${history.length} months):\n${historyText}\n\nForecast (next 3 months, linear regression, confidence=${confidence}%):\n${forecastText}\n\nOverall trend: ${trend}.\n\nProvide the insight in plain English. No markdown, no bullet points. Max 3 sentences.`;

    if (provider === 'gemini') {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Flash for speed
      const result = await model.generateContent(prompt);
      const text   = result.response.text().trim();
      return { text, model: 'gemini-1.5-flash' };
    } else {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resp = await openai.chat.completions.create({
        model:      'gpt-4o-mini',
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: 150,
      });
      return { text: resp.choices[0].message.content.trim(), model: 'gpt-4o-mini' };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'AI narrative generation failed — using fallback');
    return { text: buildFallbackNarrative(history, forecast, trend, confidence), model: 'fallback' };
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────
const processForecastJob = async (job) => {
  logger.info({ jobId: job.id }, 'Forecast job started');

  // 1. Fetch historical MRR (last 6 months)
  const adminService = require('../modules/admin/admin.service');
  const history      = await adminService.getMrrMovements(6);

  if (history.length < 2) {
    logger.warn({ jobId: job.id }, 'Not enough MRR history for forecast (need ≥2 months)');
    return;
  }

  // 2. Run OLS regression on endingMrr series
  const mrrSeries = history.map(h => h.endingMrr || 0);
  const { slope, intercept, rSquared, rmse } = linearRegression(mrrSeries);

  const confidence = Math.min(100, Math.round(rSquared * 100));
  const trend      = slope > mrrSeries[mrrSeries.length - 1] * 0.005
    ? 'growth'
    : slope < -(mrrSeries[mrrSeries.length - 1] * 0.005)
      ? 'decline'
      : 'stable';

  // 3. Project next 3 months
  const now = new Date();
  const { addMonths, startOfMonth } = require('date-fns');
  const forecastMonths = [1, 2, 3].map(offset => {
    const ref   = addMonths(now, offset);
    const month = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    const x     = history.length - 1 + offset;
    const projected = Math.max(0, Math.round(slope * x + intercept));
    const band      = Math.round(rmse * 1.5);
    return {
      month,
      forecastedMrr: projected,
      low:           Math.max(0, projected - band),
      high:          projected + band,
    };
  });

  // 4. Generate AI narrative
  const { text: narrative, model: modelVersion } = await generateNarrative(
    history, forecastMonths, trend, confidence
  );

  // 5. Persist RevenueForecast
  const RevenueForecast = require('../models/RevenueForecast.model');
  const doc = await RevenueForecast.create({
    forecastMonths,
    trend,
    confidence,
    narrative,
    modelVersion,
    computedAt: new Date(),
  });

  logger.info({ jobId: job.id, docId: doc._id, trend, confidence }, 'Forecast computed and saved');

  // 6. Emit Socket.IO: admin:forecast:updated → /admin namespace
  try {
    const app = require('../app');
    const io  = app.get('io');
    if (io) {
      const { emitToAdmins } = require('../sockets/admin.namespace');
      emitToAdmins(io, 'admin:forecast:updated', {
        forecastMonths,
        trend,
        confidence,
        narrative,
        computedAt: doc.computedAt,
      });
      logger.info({ jobId: job.id }, 'Socket.IO: admin:forecast:updated emitted');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Socket.IO forecast emit failed (non-critical)');
  }
};

const forecastWorker = new Worker(QUEUE_NAME, processForecastJob, {
  connection:  bullmqConnection,
  concurrency: 1,
});

forecastWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Forecast job completed');
});

forecastWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Forecast job failed');
});

module.exports = { forecastWorker };
