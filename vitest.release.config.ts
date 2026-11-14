import { defineConfig } from 'vitest/config';

// The release smoke test alone: it packs and installs the package and clones the template over the network
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/release-smoke.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 300000, // 5 minutes: pack, install and a network clone
    onConsoleLog: () => false,
  },
});
