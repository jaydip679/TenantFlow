import { configureStore } from '@reduxjs/toolkit';
import authReducer         from './authSlice.js';
import subscriptionReducer from './subscriptionSlice.js';
import notificationReducer from './notificationSlice.js';
import adminReducer        from './adminSlice.js';

export const store = configureStore({
  reducer: {
    auth:          authReducer,
    subscription:  subscriptionReducer,
    notifications: notificationReducer,
    admin:         adminReducer,
  },
});
