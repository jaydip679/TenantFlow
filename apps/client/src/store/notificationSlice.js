import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setNotifications(state, action) {
      state.notifications = action.payload;
    },
    prependNotification(state, action) {
      state.notifications = [action.payload, ...state.notifications];
    },
    markRead(state, action) {
      const id = action.payload;
      const n = state.notifications.find((n) => n._id === id);
      if (n) {
        n.isRead = true;
        if (state.unreadCount > 0) state.unreadCount -= 1;
      }
    },
    markAllRead(state) {
      state.notifications.forEach((n) => { n.isRead = true; });
      state.unreadCount = 0;
    },
    setUnreadCount(state, action) {
      state.unreadCount = action.payload;
    },
    removeNotification(state, action) {
      state.notifications = state.notifications.filter((n) => n._id !== action.payload);
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
  },
});

export const {
  setNotifications, prependNotification, markRead, markAllRead,
  setUnreadCount, removeNotification, setLoading,
} = notificationSlice.actions;
export default notificationSlice.reducer;
