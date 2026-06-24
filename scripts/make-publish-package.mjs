// Generates the consumer-facing package.json for the published `needlescript`
// library and copies README + LICENSE into the build output (`dist-lib/`).
//
// The root package.json is the *playground* manifest (React/UI deps, private).
// We never publish that. Instead we emit a clean, self-contained manifest here
// so the published artifact is fully decoupled from the playground.
//
// Run after `tsdown`:  node scripts/make-publish-package.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist-lib');

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Runtime dependencies of the engine, versions kept in sync with the root.
const RUNTIME_DEPS = ['simplex-noise', 'delaunator', 'clipper2-ts'];
const dependencies = {};
for (const name of RUNTIME_DEPS) {
  const version = rootPkg.dependencies?.[name];
  if (!version) throw new Error(`Missing runtime dependency "${name}" in root package.json`);
  dependencies[name] = version;
}

const pkg = {
  name: 'needlescript',
  version: rootPkg.version,
  description:
    'A Logo-inspired language for generative embroidery: parse, run, and export turtle-graphics code to machine-ready stitches (DST/PES/EXP) and SVG.',
  type: 'module',
  exports: {
    '.': {
      types: './index.d.ts',
      import: './index.js',
    },
  },
  types: './index.d.ts',
  sideEffects: false,
  files: ['index.js', 'index.js.map', 'index.d.ts'],
  dependencies,
  engines: { node: '>=20' },
  keywords: [
    'embroidery',
    'needlescript',
    'turtle-graphics',
    'logo',
    'generative',
    'parser',
    'interpreter',
    'dst',
    'pes',
    'svg',
  ],
  author: 'Fredi Bach',
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/FrediBach/needlescript.git',
  },
  homepage: 'https://github.com/FrediBach/needlescript#readme',
  bugs: { url: 'https://github.com/FrediBach/needlescript/issues' },
  publishConfig: { access: 'public' },
};

writeFileSync(join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
copyFileSync(join(root, 'README.md'), join(outDir, 'README.md'));
copyFileSync(join(root, 'LICENSE'), join(outDir, 'LICENSE'));

console.log(`dist-lib/package.json written for needlescript@${pkg.version}`);
