import { createSlice } from '@reduxjs/toolkit';

const STORAGE_KEY = 'tf_auth';

function loadPersistedAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, isAuthenticated: false };
    return JSON.parse(raw);
  } catch {
    return { user: null, accessToken: null, isAuthenticated: false };
  }
}

const persisted = loadPersistedAuth();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: persisted.user ?? null,
    accessToken: persisted.accessToken ?? null,
    isAuthenticated: persisted.isAuthenticated ?? false,
  },
  reducers: {
    setCredentials(state, action) {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken, isAuthenticated: true }));
      } catch {}
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, user: state.user }));
      } catch {}
    },
  },
});

export const { setCredentials, logout, updateUser } = authSlice.actions;
export default authSlice.reducer;
