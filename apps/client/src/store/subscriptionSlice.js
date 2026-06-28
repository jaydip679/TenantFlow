import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getSubscription,
  getTenantInvoices,
  getPlans,
} from '../services/subscriptionService.js';

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchSubscription = createAsyncThunk(
  'subscription/fetchSubscription',
  async (tenantId, { rejectWithValue }) => {
    try {
      const res = await getSubscription(tenantId);
      return res.data.data;
    } catch (err) {
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

// ── Slice ─────────────────────────────────────────────────────────────────────

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState: {
    subscription: null,
    invoices: [],
    invoicePagination: {},
    plans: [],
    loading: false,
    invoicesLoading: false,
    plansLoading: false,
    error: null,
  },
  reducers: {
    clearSubscriptionError(state) {
      state.error = null;
    },
    setSubscription(state, action) {
      state.subscription = action.payload;
    },
  },
  extraReducers: (builder) => {
    // fetchSubscription
    builder
      .addCase(fetchSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.subscription = action.payload;
      })
      .addCase(fetchSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
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

export const { clearSubscriptionError, setSubscription } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
