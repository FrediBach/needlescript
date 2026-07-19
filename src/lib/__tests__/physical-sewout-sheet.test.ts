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

const SPECIMENS = [
  {
    id: 'W01',
    fabric: 'woven',
    thread: 'polyester-40wt',
    needle: 75,
    stabilizer: 'tearaway',
    topping: 0,
    threadWidthMM: 0.4,
  },
  {
    id: 'K01',
    fabric: 'knit',
    thread: 'polyester-40wt',
    needle: 75,
    stabilizer: 'cutaway',
    topping: 0,
    threadWidthMM: 0.4,
  },
  {
    id: 'X01',
    fabric: 'stretch',
    thread: 'polyester-40wt',
    needle: 75,
    stabilizer: 'cutaway',
    topping: 0,
    threadWidthMM: 0.4,
  },
  {
    id: 'D01',
    fabric: 'denim',
    thread: 'polyester-40wt',
    needle: 90,
    stabilizer: 'tearaway',
    topping: 0,
    threadWidthMM: 0.4,
  },
  {
    id: 'D02',
    fabric: 'canvas',
    thread: 'polyester-40wt',
    needle: 90,
    stabilizer: 'tearaway',
    topping: 0,
    threadWidthMM: 0.4,
  },
  {
    id: 'P01',
    fabric: 'fleece',
    thread: 'polyester-40wt',
    needle: 75,
    stabilizer: 'cutaway',
    topping: 1,
    threadWidthMM: 0.4,
  },
  {
    id: 'W02',
    fabric: 'woven',
    thread: 'rayon-60wt',
    needle: 65,
    stabilizer: 'tearaway',
    topping: 0,
    threadWidthMM: 0.3,
  },
] as const;

function sourceForSpecimen(specimen: (typeof SPECIMENS)[number]): string {
  return source
    .replace("let sheet_fabric = 'woven'", `let sheet_fabric = '${specimen.fabric}'`)
    .replace("let sheet_thread = 'polyester-40wt'", `let sheet_thread = '${specimen.thread}'`)
    .replace('let sheet_needle = 75', `let sheet_needle = ${specimen.needle}`)
    .replace("let sheet_stabilizer = 'tearaway'", `let sheet_stabilizer = '${specimen.stabilizer}'`)
    .replace('let sheet_topping = 0', `let sheet_topping = ${specimen.topping}`);
}

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

  it.each(SPECIMENS)('$id compiles its material setup inside the sewable field', (specimen) => {
    const result = run(sourceForSpecimen(specimen));
    const positions = result.events.filter((event) => event.t === 'stitch' || event.t === 'jump');

    expect(result.material).toMatchObject({
      fabricPreset: specimen.fabric,
      threadProfile: specimen.thread,
      threadWidthMM: specimen.threadWidthMM,
      needleSize: specimen.needle,
      stabilizer: specimen.stabilizer,
      topping: Boolean(specimen.topping),
    });
    expect(result.printed).toEqual(['physical-sewout-validation-v1', ...TARGETS]);
    expect(Math.min(...positions.map((event) => event.x))).toBeGreaterThanOrEqual(-62);
    expect(Math.max(...positions.map((event) => event.x))).toBeLessThanOrEqual(62);
    expect(Math.min(...positions.map((event) => event.y))).toBeGreaterThanOrEqual(-87);
    expect(Math.max(...positions.map((event) => event.y))).toBeLessThanOrEqual(87);
    expect(result.warnings.some((warning) => /outside the .*field/.test(warning))).toBe(false);
  });
});
