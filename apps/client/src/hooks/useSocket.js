import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useSelector } from 'react-redux';

export function useSocket(onNotification) {
  const socketRef = useRef(null);
  const accessToken = useSelector((s) => s.auth.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    socketRef.current = io('/notifications', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => console.log('Socket connected'));
    socketRef.current.on('notification:new', (notification) => {
      if (onNotification) onNotification(notification);
    });
    socketRef.current.on('disconnect', (reason) => console.log('Socket disconnected:', reason));
    socketRef.current.on('connect_error', (err) => console.warn('Socket error:', err.message));

    return () => {
      socketRef.current?.disconnect();
    };
  }, [accessToken]);

  return socketRef;
}
