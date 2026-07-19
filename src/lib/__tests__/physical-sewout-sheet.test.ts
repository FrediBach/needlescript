import { describe, expect, it } from 'vitest';
import source from '../../../examples/advanced/physical-sewout-validation-v1.ns?raw';
import { run } from '../engine.ts';

const TARGETS = [
  'S01',
  'S02',
  'S03',
  'S04',
  'S05',
  'S06',
  'S07',
  'S08',
  'S09',
  'C01',
  'C02',
  'C03',
  'F01',
  'F02',
  'F03',
  'F04',
  'R01',
  'R02',
] as const;

describe('physical sew-out validation v1', () => {
  it('runs the versioned sheet with every measurement target in sew order', () => {
    const result = run(source);

    expect(result.printed).toEqual(['physical-sewout-validation-v1', ...TARGETS]);
    expect(result.events.some((event) => event.t === 'stitch')).toBe(true);
    expect(result.activeHoop).toMatchObject({
      shape: 'rectangle',
      widthMM: 130,
      heightMM: 180,
    });
  });

  it('pins the default specimen metadata and keeps all needle positions in the sewable field', () => {
    const result = run(source);
    const positions = result.events.filter((event) => event.t === 'stitch' || event.t === 'jump');

    expect(result.material).toEqual({
      fabricPreset: 'woven',
      grainHeading: 0,
      stretchAlong: 0,
      stretchAcross: 0,
      threadProfile: 'polyester-40wt',
      threadWidthMM: 0.4,
      needleSize: 75,
      stabilizer: 'tearaway',
      topping: false,
    });
    expect(result.compensation).toMatchObject({
      appliedMode: 'directional-satin',
      fillEndpointMode: 'directional-open-path',
    });
    expect(positions.length).toBeGreaterThan(1_000);
    expect(Math.min(...positions.map((event) => event.x))).toBeGreaterThanOrEqual(-62);
    expect(Math.max(...positions.map((event) => event.x))).toBeLessThanOrEqual(62);
    expect(Math.min(...positions.map((event) => event.y))).toBeGreaterThanOrEqual(-87);
    expect(Math.max(...positions.map((event) => event.y))).toBeLessThanOrEqual(87);
  });
});
