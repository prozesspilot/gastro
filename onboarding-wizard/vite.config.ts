import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Onboarding-Wizard (setup.prozesspilot.net). Eigene Vite-App, getrennt von der
// Mitarbeiter-Webapp (Port 5173) — Port 5174. Proxy /api → Backend (Port 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
