import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom simuliert den Browser-DOM für React-Komponenten-Tests
    environment: 'jsdom',

    // Setup-Datei: importiert @testing-library/jest-dom Matchers + MSW
    setupFiles: ['./src/tests/setup.ts'],

    // Glob-Pattern für Test-Dateien
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Coverage via v8 (kein Istanbul)
    coverage: {
      provider: 'v8',
      reporter:  ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/tests/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/App.tsx',
      ],
      thresholds: {
        // Aktuelle Basis-Schwellen — werden schrittweise erhöht.
        // Ziele aus der Spec: components ≥ 80%, api ≥ 90%, pages ≥ 70%
        // Aktuell: api ~85%, components ~41%, pages ~9% (E2E-Tests fehlen noch)
        lines:      20,
        functions:  40,
        branches:   50,
        statements: 20,
      },
    },

    globals: true,
  },
});
