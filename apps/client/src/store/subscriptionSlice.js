import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getSubscription,
  getTenantInvoices,
  getPlans,
} from '../services/subscriptionService.js';
import { logout } from './authSlice.js';

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchSubscription = createAsyncThunk(
  'subscription/fetchSubscription',
  async (tenantId, { rejectWithValue }) => {
    try {
      const res = await getSubscription(tenantId);
      // API returns { data: { subscription: {...} } } — unwrap the inner object
      // so Redux state.subscription.subscription = actual sub doc (not a wrapper)
      const raw = res.data.data;
      return raw?.subscription ?? raw ?? null;
    } catch (err) {
      // 404 = new user with no subscription yet — not a real error, just return null
      if (err.response?.status === 404) return null;
      return rejectWithValue(err.response?.data?.message || 'Failed to load subscription');
    }
  }
);

export const fetchTenantInvoices = createAsyncThunk(
  'subscription/fetchTenantInvoices',
  async ({ tenantId, params }, { rejectWithValue }) => {
    try {
      const res = await getTenantInvoices(tenantId, params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load invoices');
    }
  }
);

export const fetchPlans = createAsyncThunk(
  'subscription/fetchPlans',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getPlans();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load plans');
    }
  }
);

// ── Initial State ─────────────────────────────────────────────────────────────

const initialState = {
  subscription: null,
  invoices: [],
  invoicePagination: {},
  plans: [],
  loading: false,
  invoicesLoading: false,
  plansLoading: false,
  error: null,
};

// ── Slice ─────────────────────────────────────────────────────────────────────

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    clearSubscriptionError(state) {
      state.error = null;
    },
    setSubscription(state, action) {
      state.subscription = action.payload;
    },
    // Manually reset — useful after registration or account switch
    resetSubscription: () => initialState,
  },
  extraReducers: (builder) => {
    // ── CRITICAL: Reset all subscription state when user logs out ─────────────
    // Without this, the previous user's plan (e.g. Growth 20/20) would persist
    // in memory and appear for the next user who logs in.
    builder.addCase(logout, () => initialState);

    // fetchSubscription
    builder
      .addCase(fetchSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubscription.fulfilled, (state, action) => {
        state.loading = false;
        // payload is null when new user has no subscription (404 → resolved to null above)
        state.subscription = action.payload ?? null;
      })
      .addCase(fetchSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Clear stale subscription so previous user's plan doesn't bleed through
        state.subscription = null;
      });

    // fetchTenantInvoices
    builder
      .addCase(fetchTenantInvoices.pending, (state) => {
        state.invoicesLoading = true;
      })
      .addCase(fetchTenantInvoices.fulfilled, (state, action) => {
        state.invoicesLoading = false;
        state.invoices = action.payload.invoices ?? action.payload;
        state.invoicePagination = action.payload.pagination ?? {};
      })
      .addCase(fetchTenantInvoices.rejected, (state) => {
        state.invoicesLoading = false;
      });

    // fetchPlans
    builder
      .addCase(fetchPlans.pending, (state) => {
        state.plansLoading = true;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.plansLoading = false;
        state.plans = action.payload;
      })
      .addCase(fetchPlans.rejected, (state) => {
        state.plansLoading = false;
      });
  },
});

export const { clearSubscriptionError, setSubscription, resetSubscription } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
