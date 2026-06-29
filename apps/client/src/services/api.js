import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token from Redux store on every request
api.interceptors.request.use((config) => {
  try {
    const state = JSON.parse(localStorage.getItem('tf_auth') || '{}');
    if (state.accessToken) {
      config.headers.Authorization = `Bearer ${state.accessToken}`;
    }
  } catch {}
  return config;
});

// On 401 refresh token via cookie
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        const token = data?.data?.accessToken;
        if (token) {
          const state = JSON.parse(localStorage.getItem('tf_auth') || '{}');
          localStorage.setItem('tf_auth', JSON.stringify({ ...state, accessToken: token }));
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
