import { defineConfig, devices } from '@playwright/test';

/**
 * C2 — Playwright-Konfiguration
 *
 * Smoke-Tests für die Hauptnavigation.
 * Setzt voraus dass `npm run dev` läuft (Port 5173).
 */
export default defineConfig({
  testDir: './src/tests/e2e',
  testMatch: '**/*.e2e.ts',

  // Maximale Laufzeit pro Test
  timeout: 30_000,

  // Parallele Ausführung
  fullyParallel: true,

  // Bei CI: kein Retry, lokal: 1 Retry
  retries: process.env['CI'] ? 0 : 1,

  // Output-Format
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    // Dev-Server URL
    baseURL: 'http://localhost:5173',

    // Screenshot bei Fehlern
    screenshot: 'only-on-failure',

    // Traces bei erstem Retry
    trace: 'on-first-retry',
  },

  // Browser-Konfiguration — nur Chromium für schnelle CI
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Dev-Server automatisch starten für lokale Ausführung
  // In CI wird der Server separat gestartet
  webServer: process.env['CI']
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
