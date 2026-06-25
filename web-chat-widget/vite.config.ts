import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Web-Chat-Widget (chat.prozesspilot.net/{token}). Eigene Vite-App, getrennt von
// der Mitarbeiter-Webapp (5173) und dem Onboarding-Wizard (5174) — Port 5175.
// Proxy /api → Backend (Port 3000), inkl. SSE (kein Buffering nötig im Dev-Proxy).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
