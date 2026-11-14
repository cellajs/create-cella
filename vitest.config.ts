import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // release-smoke packs and installs the package: `test:release` runs it
    exclude: ['**/node_modules/**', 'tests/release-smoke.test.ts'],
    testTimeout: 120000, // 2 minutes, for the e2e clone
    onConsoleLog: () => false,
  },
});
