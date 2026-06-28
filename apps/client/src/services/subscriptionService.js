import api from './api.js';

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const getSubscription        = (tenantId)           => api.get(`/subscriptions/${tenantId}`);
export const previewPlanChange      = (tenantId, payload)  => api.post(`/subscriptions/${tenantId}/preview-change`, payload);
export const changePlan             = (tenantId, payload)  => api.post(`/subscriptions/${tenantId}/change-plan`, payload);
export const cancelSubscription     = (tenantId)           => api.post(`/subscriptions/${tenantId}/cancel`);
export const reactivateSubscription = (tenantId)           => api.post(`/subscriptions/${tenantId}/reactivate`);

// ── Plans ─────────────────────────────────────────────────────────────────────
export const getPlans = ()         => api.get('/plans');
export const getPlan  = (planId)   => api.get(`/plans/${planId}`);

// ── Invoices ──────────────────────────────────────────────────────────────────
export const getInvoices        = (tenantId, params) => api.get(`/invoices/tenant/${tenantId}`, { params });
export const getTenantInvoices  = getInvoices; // alias
export const getInvoicePdf      = (invoiceId)        => api.get(`/invoices/${invoiceId}/pdf`);

// ── Payments ──────────────────────────────────────────────────────────────────
export const createOrder        = (payload)            => api.post('/payments/orders', payload);
export const createPaymentOrder = createOrder; // alias
export const verifyPayment      = (payload)            => api.post('/payments/verify', payload);
export const getPaymentHistory  = (tenantId, params)   => api.get(`/payments/history/${tenantId}`, { params });

// ── Members ───────────────────────────────────────────────────────────────────
export const getMembers      = (tenantId)          => api.get(`/tenants/${tenantId}/members`);
export const getTenantMembers = getMembers; // alias
export const inviteMember    = (tenantId, payload) => api.post(`/tenants/${tenantId}/members/invite`, payload);
export const removeMember    = (tenantId, userId)  => api.delete(`/tenants/${tenantId}/members/${userId}`);

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = (params) => api.get('/notifications', { params });
export const getUnreadCount   = ()       => api.get('/notifications/unread-count');
export const markRead         = (id)     => api.patch(`/notifications/${id}/read`);
export const markAllRead      = ()       => api.patch('/notifications/read-all');

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiChatBaseURL = '/api/v1/ai/chat';
