import { createSlice } from '@reduxjs/toolkit';
import { logout } from './authSlice.js';

const initialState = {
  metrics: null,
  tenantList: [],
  tenantDetail: null,
  dunningRecords: [],
  churnScores: [],
  isLoading: false,
};

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    setMetrics(state, action)       { state.metrics        = action.payload; },
    setTenantList(state, action)    { state.tenantList     = action.payload; },
    setTenantDetail(state, action)  { state.tenantDetail   = action.payload; },
    setDunningRecords(state, action){ state.dunningRecords = action.payload; },
    setChurnScores(state, action)   { state.churnScores    = action.payload; },
    setAdminLoading(state, action)  { state.isLoading      = action.payload; },
  },
  extraReducers: (builder) => {
    // Clear all admin data on logout to prevent data bleed between users/roles
    builder.addCase(logout, () => initialState);
  },
});

export const {
  setMetrics, setTenantList, setTenantDetail,
  setDunningRecords, setChurnScores, setAdminLoading,
} = adminSlice.actions;
export default adminSlice.reducer;
