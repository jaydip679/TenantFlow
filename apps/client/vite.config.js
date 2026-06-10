import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Required for Docker container access
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://server:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://server:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
