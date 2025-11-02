import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    exclude: ['frontend/**', 'services/**', 'node_modules/**'],
    globals: true,
  },
});
