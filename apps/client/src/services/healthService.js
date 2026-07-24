import api from './api.js';

// ── Customer Health Scores ────────────────────────────────────────────────────
export const getHealthScores   = (params)    => api.get('/admin/health-scores', { params });
export const getHealthScore    = (tenantId)  => api.get(`/admin/health-scores/${tenantId}`);
export const computeHealthScores = (body = {}) => api.post('/admin/health-scores/compute', body);

// ── Expansion Opportunities ───────────────────────────────────────────────────
export const getExpansionOpportunities = (limit = 20) =>
  api.get('/admin/metrics/expansion-opportunities', { params: { limit } });
