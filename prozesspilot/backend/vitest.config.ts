import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/modules/**/tests/*.test.ts', 'src/__tests__/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
