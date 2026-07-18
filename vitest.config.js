import { defineConfig } from 'vitest/config';

// One root runner for both halves: the server API/store tests and the pure
// client parser tests (plain ESM, no DOM — the node environment is enough).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.js', 'client/src/**/*.test.js'],
  },
});
