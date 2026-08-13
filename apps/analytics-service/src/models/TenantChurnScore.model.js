'use strict';

/**
 * TenantChurnScore Model
 *
 * Stores the latest AI-computed churn risk analysis per tenant.
 * One document per tenant — upserted on each analysis run.
 *
 * Tracks whether a proactive outreach email has been sent to the admin
 * (to prevent repeated emails for the same high-risk tenant).
 *
 * `analysisPromptHash` stores the SHA-256 of the prompt used, enabling
 * audit of which prompt version produced a given score.
 *
 * REF: docs/DATABASE_DESIGN.md §3.11 — tenant_churn_scores schema
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const churnScoreSchema = new Schema(
  {
    tenantId: {
      type:     String,
      required: true,
      index:    true,
    },
    churnRiskScore: {
      type:     Number,
      required: true,
      min:      0,
      max:      100,
    },
    riskLevel: {
      type:     String,
      enum:     ['low', 'medium', 'high'],
      required: true,
    },
    keySignals:         [String],
    recommendedAction:  { type: String, default: null },
    signals:            { type: Map, of: Schema.Types.Mixed },  // Raw signal bundle used for analysis
    aiModel:            { type: String, required: true },        // 'gpt-4o' | 'gemini-1.5-pro'
    analysisPromptHash: { type: String, required: true },        // SHA-256 of prompt for audit
    outreachEmailSent:    { type: Boolean, default: false },
    outreachEmailSentAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────
churnScoreSchema.index({ tenantId: 1 }, { unique: true });  // One score per tenant (upserted)
churnScoreSchema.index({ churnRiskScore: -1 });              // For getAllChurnScores sorted by risk

const TenantChurnScore = mongoose.model('TenantChurnScore', churnScoreSchema);

module.exports = TenantChurnScore;
