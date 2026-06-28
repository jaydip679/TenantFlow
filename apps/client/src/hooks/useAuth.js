import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../store/authSlice.js';
import { logoutApi } from '../services/authService.js';

export function useAuth() {
  const dispatch = useDispatch();
  const { user, accessToken, isAuthenticated } = useSelector((s) => s.auth);

  const handleLogout = async () => {
    try { await logoutApi(); } catch {}
    dispatch(logout());
    window.location.href = '/login';
  };

  return { user, accessToken, isAuthenticated, logout: handleLogout };
}
