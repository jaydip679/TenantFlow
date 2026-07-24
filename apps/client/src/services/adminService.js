import api from './api.js';

// ── Admin Metrics ─────────────────────────────────────────────────────────────
export const getMetrics       = ()       => api.get('/admin/metrics');
export const getAdminMetrics  = getMetrics; // alias

// ── Tenants ───────────────────────────────────────────────────────────────────
export const getTenants       = (params)           => api.get('/admin/tenants', { params });
export const getAdminTenants  = getTenants; // alias
export const getTenantDetail  = (tenantId)         => api.get(`/admin/tenants/${tenantId}`);
export const getAdminTenant   = getTenantDetail; // alias
export const forceStatusChange    = (tenantId, payload) => api.patch(`/admin/tenants/${tenantId}/status`, payload);
export const updateTenantStatus   = forceStatusChange; // alias

// ── Invoices ──────────────────────────────────────────────────────────────────
export const getAllInvoices    = (params) => api.get('/admin/invoices', { params });

// ── Dunning ───────────────────────────────────────────────────────────────────
export const getActiveDunning  = (params) => api.get('/admin/dunning', { params });
export const getDunningRecords = getActiveDunning; // alias
export const resetDunning      = (id)    => api.post(`/admin/dunning/${id}/reset`);
export const abandonDunning    = (id)    => api.post(`/admin/dunning/${id}/abandon`);

// ── Churn / AI ────────────────────────────────────────────────────────────────
export const getAllChurnScores    = (params)    => api.get('/ai/churn/all', { params });
export const getAllChurnRisk      = getAllChurnScores; // alias
export const triggerChurnAnalysis = (tenantId) => api.post(`/ai/churn/trigger/${tenantId}`);

// ── Queue Stats ───────────────────────────────────────────────────────────────
export const getQueueStats = () => api.get('/admin/queues');

// ── Revenue Intelligence ─────────────────────────────────────────────────────
export const getMrrMovements    = (months = 6)   => api.get('/admin/metrics/mrr-movements',   { params: { months } });
export const getCashFlowForecast= (months = 3)   => api.get('/admin/metrics/cash-flow',        { params: { months } });
export const getCohortRetention = (cohorts = 6)  => api.get('/admin/metrics/cohort-retention', { params: { cohorts } });
