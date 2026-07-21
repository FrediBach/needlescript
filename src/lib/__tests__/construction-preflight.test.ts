import { describe, expect, it } from 'vitest';
import { CONSTRUCTION_PREFLIGHT_THRESHOLDS, resolveMachineProfile, run } from '../engine.ts';
import { analyzeConstructionPreflight } from '../embroidery/preflight-construction.ts';
import type {
  ConstructionEventRecord,
  ConstructionRecord,
  FillConstructionRecord,
  SatinConstructionRecord,
} from '../embroidery/construction-metadata.ts';
import type { StitchEvent } from '../engine.ts';

const stitch = (x: number, y: number, line = 1, underlay = false): StitchEvent => ({
  t: 'stitch',
  x,
  y,
  c: 0,
  line,
  ...(underlay ? { u: 1 as const } : {}),
});

const squareRegion = (half = 5): [number, number][][] => [
  [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ],
];

function fillRecord(overrides: Partial<FillConstructionRecord> = {}): FillConstructionRecord {
  return {
    kind: 'fill',
    id: 1,
    line: 4,
    region: squareRegion(),
    authoredRegion: squareRegion(),
    fillInsetMM: 0,
    edgeRunInsetMM: 0,
    connectors: [],
    events: [],
    ...overrides,
  };
}

function satinRecord(overrides: Partial<SatinConstructionRecord> = {}): SatinConstructionRecord {
  return {
    kind: 'satin',
    id: 2,
    line: 8,
    sections: [
      { a: [-1, 0], b: [1, 0] },
      { a: [-1, 8], b: [1, 8] },
    ],
    events: [],
    ...overrides,
  };
}

const codes = (records: readonly ConstructionRecord[], events: readonly StitchEvent[] = []) =>
  analyzeConstructionPreflight(records, events).map(({ code }) => code);

function fillRows(xs: readonly number[]) {
  const entries: ConstructionEventRecord[] = [];
  for (const x of xs) {
    if (entries.length)
      entries.push({ event: { t: 'jump', x, y: -5, c: 0, line: 4 }, layer: 'travel' });
    entries.push({ event: stitch(x, -5, 4), layer: 'topping' });
    entries.push({ event: stitch(x, 5, 4), layer: 'topping' });
  }
  return entries;
}

describe('construction-aware preflight', () => {
  it('checks underlay against an explicit envelope and ignores an adjacent safe point', () => {
    const outside = stitch(5.2, 0, 4, true);
    const inside = stitch(4.9, 0, 4, true);

    expect(
      codes([fillRecord({ events: [{ event: outside, layer: 'underlay' }] })], [outside]),
    ).toContain('construction.underlay-outside-topping');
    expect(
      codes([fillRecord({ events: [{ event: inside, layer: 'underlay' }] })], [inside]),
    ).not.toContain('construction.underlay-outside-topping');

    const narrowed = run(`preflight 'warn'
      def narrow(t,s,i,u) [
        if s < 0.5 [ return [0.4, 0.2, 0.2, 0, 0] ]
        return [0.4, 2, 2, 0, 0]
      ]
      underlay 'edge' underlayinset 0.5 satin @narrow fd 10 satin 0`);
    expect(narrowed.preflight?.issues).toContainEqual(
      expect.objectContaining({ code: 'construction.underlay-outside-topping' }),
    );
  });

  it('reports missing and unsuitable underlay only after a construction crosses the width gate', () => {
    const topping = stitch(2, 4, 8);
    const foundation = stitch(0, 4, 8, true);
    const wide = satinRecord({
      underlayMode: 'off',
      sections: [
        { a: [-2, 0], b: [2, 0] },
        { a: [-2, 8], b: [2, 8] },
      ],
      events: [{ event: topping, layer: 'topping' }],
    });
    const narrow = satinRecord({
      underlayMode: 'off',
      sections: [
        { a: [-1.95, 0], b: [1.95, 0] },
        { a: [-1.95, 8], b: [1.95, 8] },
      ],
      events: [{ event: topping, layer: 'topping' }],
    });
    const centerOnly = satinRecord({
      ...wide,
      underlayMode: 'center',
      events: [
        { event: foundation, layer: 'underlay' },
        { event: topping, layer: 'topping' },
      ],
    });
    const supported = satinRecord({ ...centerOnly, underlayMode: 'zigzag' });

    const missing = analyzeConstructionPreflight([wide], [topping]).find(
      ({ code }) => code === 'underlay.missing-wide-construction',
    );
    expect(missing).toMatchObject({
      constructionIds: [2],
      measurements: [expect.objectContaining({ value: 4, threshold: 4, unit: 'mm' })],
    });
    expect(codes([narrow], [topping])).not.toContain('underlay.missing-wide-construction');
    expect(codes([centerOnly], [foundation, topping])).toContain(
      'underlay.unsuitable-wide-construction',
    );
    expect(codes([supported], [foundation, topping])).not.toContain(
      'underlay.unsuitable-wide-construction',
    );
    expect(
      run("underlay 'center' underlaypasses ['zigzag'] satin 4 fd 8 satin 0", {
        physicsAnalysis: 'full',
      }).physics?.diagnostics.some(({ code }) => code === 'underlay.unsuitable-wide-construction'),
    ).toBe(false);
  });

  it('measures construction-level coverage gaps with a bounded spatial sample', () => {
    const sparseEvents = fillRows([-4.5, 4.5]);
    const coveredEvents = fillRows(Array.from({ length: 10 }, (_, index) => -4.5 + index));
    const sparse = fillRecord({ events: sparseEvents });
    const covered = fillRecord({ events: coveredEvents });
    const issue = analyzeConstructionPreflight(
      [sparse],
      sparseEvents.map(({ event }) => event),
      { material: { ...run('').material, threadWidthMM: 0.4 } },
    ).find(({ code }) => code === 'coverage.construction-gap');

    expect(issue).toMatchObject({
      constructionIds: [1],
      measurements: expect.arrayContaining([
        expect.objectContaining({ unit: 'percent', threshold: 20 }),
      ]),
      geometry: expect.arrayContaining([expect.objectContaining({ kind: 'cell' })]),
    });
    expect(
      analyzeConstructionPreflight(
        [covered],
        coveredEvents.map(({ event }) => event),
        { material: run('').material },
      ).some(({ code }) => code === 'coverage.construction-gap'),
    ).toBe(false);
  });

  it('measures excessive short-stitch ratios per explicit construction', () => {
    const events = Array.from({ length: 14 }, (_, index) => stitch(0, index * 0.2, 8));
    const safeEvents = Array.from({ length: 14 }, (_, index) => stitch(0, index, 8));
    const context = { profile: resolveMachineProfile(3.5) };
    const issue = analyzeConstructionPreflight(
      [satinRecord({ events: events.map((event) => ({ event, layer: 'topping' })) })],
      events,
      context,
    ).find(({ code }) => code === 'stitch.construction-short-ratio');

    expect(issue).toMatchObject({
      sourceLocations: expect.arrayContaining([expect.objectContaining({ line: 8 })]),
      measurements: expect.arrayContaining([
        expect.objectContaining({ value: 100, threshold: 25, unit: 'percent' }),
      ]),
    });
    expect(
      analyzeConstructionPreflight(
        [satinRecord({ events: safeEvents.map((event) => ({ event, layer: 'topping' })) })],
        safeEvents,
        context,
      ).some(({ code }) => code === 'stitch.construction-short-ratio'),
    ).toBe(false);
  });

  it('keeps directional mismatch informational and accepts directional construction mode', () => {
    const source = "fabric 'woven' fabricstretch 0 1 underlay 'auto' satin 4 fd 8 satin 0";
    const mismatch = run(source, { physicsAnalysis: 'full' }).physics?.diagnostics.find(
      ({ code }) => code === 'material.directional-compensation-mismatch',
    );
    const directional = run(`compensation 'directional' ${source}`, {
      physicsAnalysis: 'full',
    });

    expect(mismatch).toMatchObject({ severity: 'info', evidence: 'experimental' });
    expect(mismatch?.measurements?.[0]).toMatchObject({ unit: 'mm', threshold: 0.05 });
    expect(
      directional.physics?.diagnostics.some(
        ({ code }) => code === 'material.directional-compensation-mismatch',
      ),
    ).toBe(false);
  });

  it('reports small and dense explicit fill-to-satin-border overlap', () => {
    const common = `preflight 'warn' lock 0 autotrim 0 maxdensity 0 fillunderlay 'off'
      fillspacing 2 filllen 2`;
    const construction = `beginfill repeat 4 [ fd 20 rt 90 ] endfill
      satin 4 repeat 4 [ fd 20 rt 90 ] satin 0`;
    const dense = run(`${common} fillinset 0 ${construction}`);
    const safe = run(`${common} fillinset 1 ${construction}`);
    const small = run(`${common} fillinset 2 ${construction}`);

    expect(dense.preflight?.issues).toContainEqual(
      expect.objectContaining({
        code: 'fill.border-overlap-dense',
        constructionIds: [1, 2],
      }),
    );
    expect(safe.preflight?.issues.some(({ code }) => code.startsWith('fill.border-overlap'))).toBe(
      false,
    );
    expect(small.preflight?.issues).toContainEqual(
      expect.objectContaining({
        code: 'fill.border-overlap-too-small',
        constructionIds: [1, 2],
      }),
    );
  });

  it('identifies explicit edge-run and satin-border stacking', () => {
    const result = run(`preflight 'warn' lock 0 autotrim 0 maxdensity 0 fillunderlay 'off'
      fillspacing 2 filllen 2 filledgerun 0.2
      beginfill repeat 4 [ fd 20 rt 90 ] endfill
      satin 2 repeat 4 [ fd 20 rt 90 ] satin 0`);
    const issue = result.preflight?.issues.find(
      ({ code }) => code === 'fill.edge-run-border-stack',
    );

    expect(issue).toMatchObject({ severity: 'warning', constructionIds: [1, 2] });
    expect(issue?.points).toHaveLength(1);
  });

  it('finds a sewn connector crossing a known fill hole and accepts a jump', () => {
    const region = [
      ...squareRegion(),
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as [number, number][],
    ];
    const connector = {
      fillId: 1,
      policy: 'legacy' as const,
      action: 'sew' as const,
      from: [-4, 0] as const,
      to: [4, 0] as const,
      distanceMM: 8,
      edgeMarginMM: 0.1,
      line: 4,
    };

    expect(codes([fillRecord({ region, connectors: [connector] })])).toContain(
      'fill.connector-outside-region',
    );
    expect(
      codes([
        fillRecord({
          region,
          connectors: [{ ...connector, action: 'jump' }],
        }),
      ]),
    ).not.toContain('fill.connector-outside-region');
  });

  it('detects adjacent split-lane penetration hotspots without flagging separated lanes', () => {
    const clustered = Array.from(
      { length: CONSTRUCTION_PREFLIGHT_THRESHOLDS.splitHotspotPenetrations },
      (_, index) => ({
        event: stitch(index * 0.05, 2, 8),
        layer: 'topping' as const,
        lane: index % 2,
      }),
    );
    const safe = clustered.map((entry, index) => ({
      ...entry,
      event: stitch(index * 0.5, 2, 8),
    }));
    const split = (events: SatinConstructionRecord['events']) =>
      satinRecord({ splitColumnCount: 2, splitOverlapMM: 0.5, events });

    expect(
      codes(
        [split(clustered)],
        clustered.map(({ event }) => event),
      ),
    ).toContain('satin.split-overlap-hotspot');
    expect(
      codes(
        [split(safe)],
        safe.map(({ event }) => event),
      ),
    ).not.toContain('satin.split-overlap-hotspot');
  });

  it('checks planned layer order by event identity and keeps each split lane independent', () => {
    const underlay = stitch(0, 1, 8, true);
    const topping = stitch(1, 1, 8);
    const record = satinRecord({
      events: [
        { event: underlay, layer: 'underlay' },
        { event: topping, layer: 'topping' },
      ],
    });

    expect(codes([record], [topping, underlay])).toContain('construction.layer-order');
    expect(codes([record], [underlay, topping])).not.toContain('construction.layer-order');
  });

  it('keeps generated fill, spine, rail-pair, programmable, and split layers in safe order', () => {
    const sources = [
      "underlay 'edge' satin 4 fd 8 satin 0",
      "underlay 'edge' scale 1.2 [ satin 4 fd 8 satin 0 ]",
      `def shape(t,s,i,u) [ return [0.4, 2, 2, 0, 0] ]
       underlay 'edge' satin @shape fd 8 satin 0`,
      "underlay 'edge' satinbetween([[-2,0],[-2,8]], [[2,0],[2,8]])",
      "underlay 'edge' satinwide 'split' satinmaxwidth 6 satin 10 fd 8 satin 0",
      "fillunderlay 'edge' beginfill repeat 4 [ fd 8 rt 90 ] endfill",
    ];

    for (const source of sources)
      expect(
        run(`preflight 'warn'\n${source}`).preflight?.issues.some(
          ({ code }) => code === 'construction.layer-order',
        ),
      ).toBe(false);
  });

  it('does not infer construction relationships from ordinary running stitches', () => {
    const result = run("preflight 'warn' lock 0 repeat 8 [ fd 1 rt 45 ]");

    expect(
      result.preflight?.issues.some(({ code }) =>
        [
          'construction.underlay-outside-topping',
          'fill.border-overlap-too-small',
          'fill.border-overlap-dense',
          'fill.edge-run-border-stack',
          'satin.split-overlap-hotspot',
          'fill.connector-outside-region',
          'construction.layer-order',
        ].includes(code),
      ),
    ).toBe(false);
  });
});
