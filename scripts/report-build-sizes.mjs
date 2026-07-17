import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const names = await readdir(assetsDir);
const files = await Promise.all(
  names.map(async (name) => {
    const filePath = path.join(assetsDir, name);
    const info = await stat(filePath);
    const contents = await readFile(filePath);
    return { name, bytes: info.size, gzipBytes: gzipSync(contents).length };
  }),
);

const javascript = files.filter((file) => file.name.endsWith('.js'));
const pick = (prefix) =>
  javascript.filter((file) => file.name.startsWith(prefix)).sort((a, b) => b.bytes - a.bytes)[0];
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const describe = (file) =>
  file ? `${file.name}: ${format(file.bytes)} raw, ${format(file.gzipBytes)} gzip` : 'not found';

const report = [
  `JavaScript chunks: ${javascript.length}`,
  `JavaScript total: ${format(javascript.reduce((sum, file) => sum + file.bytes, 0))} raw`,
  `Application entry: ${describe(pick('index-'))}`,
  `Monaco chunk: ${describe(pick('needlescript-monaco-'))}`,
  `Monaco editor worker: ${describe(pick('editor.worker-'))}`,
  `NeedleScript compiler worker: ${describe(pick('compiler.worker-'))}`,
];

console.log(report.join('\n'));
