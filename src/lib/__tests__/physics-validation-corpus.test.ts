import { describe, expect, it } from 'vitest';
import corpusSource from '../../../docs/physics-diagnostic-validation-corpus-v1.json?raw';
import anisotropicSource from '../../../examples/production/anisotropic-material-compensation.ns?raw';
import travelSource from '../../../examples/production/constrained-travel-plan.ns?raw';
import fleeceSource from '../../../examples/production/knockdown-fleece.ns?raw';
import physicalSheetSource from '../../../examples/production/physical-sewout-validation-v1.ns?raw';
import preflightSource from '../../../examples/production/preflight-issue-sampler.ns?raw';
import wideSource from '../../../examples/satin/wide-column-split-sampler.ns?raw';
import { PHYSICS_DIAGNOSTIC_CATALOG, PHYSICS_THRESHOLD_VERSION, run } from '../engine.ts';

interface ValidationFixture {
  id: string;
  sourcePath: string;
  expectedCodes: string[];
  absentCodes: string[];
}

interface ValidationCorpus {
  version: number;
  thresholdVersion: string;
  groundTruth: 'software-expectation';
  physicalEvidenceStatus: 'pending' | 'measured';
  cases: ValidationFixture[];
}

const corpus = JSON.parse(corpusSource) as ValidationCorpus;
const sources = new Map([
  ['examples/production/anisotropic-material-compensation.ns', anisotropicSource],
  ['examples/production/constrained-travel-plan.ns', travelSource],
  ['examples/production/knockdown-fleece.ns', fleeceSource],
  ['examples/production/physical-sewout-validation-v1.ns', physicalSheetSource],
  ['examples/production/preflight-issue-sampler.ns', preflightSource],
  ['examples/satin/wide-column-split-sampler.ns', wideSource],
]);

describe('physics diagnostic validation corpus v1', () => {
  it('pins expected and absent findings against the versioned threshold set', () => {
    const knownCodes: ReadonlySet<string> = new Set(
      PHYSICS_DIAGNOSTIC_CATALOG.map(({ code }) => code),
    );
    expect(corpus.thresholdVersion).toBe(PHYSICS_THRESHOLD_VERSION);
    expect(corpus.groundTruth).toBe('software-expectation');
    expect(corpus.physicalEvidenceStatus).toBe('pending');

    for (const fixture of corpus.cases) {
      const expected = new Set(fixture.expectedCodes);
      const absent = new Set(fixture.absentCodes);
      expect([...expected].every((code) => knownCodes.has(code))).toBe(true);
      expect([...absent].every((code) => knownCodes.has(code))).toBe(true);
      expect([...expected].filter((code) => absent.has(code))).toEqual([]);

      const source = sources.get(fixture.sourcePath);
      if (!source) throw new Error(`Missing imported source for ${fixture.sourcePath}.`);
      const observed = new Set(
        run(source, { physicsAnalysis: 'full' }).physics?.diagnostics.map(({ code }) => code),
      );
      expect(
        [...expected].filter((code) => !observed.has(code)),
        fixture.id,
      ).toEqual([]);
      expect(
        [...absent].filter((code) => observed.has(code)),
        fixture.id,
      ).toEqual([]);
    }
  });
});
