import { defineConfig } from 'tsdown';

// Build config for the publishable `needlescript` library.
// Entry is the DOM-free engine surface. Output is ESM-only with type
// declarations, into `dist-lib/`, separate from the playground's `dist/`.
//
// The three genuine runtime dependencies are externalized so consumers
// install them as peers via the generated package.json `dependencies`.
export default defineConfig({
  entry: { index: 'src/lib/engine.ts' },
  outDir: 'dist-lib',
  format: ['esm'],
  platform: 'neutral',
  dts: { tsconfig: 'tsconfig.lib.json' },
  sourcemap: true,
  treeshake: true,
  clean: true,
  deps: { neverBundle: ['simplex-noise', 'delaunator', 'clipper2-ts'] },
});
