import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run, toDST, toEXP, toPES } from '../src/lib/engine.ts';

const SHEET_ID = 'physical-sewout-validation-v1';
const SOURCE_PATH = 'examples/advanced/physical-sewout-validation-v1.ns';
const DEFAULT_OUT_DIR = 'sewout-output/physical-sewout-v1';

const SPECIMENS = [
  ['W01', 'woven', 'polyester-40wt', 75, 'tearaway', 0],
  ['K01', 'knit', 'polyester-40wt', 75, 'cutaway', 0],
  ['X01', 'stretch', 'polyester-40wt', 75, 'cutaway', 0],
  ['D01', 'denim', 'polyester-40wt', 90, 'tearaway', 0],
  ['D02', 'canvas', 'polyester-40wt', 90, 'tearaway', 0],
  ['P01', 'fleece', 'polyester-40wt', 75, 'cutaway', 1],
  ['W02', 'woven', 'rayon-60wt', 65, 'tearaway', 0],
].map(([id, fabric, thread, needle, stabilizer, topping]) => ({
  id,
  fabric,
  thread,
  needle,
  stabilizer,
  topping: Boolean(topping),
}));

const FORMATS = {
  dst: (result, label) => toDST(result.events, label),
  pes: (result, label) => toPES(result.events, label, result.colorTable),
  exp: (result, label) => toEXP(result.events, label),
};

function usage() {
  return `Export ${SHEET_ID}

Usage:
  npm run sewout:v1 -- [--specimen ID|all] [--format ns|dst|pes|exp|all]
                         [--out DIRECTORY] [--force]

Defaults:
  --specimen all
  --format all
  --out ${DEFAULT_OUT_DIR}

The workflow always writes the exact configured .ns source and a checksum manifest.
Use --force only to replace previously generated artifacts.`;
}

function parseArgs(args) {
  const options = {
    specimen: 'all',
    format: 'all',
    out: DEFAULT_OUT_DIR,
    force: false,
    help: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg !== '--specimen' && arg !== '--format' && arg !== '--out') {
      throw new Error(`unknown argument '${arg}'\n\n${usage()}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value\n\n${usage()}`);
    }
    options[arg.slice(2)] = value;
  }

  const specimenIds = new Set(SPECIMENS.map(({ id }) => id));
  if (options.specimen !== 'all' && !specimenIds.has(options.specimen)) {
    throw new Error(
      `unknown specimen '${options.specimen}'; choose all or ${[...specimenIds].join(', ')}`,
    );
  }
  if (options.format !== 'all' && options.format !== 'ns' && !(options.format in FORMATS)) {
    throw new Error(`unknown format '${options.format}'; choose all, ns, dst, pes, or exp`);
  }
  return options;
}

function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before)) {
    throw new Error(`expected exactly one canonical setup declaration: ${before}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function sourceForSpecimen(canonicalSource, specimen) {
  let configured = canonicalSource;
  configured = replaceOnce(
    configured,
    "let sheet_fabric = 'woven'",
    `let sheet_fabric = '${specimen.fabric}'`,
  );
  configured = replaceOnce(
    configured,
    "let sheet_thread = 'polyester-40wt'",
    `let sheet_thread = '${specimen.thread}'`,
  );
  configured = replaceOnce(
    configured,
    'let sheet_needle = 75',
    `let sheet_needle = ${specimen.needle}`,
  );
  configured = replaceOnce(
    configured,
    "let sheet_stabilizer = 'tearaway'",
    `let sheet_stabilizer = '${specimen.stabilizer}'`,
  );
  return replaceOnce(
    configured,
    'let sheet_topping = 0',
    `let sheet_topping = ${Number(specimen.topping)}`,
  );
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function assertContained(result, specimenId) {
  const hoop = result.activeHoop;
  if (!hoop) throw new Error(`${specimenId}: sheet did not resolve a hoop`);
  const halfWidth = hoop.fieldWidthMM / 2;
  const halfHeight = hoop.fieldHeightMM / 2;
  const overflow = result.events.find(
    (event) =>
      (event.t === 'stitch' || event.t === 'jump') &&
      (Math.abs(event.x) > halfWidth || Math.abs(event.y) > halfHeight),
  );
  if (overflow) {
    throw new Error(`${specimenId}: generated ${overflow.t} lies outside the sewable field`);
  }
}

function artifactName(specimenId, extension) {
  return `${specimenId}-${SHEET_ID}.${extension}`;
}

async function ensureOutputsAreAvailable(outputPaths, force) {
  if (force) return;
  const existing = [];
  for (const outputPath of outputPaths) {
    try {
      await access(outputPath);
      existing.push(outputPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (existing.length > 0) {
    throw new Error(
      `refusing to replace ${existing.length} existing artifact(s); use --force or another --out directory`,
    );
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const canonicalSource = await readFile(path.resolve(SOURCE_PATH), 'utf8');
const selectedSpecimens =
  options.specimen === 'all' ? SPECIMENS : SPECIMENS.filter(({ id }) => id === options.specimen);
const selectedFormats =
  options.format === 'all' ? Object.keys(FORMATS) : options.format === 'ns' ? [] : [options.format];
const outputDir = path.resolve(options.out);
const pendingArtifacts = [];
const manifestSpecimens = [];

for (const specimen of selectedSpecimens) {
  const configuredSource = sourceForSpecimen(canonicalSource, specimen);
  const result = run(configuredSource);
  assertContained(result, specimen.id);

  const sourceFilename = artifactName(specimen.id, 'ns');
  pendingArtifacts.push({
    filename: sourceFilename,
    data: configuredSource,
    format: 'ns',
    specimenId: specimen.id,
  });

  for (const format of selectedFormats) {
    const filename = artifactName(specimen.id, format);
    const label = `${specimen.id}-SEWOUT-V1`;
    pendingArtifacts.push({
      filename,
      data: FORMATS[format](result, label),
      format,
      specimenId: specimen.id,
    });
  }

  manifestSpecimens.push({
    ...specimen,
    sourceFile: sourceFilename,
    sourceSha256: sha256(configuredSource),
    eventCount: result.events.length,
    stitchCount: result.events.filter((event) => event.t === 'stitch').length,
    warnings: result.warnings,
  });
}

const manifestPath = path.join(outputDir, 'manifest.json');
const outputPaths = [
  ...pendingArtifacts.map(({ filename }) => path.join(outputDir, filename)),
  manifestPath,
];
await ensureOutputsAreAvailable(outputPaths, options.force);
await mkdir(outputDir, { recursive: true });

const artifactRecords = [];
for (const artifact of pendingArtifacts) {
  const outputPath = path.join(outputDir, artifact.filename);
  await writeFile(outputPath, artifact.data);
  artifactRecords.push({
    specimenId: artifact.specimenId,
    format: artifact.format,
    file: artifact.filename,
    bytes: Buffer.byteLength(artifact.data),
    sha256: sha256(artifact.data),
  });
}

const manifest = {
  schemaVersion: 1,
  sheetId: SHEET_ID,
  canonicalSource: SOURCE_PATH,
  canonicalSourceSha256: sha256(canonicalSource),
  specimens: manifestSpecimens,
  artifacts: artifactRecords,
  evidenceStatus: 'generated-software-artifacts-only; physical measurements pending',
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Wrote ${pendingArtifacts.length} artifact(s) and manifest for ${selectedSpecimens.length} specimen(s) to ${outputDir}`,
);
