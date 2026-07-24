'use strict';

/**
 * RevenueForecast Model
 *
 * Stores AI-generated + deterministic revenue forecast results.
 * One document per compute run — kept as a time series (not upserted).
 * The most-recent document is always used for display.
 *
 * Forecast values (forecastMonths) are computed via linear regression
 * on historical MRR movements. Gemini generates the narrative commentary only.
 *
 * Fields:
 *   forecastMonths  — Array of { month, forecastedMrr, low, high } (3 months)
 *   trend           — 'growth' | 'stable' | 'decline'
 *   confidence      — 0–100 score based on R² of regression
 *   narrative       — Gemini-generated natural language insight
 *   modelVersion    — AI model used for narrative
 *   computedAt      — Timestamp of computation
 *
 * REF: docs/SYSTEM_DESIGN.md — Revenue Forecasting
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const forecastMonthSchema = new Schema(
  {
    month:          { type: String, required: true },  // 'YYYY-MM'
    forecastedMrr:  { type: Number, required: true },  // In paise
    low:            { type: Number, required: true },  // Pessimistic band
    high:           { type: Number, required: true },  // Optimistic band
  },
  { _id: false }
);

const revenueForecastSchema = new Schema(
  {
    forecastMonths: { type: [forecastMonthSchema], required: true },
    trend:     {
      type:     String,
      enum:     ['growth', 'stable', 'decline'],
      required: true,
    },
    confidence: {
      type:     Number,
      required: true,
      min:      0,
      max:      100,
    },
    narrative:    { type: String, default: '' },   // Gemini-generated insight
    modelVersion: { type: String, default: '' },   // e.g. 'gemini-1.5-pro'
    computedAt:   { type: Date,   default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }  // Immutable
);

// Sort by newest first
revenueForecastSchema.index({ computedAt: -1 });

const RevenueForecast = mongoose.model('RevenueForecast', revenueForecastSchema);

module.exports = RevenueForecast;
