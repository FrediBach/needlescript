import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // DOM environment for svgToCode (uses DOMParser)
    environment: 'happy-dom',
    // Globals: describe/it/expect available without import
    globals: true,
    include: ['src/**/*.test.ts'],
    // Determinism tripwire: Math.random throws inside every test (RFC-3 §5)
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/engine.ts'], // re-export facade only
      reporter: ['text', 'html'],
    },
  },
});
