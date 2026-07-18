import { describe, expect, it } from 'vitest';
import { FABRICS, QWORD_BUILTINS, designStats, run, toDST, toEXP, toPES } from '../engine.ts';
import type { RunResult, StitchEvent } from '../types.ts';
import { expectPositionalEvents } from './helpers/positional-events.ts';

const RNG_SEED = 90210;
const RNG_BOUND = 1_000_000;

interface BaselineFixture {
  name: string;
  source: string;
}

const square = (size: number) => `beginfill repeat 4 [ fd ${size} rt 90 ] endfill`;

const FIXTURES: BaselineFixture[] = [
  {
    name: 'running stitch',
    source: 'lock 0 autotrim 0 stitchlen 2.5 fd 7 rt 90 fd 3',
  },
  {
    name: 'straight open satin',
    source: "lock 0 autotrim 0 underlay 'off' density 1 satin 4 fd 6 satin 0",
  },
  {
    name: 'curved open satin',
    source: "lock 0 autotrim 0 underlay 'off' density 1 satin 4 arc 90 6 satin 0",
  },
  {
    name: 'curved closed satin',
    source:
      "lock 0 autotrim 0 underlay 'off' density 2 up moveto 0 -5 down satin 3 arc 360 5 satin 0",
  },
  {
    name: 'open rail-pair satin',
    source:
      "lock 0 autotrim 0 underlay 'off' density 1 satinbetween([[-2,0],[-2,6]], [[2,0],[2,6]])",
  },
  {
    name: 'closed rail-pair satin',
    source: `lock 0 autotrim 0 underlay 'off' density 2
      satinbetween([[-4,0],[0,4],[4,0],[0,-4],[-4,0]],
                   [[-2,0],[0,2],[2,0],[0,-2],[-2,0]])`,
  },
  {
    name: 'simple fill',
    source: `lock 0 autotrim 0 fillunderlay 'off' fillspacing 2 filllen 3 ${square(8)}`,
  },
  {
    name: 'concave fill',
    source: `lock 0 autotrim 0 fillunderlay 'off' fillspacing 2 filllen 3
      beginfill
        setxy 0 8 setxy 3 8 setxy 3 3 setxy 8 3 setxy 8 0 setxy 0 0
      endfill`,
  },
  {
    name: 'fill with a hole',
    source: `lock 0 autotrim 0 fillunderlay 'off' fillspacing 2 filllen 3
      beginfill
        repeat 4 [ fd 8 rt 90 ]
        up setxy 3 3 down repeat 4 [ fd 2 rt 90 ]
      endfill`,
  },
  {
    name: 'programmable fill',
    source: `lock 0 autotrim 0 fillunderlay 'off'
      def grain(p) [ return 20 ]
      def shape(p, row, v) [ return [2, 3, 0.25 + (row % 2) * 0.25] ]
      fill dir @grain shape @shape
      ${square(8)}`,
  },
  {
    name: 'custom path fill',
    source: `lock 0 autotrim 0 fillunderlay 'off' filllen 3
      fill paths [[[-1,1],[9,1]], [[9,3],[-1,3]], [[-1,5],[9,5]], [[9,7],[-1,7]]]
      ${square(8)}`,
  },
  {
    name: 'satin center underlay',
    source: "lock 0 autotrim 0 underlay 'center' density 1 satin 4 fd 6 satin 0",
  },
  {
    name: 'satin edge underlay',
    source: "lock 0 autotrim 0 underlay 'edge' density 1 satin 4 fd 6 satin 0",
  },
  {
    name: 'satin zigzag underlay',
    source: "lock 0 autotrim 0 underlay 'zigzag' density 1 satin 4 fd 6 satin 0",
  },
  {
    name: 'satin auto underlay',
    source: "lock 0 autotrim 0 underlay 'auto' density 1 satin 5 fd 6 satin 0",
  },
  {
    name: 'fill tatami underlay',
    source: `lock 0 autotrim 0 fillunderlay 'tatami' fillspacing 2 filllen 3 ${square(8)}`,
  },
  {
    name: 'fill edge underlay',
    source: `lock 0 autotrim 0 fillunderlay 'edge' fillspacing 2 filllen 3 ${square(8)}`,
  },
  {
    name: 'fill auto underlay',
    source: `lock 0 autotrim 0 fillunderlay 'auto' fillspacing 2 filllen 3 ${square(8)}`,
  },
  {
    name: 'nearest travel planning',
    source: `plan 'nearest' lock 0 autotrim 0 stitchlen 12
      down fd 1 trim
      up setxy 20 0 down fd 1 trim
      up setxy 5 0 down fd 1`,
  },
  {
    name: 'reversing-nearest travel planning',
    source: `plan 'reversing-nearest' lock 0 autotrim 0 stitchlen 20
      down setxy 0 1 trim
      up setxy 10 0 down setxy 2 0`,
  },
];

function withRngProbe(source: string): string {
  return `seed ${RNG_SEED}\n${source}\nprint random(${RNG_BOUND})`;
}

function round(value: number): number {
  const rounded = Number(value.toFixed(9));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function eventSnapshot(event: StitchEvent): string {
  const suffix = [
    `c${event.c}`,
    event.u === 1 ? 'underlay' : '',
    event.line === undefined ? '' : `line${event.line}`,
    event.label === undefined ? '' : `label=${event.label}`,
  ]
    .filter(Boolean)
    .join(' ');
  return `${event.t} ${round(event.x)},${round(event.y)} ${suffix}`;
}

function resultSnapshot(result: RunResult) {
  const stats = designStats(result.events, result.plan);
  return {
    events: result.events.map(eventSnapshot),
    warnings: result.warnings,
    printed: result.printed,
    density: {
      cellMM: result.density.cellMM,
      cellCount: result.density.cells.length,
      peak: round(result.density.peak),
      hotspots: result.density.hotspots.map((hotspot) => ({
        ...hotspot,
        x: round(hotspot.x),
        y: round(hotspot.y),
        value: round(hotspot.value),
      })),
    },
    stats: Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [
        key,
        typeof value === 'number' ? round(value) : value,
      ]),
    ),
    plan: result.plan,
  };
}

function byteFingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${bytes.length} bytes, fnv1a32=${hash.toString(16).padStart(8, '0')}`;
}

describe('embroidery construction characterization fixtures', () => {
  const rngControl = run(`seed ${RNG_SEED}\nprint random(${RNG_BOUND})`).printed[0];

  it.each(FIXTURES)('$name pins events, warnings, density, stats, and RNG behavior', (fixture) => {
    const first = run(withRngProbe(fixture.source));
    const second = run(withRngProbe(fixture.source));

    expectPositionalEvents(second.events, first.events, { includeLine: true });
    expect(first.printed[0]).toBe(rngControl);
    expect(resultSnapshot(first)).toMatchSnapshot();
  });

  it('reports the first positional mismatch with actionable context', () => {
    const expected: StitchEvent[] = [{ t: 'stitch', x: 1, y: 2, c: 0 }];
    const actual: StitchEvent[] = [{ t: 'stitch', x: 1.25, y: 2, c: 0 }];
    expect(() => expectPositionalEvents(actual, expected)).toThrowError(
      /first differ at index 0[\s\S]*Expected: stitch \(1, 2\)[\s\S]*Received: stitch \(1\.25, 2\)/,
    );
  });
});

describe('fabric preset characterization', () => {
  it('pins the documented preset registry exactly', () => {
    expect(QWORD_BUILTINS.fabric).toEqual([
      'woven',
      'knit',
      'stretch',
      'denim',
      'canvas',
      'fleece',
    ]);
    expect(FABRICS).toEqual({
      woven: { pull: 0.2, maxDensity: 3.5 },
      knit: { pull: 0.5, maxDensity: 3, densityFloor: 0.45 },
      stretch: { pull: 0.6, maxDensity: 2.8, densityFloor: 0.5 },
      denim: { pull: 0.15, maxDensity: 4 },
      canvas: { pull: 0.15, maxDensity: 4 },
      fleece: {
        pull: 0.3,
        maxDensity: 2.6,
        doubleUnderlay: true,
        note: 'fleece: consider a water-soluble topping so stitches don’t sink into the pile',
      },
    });
  });

  it.each(QWORD_BUILTINS.fabric)('%s applies its current satin and fill settings', (fabric) => {
    const satin = run(`lock 0 autotrim 0 fabric '${fabric}' satin 5 fd 8 satin 0`);
    const fill = run(`lock 0 autotrim 0 fabric '${fabric}' fillspacing 2 filllen 3 ${square(8)}`);
    const topping = satin.events.filter((event) => event.t === 'stitch' && event.u !== 1);
    const satinUnderlay = satin.events.filter((event) => event.u === 1);
    const fillUnderlay = fill.events.filter((event) => event.u === 1);

    expect({
      fabric,
      maxToppingX: round(Math.max(...topping.map((event) => Math.abs(event.x)))),
      toppingCount: topping.length,
      satinUnderlayCount: satinUnderlay.length,
      fillUnderlayCount: fillUnderlay.length,
      satinWarnings: satin.warnings,
      fillWarnings: fill.warnings,
    }).toMatchSnapshot();
  });
});

describe('representative embroidery exporter baselines', () => {
  const exportFixtures = [
    {
      name: 'running, travel, color, and satin',
      source: `lock 0 autotrim 0 stitchlen 3 fd 6 trim up setxy 12 0 color 2 down
        underlay 'center' density 1 satin 4 fd 6 satin 0`,
    },
    {
      name: 'holed fill',
      source: FIXTURES.find((fixture) => fixture.name === 'fill with a hole')!.source,
    },
  ];

  it.each(exportFixtures)('$name pins DST, PES, and EXP bytes', (fixture) => {
    const result = run(fixture.source);
    expect({
      dst: byteFingerprint(toDST(result.events, fixture.name)),
      pes: byteFingerprint(toPES(result.events, fixture.name, result.colorTable)),
      exp: byteFingerprint(toEXP(result.events, fixture.name)),
    }).toMatchSnapshot();
  });
});
