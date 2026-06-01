import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'src/modules/**/tests/*.test.ts',
      'src/modules/**/*.test.ts',
      'src/__tests__/**/*.test.ts',
      'src/core/**/*.test.ts',
      'src/workers/**/*.test.ts',
    ],
    setupFiles: ['tests/setup.ts'],
  },
});
