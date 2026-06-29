import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { prependNotification, setNotifications, setUnreadCount, markRead as markReadAction } from '../store/notificationSlice.js';
import { getNotifications, getUnreadCount, markRead as markReadApi, markAllRead as markAllReadApi } from '../services/subscriptionService.js';
import { useSocket } from './useSocket.js';

export function useNotifications() {
  const dispatch = useDispatch();
  const { notifications, unreadCount } = useSelector((s) => s.notifications);

  const handleNewNotification = useCallback((notification) => {
    dispatch(prependNotification(notification));
    dispatch(setUnreadCount(unreadCount + 1));
  }, [dispatch, unreadCount]);

  useSocket(handleNewNotification);

  useEffect(() => {
    // Load initial notifications and unread count
    getNotifications({ limit: 20 })
      .then((res) => dispatch(setNotifications(res.data.data.notifications)))
      .catch(() => {});
    getUnreadCount()
      .then((res) => dispatch(setUnreadCount(res.data.data.count)))
      .catch(() => {});
  }, [dispatch]);

  const handleMarkRead = useCallback(async (id) => {
    try {
      await markReadApi(id);
      dispatch(markReadAction(id));
    } catch {}
  }, [dispatch]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllReadApi();
      // Re-fetch
      const res = await getNotifications({ limit: 20 });
      dispatch(setNotifications(res.data.data.notifications));
      dispatch(setUnreadCount(0));
    } catch {}
  }, [dispatch]);

  return { notifications, unreadCount, markRead: handleMarkRead, markAllRead: handleMarkAllRead };
}
