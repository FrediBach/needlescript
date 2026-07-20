import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, toSVG } from '../src/lib/engine.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_DIRECTORY = path.join(REPOSITORY_ROOT, 'examples');
const OUTPUT_DIRECTORY = path.join(REPOSITORY_ROOT, 'public', 'example-previews');
const WATCH_INTERVAL_MS = 400;

function parseOptions(args) {
  const options = { watch: false, check: false };
  for (const arg of args) {
    if (arg === '--watch') options.watch = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (options.watch && options.check) throw new Error('--watch and --check cannot be combined');
  return options;
}

function usage() {
  return `Generate square SVG previews for every bundled NeedleScript example.

Usage:
  npm run examples:previews
  npm run examples:previews:watch
  npm run examples:previews:check

The default command writes public/example-previews/*.svg.
Watch mode regenerates an example after its .ns source changes.
Check mode verifies committed previews without writing files.`;
}

async function listExampleFiles(directory = EXAMPLES_DIRECTORY) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listExampleFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.ns')) files.push(entryPath);
  }
  return files.toSorted();
}

function exampleIdForPath(sourcePath) {
  return path.basename(sourcePath, '.ns');
}

function squareSvg(svg) {
  const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  if (!viewBoxMatch) throw new Error('SVG exporter returned an unsupported viewBox');

  const width = Number(viewBoxMatch[1]);
  const height = Number(viewBoxMatch[2]);
  const side = Math.max(width, height);
  const x = (width - side) / 2;
  const y = (height - side) / 2;
  const format = (value) => Number(value.toFixed(3));

  return svg
    .replace('<?xml version="1.0" encoding="UTF-8"?>\n', '')
    .replace(
      /viewBox="0 0 [0-9.]+ [0-9.]+" width="[0-9.]+mm" height="[0-9.]+mm"/,
      `viewBox="${format(x)} ${format(y)} ${format(side)} ${format(side)}" width="256" height="256"`,
    )
    .replace(
      /<rect width="100%" height="100%" fill="([^"]+)"\/>/,
      `<rect x="${format(x)}" y="${format(y)}" width="${format(side)}" height="${format(side)}" fill="$1"/>`,
    );
}

async function renderExample(sourcePath) {
  const id = exampleIdForPath(sourcePath);
  const source = await readFile(sourcePath, 'utf8');
  const result = run(source);
  const svg = toSVG(result.events, id, result.colorTable, result.background);
  return {
    id,
    svg: squareSvg(svg),
    stitches: result.events.filter(({ t }) => t === 'stitch').length,
  };
}

async function writePreview({ id, svg }) {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const destination = path.join(OUTPUT_DIRECTORY, `${id}.svg`);
  const temporary = path.join(OUTPUT_DIRECTORY, `.${id}.svg.tmp`);
  await writeFile(temporary, `${svg}\n`, 'utf8');
  await rename(temporary, destination);
}

async function removePreview(id) {
  try {
    await unlink(path.join(OUTPUT_DIRECTORY, `${id}.svg`));
    console.log(`removed ${id}.svg`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function previewIds() {
  try {
    return (await readdir(OUTPUT_DIRECTORY))
      .filter((filename) => filename.endsWith('.svg'))
      .map((filename) => path.basename(filename, '.svg'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function generateAll() {
  const sourcePaths = await listExampleFiles();
  const sourceIds = new Set();
  const startedAt = performance.now();

  for (const sourcePath of sourcePaths) {
    const preview = await renderExample(sourcePath);
    if (sourceIds.has(preview.id)) throw new Error(`duplicate example ID: ${preview.id}`);
    sourceIds.add(preview.id);
    await writePreview(preview);
    console.log(`generated ${preview.id}.svg (${preview.stitches.toLocaleString()} stitches)`);
  }

  for (const id of await previewIds()) {
    if (!sourceIds.has(id)) await removePreview(id);
  }

  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`generated ${sourcePaths.length} example previews in ${elapsedSeconds}s`);
}

async function checkAll() {
  const sourcePaths = await listExampleFiles();
  const expectedIds = new Set(sourcePaths.map(exampleIdForPath));
  const problems = [];

  for (const sourcePath of sourcePaths) {
    const { id, svg } = await renderExample(sourcePath);
    const destination = path.join(OUTPUT_DIRECTORY, `${id}.svg`);
    let committed;
    try {
      committed = await readFile(destination, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        problems.push(`missing ${id}.svg`);
        continue;
      }
      throw error;
    }
    if (committed !== `${svg}\n`) problems.push(`outdated ${id}.svg`);
  }

  for (const id of await previewIds()) {
    if (!expectedIds.has(id)) problems.push(`stale ${id}.svg`);
  }

  if (problems.length > 0) {
    throw new Error(
      `example previews are not current:\n${problems.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  console.log(`${sourcePaths.length} example previews are current`);
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function regenerateChanged(sourcePath) {
  const id = exampleIdForPath(sourcePath);
  if (!(await pathExists(sourcePath))) {
    await removePreview(id);
    return;
  }
  const preview = await renderExample(sourcePath);
  await writePreview(preview);
  console.log(`updated ${preview.id}.svg (${preview.stitches.toLocaleString()} stitches)`);
}

async function watchExamples() {
  await generateAll();
  console.log('watching examples/**/*.ns for preview changes');

  const takeSnapshot = async () =>
    new Map(
      await Promise.all(
        (await listExampleFiles()).map(async (sourcePath) => {
          const details = await stat(sourcePath);
          return [sourcePath, `${details.mtimeMs}:${details.size}`];
        }),
      ),
    );

  let snapshot = await takeSnapshot();
  let scanning = false;
  const scan = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const nextSnapshot = await takeSnapshot();
      for (const [sourcePath, fingerprint] of nextSnapshot) {
        if (snapshot.get(sourcePath) === fingerprint) continue;
        try {
          await regenerateChanged(sourcePath);
        } catch (error) {
          console.error(
            `failed to update ${path.relative(EXAMPLES_DIRECTORY, sourcePath)}:`,
            error,
          );
        }
      }
      for (const sourcePath of snapshot.keys()) {
        if (!nextSnapshot.has(sourcePath)) await removePreview(exampleIdForPath(sourcePath));
      }
      snapshot = nextSnapshot;
    } catch (error) {
      console.error('failed to scan example previews:', error);
    } finally {
      scanning = false;
    }
  };

  const interval = setInterval(() => {
    void scan();
  }, WATCH_INTERVAL_MS);

  const close = () => {
    clearInterval(interval);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

const options = parseOptions(process.argv.slice(2));
if (options.help) console.log(usage());
else if (options.watch) await watchExamples();
else if (options.check) await checkAll();
else await generateAll();

export { listExampleFiles, renderExample, squareSvg };
