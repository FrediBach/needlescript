import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOM environment for svgToCode (uses DOMParser)
    environment: 'happy-dom',
    // Globals: describe/it/expect available without import
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
