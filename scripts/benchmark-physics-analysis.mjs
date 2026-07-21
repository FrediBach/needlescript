import process from 'node:process';
import { run } from '../src/lib/engine.ts';

const scenarios = [
  {
    id: 'small',
    minimumEvents: 200,
    source: 'lock 0 stitchlen 0.4 repeat 50 [ repeat 4 [ fd 0.4 rt 90 ] ]',
  },
  {
    id: 'typical',
    minimumEvents: 10_000,
    source: 'lock 0 stitchlen 0.4 repeat 2500 [ repeat 4 [ fd 0.4 rt 90 ] ]',
  },
  {
    id: 'limit-sized',
    minimumEvents: 90_000,
    source: 'lock 0 stitchlen 0.4 repeat 22500 [ repeat 4 [ fd 0.4 rt 90 ] ]',
  },
];

const iterationsArgument = process.argv.find((argument) => argument.startsWith('--iterations='));
const iterations = iterationsArgument ? Number(iterationsArgument.split('=')[1]) : 5;
if (!Number.isInteger(iterations) || iterations < 1)
  throw new Error('--iterations must be a positive integer.');

function median(values) {
  const ordered = values.toSorted((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

const results = [];
for (const scenario of scenarios) {
  run(scenario.source, { physicsAnalysis: 'full' });
  const samples = [];
  let events = 0;
  let diagnostics = 0;
  for (let index = 0; index < iterations; index++) {
    let timing;
    const result = run(scenario.source, {
      physicsAnalysis: 'full',
      onTiming(value) {
        timing = value;
      },
    });
    if (!timing) throw new Error(`Missing timing instrumentation for ${scenario.id}.`);
    events = result.events.length;
    diagnostics = result.physics?.diagnostics.length ?? 0;
    samples.push(timing.analysisMs);
  }
  if (events < scenario.minimumEvents)
    throw new Error(
      `${scenario.id} emitted ${events} events; expected at least ${scenario.minimumEvents}.`,
    );
  results.push({
    id: scenario.id,
    events,
    diagnostics,
    iterations,
    analysisMs: {
      median: median(samples),
      minimum: Math.min(...samples),
      maximum: Math.max(...samples),
    },
  });
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      results,
    },
    null,
    2,
  ),
);
