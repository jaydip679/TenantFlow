import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // In Docker, the backend is at http://server:5000
  // In local dev,  the backend is at http://localhost:5000
  const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendUrl,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
