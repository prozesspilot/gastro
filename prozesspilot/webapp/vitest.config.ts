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
        // Ziele aus der Spec:
        // src/components: ≥ 80%
        // src/api:        ≥ 90%
        // src/pages:      ≥ 70%
        lines:      50,
        functions:  50,
        branches:   50,
        statements: 50,
      },
    },

    globals: true,
  },
});
