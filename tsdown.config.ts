import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/create-cella-cli.ts' },
  // The bin shim imports dist/index.js
  fixedExtension: false,
  sourcemap: true,
  dts: false,
  // An unresolved import only warns, and the bundle then crashes at start
  failOnWarn: true,
});
