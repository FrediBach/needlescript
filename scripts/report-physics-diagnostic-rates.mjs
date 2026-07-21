import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PHYSICS_DIAGNOSTIC_CATALOG, PHYSICS_THRESHOLD_VERSION, run } from '../src/lib/engine.ts';

const corpusPath = path.resolve('docs/physics-diagnostic-validation-corpus-v1.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const check = process.argv.includes('--check');

if (corpus.thresholdVersion !== PHYSICS_THRESHOLD_VERSION)
  throw new Error(
    `Corpus threshold version ${corpus.thresholdVersion} does not match ${PHYSICS_THRESHOLD_VERSION}.`,
  );

const knownCodes = new Set(PHYSICS_DIAGNOSTIC_CATALOG.map(({ code }) => code));
const counts = new Map(
  [...knownCodes].map((code) => [
    code,
    { truePositive: 0, falseNegative: 0, falsePositive: 0, trueNegative: 0 },
  ]),
);
const failures = [];

for (const fixture of corpus.cases) {
  const expected = new Set(fixture.expectedCodes);
  const absent = new Set(fixture.absentCodes);
  for (const code of [...expected, ...absent]) {
    if (!knownCodes.has(code)) throw new Error(`${fixture.id} references unknown code '${code}'.`);
    if (expected.has(code) && absent.has(code))
      throw new Error(`${fixture.id} lists '${code}' as both expected and absent.`);
  }
  const source = fs.readFileSync(path.resolve(fixture.sourcePath), 'utf8');
  const observed = new Set(
    run(source, { physicsAnalysis: 'full' }).physics?.diagnostics.map(({ code }) => code),
  );
  for (const code of expected) {
    if (observed.has(code)) counts.get(code).truePositive++;
    else {
      counts.get(code).falseNegative++;
      failures.push(`${fixture.id}: missing expected ${code}`);
    }
  }
  for (const code of absent) {
    if (observed.has(code)) {
      counts.get(code).falsePositive++;
      failures.push(`${fixture.id}: observed absent ${code}`);
    } else counts.get(code).trueNegative++;
  }
}

const rates = [...counts]
  .map(([code, value]) => {
    const positive = value.truePositive + value.falseNegative;
    const negative = value.falsePositive + value.trueNegative;
    return {
      code,
      ...value,
      falseNegativeRate: positive ? value.falseNegative / positive : null,
      falsePositiveRate: negative ? value.falsePositive / negative : null,
    };
  })
  .filter(
    ({ falseNegativeRate, falsePositiveRate }) =>
      falseNegativeRate !== null || falsePositiveRate !== null,
  );

console.log(
  JSON.stringify(
    {
      corpusVersion: corpus.version,
      thresholdVersion: corpus.thresholdVersion,
      groundTruth: corpus.groundTruth,
      physicalEvidenceStatus: corpus.physicalEvidenceStatus,
      rates,
      failures,
    },
    null,
    2,
  ),
);

if (check && failures.length) process.exitCode = 1;
