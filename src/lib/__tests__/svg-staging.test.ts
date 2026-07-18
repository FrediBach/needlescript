import { describe, it, expect } from 'vitest';
import {
  signedArea,
  orientationOf,
  pointInPolygon,
  computeHoleMap,
  netFillArea,
  perimeterToAreaRatio,
  selfIntersects,
  normalizedFillGroups,
} from '../svg/geometry.ts';
import { STRATEGIES, eligibleStrategies, isClosedGeom, autoSuggest } from '../svg/strategies.ts';
import { emit, resampleRing } from '../svg/emit.ts';
import { emitAppend, inventoryProgram, mergeAppend } from '../svg/merge.ts';
import { orderOperations } from '../svg/ordering.ts';
import { parseSvgToModel } from '../../svg-import/parse-svg-dom.ts';
import { pathToCurveSpecs } from '../svg/svg-path.ts';
import { defaultStrategy, type StagedDocument, type ElementModel } from '../svg/model.ts';
import { run } from '../interpreter.ts';
import {
  canCreateMotifAlong,
  canCreateRailPair,
  createMotifAlong,
  createRailPair,
} from '../svg/relationships.ts';
import fillAndStrokeFixture from './fixtures/svg/fill-and-stroke.svg?raw';
import compoundNonzeroFixture from './fixtures/svg/compound-nonzero.svg?raw';
import nestedGroupsFixture from './fixtures/svg/nested-groups.svg?raw';
import railPairFixture from './fixtures/svg/rail-pair.svg?raw';
import linearGradientFixture from './fixtures/svg/linear-gradient.svg?raw';

const PALETTE = ['#C8472F', '#31604F', '#3A4E8C', '#D9A441', '#8C4A6B', '#2B2B2B'];

// a 20mm CCW square ring
const SQUARE: [number, number][] = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
  [-10, -10],
];
// a 6mm hole inside it (CW)
const HOLE: [number, number][] = [
  [-3, -3],
  [-3, 3],
  [3, 3],
  [3, -3],
  [-3, -3],
];

describe('svg geometry', () => {
  it('signed area sign encodes orientation', () => {
    expect(signedArea(SQUARE)).toBeGreaterThan(0);
    expect(orientationOf(SQUARE)).toBe('ccw');
    expect(orientationOf(SQUARE.slice().reverse())).toBe('cw');
  });

  it('point-in-polygon', () => {
    expect(pointInPolygon([0, 0], SQUARE)).toBe(true);
    expect(pointInPolygon([99, 99], SQUARE)).toBe(false);
  });

  it('computeHoleMap marks a contained ring as a hole (odd depth)', () => {
    const hm = computeHoleMap([SQUARE, HOLE]);
    expect(hm[0].hole).toBe(false);
    expect(hm[0].depth).toBe(0);
    expect(hm[1].hole).toBe(true);
    expect(hm[1].depth).toBe(1);
  });

  it('netFillArea subtracts holes', () => {
    const hm = computeHoleMap([SQUARE, HOLE]);
    // 20*20 - 6*6 = 400 - 36 = 364
    expect(netFillArea([SQUARE, HOLE], hm)).toBeCloseTo(364, 0);
  });

  it('honors nonzero winding and lowers solid nested rings without a false hole', () => {
    const sameWinding = [SQUARE, HOLE.slice().reverse()];
    const same = computeHoleMap(sameWinding, 'nonzero');
    expect(same[1].hole).toBe(false);
    expect(normalizedFillGroups(same)).toEqual([[0]]);
    expect(netFillArea(sameWinding, same)).toBeCloseTo(400, 0);

    const opposite = computeHoleMap([SQUARE, HOLE], 'nonzero');
    expect(opposite[1].hole).toBe(true);
    expect(normalizedFillGroups(opposite)).toEqual([[0, 1]]);
  });

  it('perimeterToAreaRatio is high for slivers', () => {
    const blob = perimeterToAreaRatio([SQUARE], true);
    const sliver: [number, number][] = [
      [0, 0],
      [40, 0],
      [40, 0.5],
      [0, 0.5],
      [0, 0],
    ];
    expect(perimeterToAreaRatio([sliver], true)).toBeGreaterThan(blob);
  });

  it('detects self-intersection (bowtie)', () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    expect(selfIntersects(bowtie)).toBe(true);
    expect(selfIntersects(SQUARE)).toBe(false);
  });
});

describe('strategy catalogue', () => {
  it('eligibility by geom type', () => {
    expect(isClosedGeom('closedPath')).toBe(true);
    expect(isClosedGeom('openPath')).toBe(false);
    expect(eligibleStrategies('openPath')).toContain('runningMotif');
    expect(eligibleStrategies('openPath')).not.toContain('tatamiFill');
    expect(eligibleStrategies('rect')).toContain('tatamiFill');
  });

  it('auto-suggest: filled closed → tatami', () => {
    const s = autoSuggest('rect', [SQUARE], '#ff0000', null, null);
    expect(s.kind).toBe('tatamiFill');
  });

  it('auto-suggest: safe physical stroke → satin, seeded from stroke width', () => {
    const s = autoSuggest('openPath', [SQUARE], null, '#000000', 2.4);
    expect(s.kind).toBe('satinBorder');
    if (s.kind === 'satinBorder') expect(s.params.width).toBeCloseTo(2.4, 1);
  });

  it('tatami emit wraps rings in beginfill/endfill with hole', () => {
    const el = mkElement({
      rings: [SQUARE, HOLE],
      strategy: defaultStrategy('tatamiFill'),
    });
    const ctx = {
      ringNames: ['crest_outer', 'crest_hole0'],
      holeMap: el.holeMap,
      fillGroups: normalizedFillGroups(el.holeMap),
      scaffoldName: 'crest_grain',
    };
    const lines = STRATEGIES.tatamiFill.emit(el, ctx);
    expect(lines).toContain('beginfill');
    expect(lines).toContain('endfill');
    expect(lines.join('\n')).toContain('sewpath(crest_outer)');
    expect(lines.join('\n')).toContain('sewpath(crest_hole0)');
  });

  it('satin emit brackets the path with satin width / 0', () => {
    const el = mkElement({ rings: [SQUARE], strategy: defaultStrategy('satinBorder') });
    const lines = STRATEGIES.satinBorder.emit(el, {
      ringNames: ['edge'],
      holeMap: el.holeMap,
      fillGroups: [[0]],
      scaffoldName: 'edge_grain',
    });
    expect(lines.some((l) => /^satin \d/.test(l))).toBe(true);
    expect(lines).toContain('satin 0');
  });

  it('directional fill with no field emits an active scaffold', () => {
    const el = mkElement({
      rings: [SQUARE],
      strategy: { kind: 'directionalFill', params: { field: null, fillspacing: 0.73 } },
    });
    const lines = STRATEGIES.directionalFill.emit(el, {
      ringNames: ['petal'],
      holeMap: el.holeMap,
      fillGroups: [[0]],
      scaffoldName: 'petal_grain',
    });
    expect(lines).toContain('def petal_grain(p) [ return 45 ]');
    expect(lines).toContain('fillspacing 0.73');
    expect(lines).toContain('fill dir @petal_grain');
    expect(run(emit(mkDoc([el]), { date: '2026-01-01' }).code).events.length).toBeGreaterThan(0);
  });

  it('observes every non-default strategy control in emitted code', () => {
    const context = {
      ringNames: ['shape'],
      holeMap: computeHoleMap([SQUARE]),
      fillGroups: [[0]],
      scaffoldName: 'shape_grain',
    };
    const outline = mkElement({
      rings: [SQUARE],
      strategy: { kind: 'outline', params: { stitchlen: 3.2, bean: true, beanCount: 5 } },
    });
    expect(STRATEGIES.outline.emit(outline, context)).toEqual(
      expect.arrayContaining(['stitchlen 3.2', 'bean 5', 'bean 0']),
    );

    const satin = mkElement({
      rings: [SQUARE],
      strategy: {
        kind: 'satinBorder',
        params: { width: 3.4, density: 0.55, underlay: 'edge', shortstitch: false },
      },
    });
    expect(STRATEGIES.satinBorder.emit(satin, context)).toEqual(
      expect.arrayContaining([
        'underlay "edge"',
        'shortstitch 0',
        'density 0.55',
        'satin 3.4',
        'shortstitch 1',
        'underlay "auto"',
      ]),
    );

    const tatami = mkElement({
      rings: [SQUARE],
      strategy: {
        kind: 'tatamiFill',
        params: { fillangle: 30, fillspacing: 0.65, filllen: 3.3, fillunderlay: 'off' },
      },
    });
    expect(STRATEGIES.tatamiFill.emit(tatami, context)).toEqual(
      expect.arrayContaining([
        'fillunderlay "off"',
        'fillangle 30',
        'fillspacing 0.65',
        'filllen 3.3',
      ]),
    );

    const running = mkElement({
      rings: [SQUARE],
      strategy: {
        kind: 'runningMotif',
        params: { stitchlen: 2.8, bean: false, estitch: true, estitchLen: 4.2 },
      },
    });
    expect(STRATEGIES.runningMotif.emit(running, context)).toEqual(
      expect.arrayContaining(['stitchlen 2.8', 'estitch 4.2', 'estitch 0']),
    );

    for (const operation of [outline, satin, tatami, running]) {
      expect(() => run(emit(mkDoc([operation]), { date: '2026-01-01' }).code)).not.toThrow();
    }
  });
});

describe('explicit SVG relationships', () => {
  it('creates rail-pair satin only after two open paths are explicitly selected', () => {
    const { doc } = parseSvgToModel(railPairFixture, {
      palette: PALETTE,
      name: 'rail-pair.svg',
      fitMM: 70,
    });
    const sourceIds = doc.operations.map((operation) => operation.id);

    expect(doc.operations).toHaveLength(2);
    expect(doc.operations.some((operation) => operation.role === 'relation')).toBe(false);
    expect(canCreateRailPair(doc, sourceIds)).toBe(true);

    const paired = createRailPair(doc, sourceIds);
    const relation = paired.operations.find((operation) => operation.role === 'relation')!;
    expect(relation).toMatchObject({
      geometryIds: [doc.geometries[0].id, doc.geometries[1].id],
      pathIndices: [0, 0],
      strategy: { kind: 'railPair' },
    });
    expect(
      paired.operations
        .filter((operation) => sourceIds.includes(operation.id))
        .every((operation) => !operation.include),
    ).toBe(true);

    const code = emit(paired, { date: '2026-01-01' }).code;
    expect(code).toContain('let left_rail =');
    expect(code).toContain('let right_rail =');
    expect(code).toContain('satinbetween(left_rail, right_rail)');
    expect(code).not.toMatch(/^satin \d/m);
    expect(run(code).events.length).toBeGreaterThan(0);
  });

  it('rejects implicit, duplicate, multi-path, and closed-path rail pairing', () => {
    const { doc } = parseSvgToModel(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path id="open" d="M10 10 L90 10" fill="none" stroke="#000"/>
        <rect id="closed" x="20" y="30" width="60" height="40" fill="none" stroke="#000"/>
      </svg>`,
      { palette: PALETTE, fitMM: 70 },
    );
    const ids = doc.operations.map((operation) => operation.id);
    expect(canCreateRailPair(doc, ids)).toBe(false);
    expect(createRailPair(doc, ids)).toBe(doc);
  });

  it('emits every rail-pair control without replacing satinbetween with stitches', () => {
    const { doc } = parseSvgToModel(railPairFixture, { palette: PALETTE, fitMM: 70 });
    const paired = createRailPair(
      doc,
      doc.operations.map((operation) => operation.id),
    );
    const relation = paired.operations.find((operation) => operation.role === 'relation')!;
    const edited: StagedDocument = {
      ...paired,
      operations: paired.operations.map((operation) =>
        operation.id === relation.id
          ? {
              ...operation,
              strategy: {
                kind: 'railPair',
                params: { density: 0.65, underlay: 'edge', shortstitch: false },
              },
            }
          : operation,
      ),
    };
    const code = emit(edited, { date: '2026-01-01' }).code;
    expect(code).toContain('underlay "edge"');
    expect(code).toContain('shortstitch 0');
    expect(code).toContain('density 0.65');
    expect(code).toContain('satinbetween(');
    expect(code).toContain('shortstitch 1');
    expect(code).toContain('underlay "auto"');
    expect(() => run(code)).not.toThrow();
  });

  it('keeps motif-along-path as authored path, layout, and procedure composition', () => {
    const { doc } = parseSvgToModel(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
        <path id="route" d="M10 40 C40 5 80 75 110 40" fill="none" stroke="#315c45"/>
        <path id="motif" d="M55 30 L60 20 L65 30 L60 38 Z" fill="none" stroke="#d9a441"/>
      </svg>`,
      { palette: PALETTE, name: 'motifs.svg', fitMM: 70 },
    );
    const ids = doc.operations.map((operation) => operation.id);
    expect(canCreateMotifAlong(doc, ids)).toBe(true);
    const related = createMotifAlong(doc, ids);
    const relation = related.operations.find((operation) => operation.role === 'relation')!;
    const edited: StagedDocument = {
      ...related,
      operations: related.operations.map((operation) =>
        operation.id === relation.id
          ? {
              ...operation,
              strategy: {
                kind: 'motifAlong',
                params: { count: 3, scale: 0.5, stitchlen: 1.7, align: false },
              },
            }
          : operation,
      ),
    };
    const code = emit(edited, { date: '2026-01-01' }).code;

    expect(code).toContain('import std.layout.alongpath as svg_alongpath');
    expect(code).toContain('let route =');
    expect(code).toContain('let motif =');
    expect(code).toMatch(/def route_place_motif\(motif, placement\)/);
    expect(code).toContain('xscale(motif, 0.5), 0)');
    expect(code).toContain('sewpath(resample(placed, 1.7))');
    expect(code).toContain('svg_alongpath(route, 3)');
    expect(() => run(code)).not.toThrow();

    const appended = emitAppend(edited, 'import std.layout.alongpath as placealong\nseed 9\nfd 1', {
      date: '2026-01-01',
    });
    expect(appended.code.match(/^import std\.layout\.alongpath as /gm)).toHaveLength(1);
    expect(appended.code).toContain('placealong(route, 3)');
    expect(() => run(appended.code)).not.toThrow();
  });
});

describe('resampleRing', () => {
  it('keeps endpoints and spaces points ~evenly', () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    const r = resampleRing(line, 2);
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([10, 0]);
    // ~10/2 = 5 segments → 6 points
    expect(r.length).toBeGreaterThanOrEqual(5);
  });
});

describe('emit → run integration', () => {
  it('emits a header, bindings, and runnable sew blocks', () => {
    const doc = mkDoc([
      mkElement({
        id: 'a',
        name: 'crest',
        rings: [SQUARE, HOLE],
        strategy: defaultStrategy('tatamiFill'),
        threadIndex: 2,
      }),
      mkElement({
        id: 'b',
        name: 'badge',
        rings: [SQUARE],
        strategy: defaultStrategy('satinBorder'),
        threadIndex: 1,
      }),
    ]);
    const { code, sewSpans } = emit(doc, { date: '2026-01-01' });
    expect(code).toContain('// imported from logo.svg — 2026-01-01');
    expect(code).toContain('seed 1');
    expect(code).toContain('fabric "woven"');
    expect(code).toContain('let crest_path1 =');
    expect(code).toContain('let crest_path2 =');
    expect(code).toContain('color 2');
    expect(code).toContain('color 1');
    expect(code).toContain('trim');
    expect(Object.keys(sewSpans)).toEqual(['a', 'b']);

    // the real engine must accept it and produce stitches
    const result = run(code);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('skips excluded and skip-strategy elements', () => {
    const doc = mkDoc([
      mkElement({
        id: 'a',
        name: 'keep',
        rings: [SQUARE],
        strategy: defaultStrategy('tatamiFill'),
      }),
      mkElement({ id: 'b', name: 'drop', rings: [SQUARE], strategy: defaultStrategy('skip') }),
      mkElement({
        id: 'c',
        name: 'off',
        rings: [SQUARE],
        strategy: defaultStrategy('tatamiFill'),
        include: false,
      }),
    ]);
    const { code } = emit(doc);
    expect(code).toContain('let keep =');
    expect(code).not.toContain('let drop =');
    expect(code).not.toContain('let off =');
  });

  it('allocates collision-free names for generated subpaths', () => {
    const code = emit(
      mkDoc([
        mkElement({
          id: 'compound',
          name: 'crest',
          rings: [SQUARE, HOLE],
          strategy: defaultStrategy('tatamiFill'),
        }),
        mkElement({
          id: 'named-like-subpath',
          name: 'crest_path1',
          rings: [SQUARE],
          strategy: defaultStrategy('outline'),
        }),
      ]),
      { date: '2026-01-01' },
    ).code;
    expect(code).toContain('let crest_path1 =');
    expect(code).toContain('let crest_path1_2 =');
    expect(() => run(code)).not.toThrow();
  });

  it('manual Solid/Hole edits change the emitted fill topology', () => {
    const operation = mkElement({
      id: 'crest',
      name: 'crest',
      rings: [SQUARE, HOLE],
      strategy: defaultStrategy('tatamiFill'),
    });
    const withHole = emit(mkDoc([operation]), { date: '2026-01-01' }).code;
    expect(withHole).toContain('sewpath(crest_path2)');
    const solidMap = operation.holeMap.map((entry, index) =>
      index === 1 ? { ...entry, hole: false } : entry,
    );
    const solid = emit(mkDoc([{ ...operation, holeMap: solidMap }]), {
      date: '2026-01-01',
    }).code;
    expect(solid).not.toContain('sewpath(crest_path2)');
  });

  it('emits an append fragment without once-only setup and with a color literal', () => {
    const operation = mkElement({
      id: 'append',
      rings: [SQUARE],
      sourceFill: '#ff0000',
      strategy: defaultStrategy('tatamiFill'),
    });
    const fragment = emit(mkDoc([operation]), { mode: 'append', date: '2026-01-01' }).code;
    expect(fragment).not.toMatch(/^seed /m);
    expect(fragment).not.toMatch(/^fabric /m);
    expect(fragment).toContain("color '#ff0000'");
    expect(run(fragment).events.length).toBeGreaterThan(0);
  });

  it('merges append output with the base program and avoids declared names', () => {
    const operation = mkElement({
      id: 'append',
      name: 'crest',
      rings: [SQUARE],
      sourceFill: '#ff0000',
      strategy: defaultStrategy('tatamiFill'),
    });
    const base = `seed 17\nfabric "knit"\nlet crest = 42\nfd 2`;
    const merged = emitAppend(mkDoc([operation]), base, { date: '2026-01-01' });

    expect(merged.code).toContain(base);
    expect(merged.fragmentCode).not.toMatch(/^seed /m);
    expect(merged.fragmentCode).not.toMatch(/^fabric /m);
    expect(merged.code).toContain('let crest_2 =');
    expect(merged.code.match(/^seed /gm)).toHaveLength(1);
    expect(merged.code.match(/^fabric /gm)).toHaveLength(1);
    expect(run(merged.code).events.length).toBeGreaterThan(run(base).events.length);

    const span = merged.sewSpans.append;
    expect(
      merged.code
        .split('\n')
        .slice(span.start - 1, span.end)
        .join('\n'),
    ).toContain('beginfill');
  });

  it('inventories imports, variables, and procedures for append collision checks', () => {
    const inventory = inventoryProgram(
      `import std.shapes.rectpath as rectangle\nlet boundary = []\ndef grain(p) [ return 45 ]`,
    );
    expect(inventory.imports).toEqual([{ specifier: 'std.shapes.rectpath', alias: 'rectangle' }]);
    expect(inventory.usedNames.has('rectangle')).toBe(true);
    expect(inventory.usedNames.has('boundary')).toBe(true);
    expect(inventory.usedNames.has('grain')).toBe(true);
  });

  it('deduplicates compatible append imports and rejects alias conflicts', () => {
    const fragment = {
      code: '',
      imports: ['import std.shapes.rectpath as shapehelper'],
      preamble: ['// fragment'],
      body: ['', 'fd 1'],
      sewSpans: {},
    };
    const compatible = mergeAppend('import std.shapes.rectpath as shapehelper\nfd 1', fragment);
    expect(compatible.code.match(/^import .* as shapehelper$/gm)).toHaveLength(1);
    expect(() =>
      mergeAppend('import std.shapes.ellipsepath as shapehelper\nfd 1', fragment),
    ).toThrow(/already refers to/);
  });
});

describe('operation ordering', () => {
  it('keeps top-level SVG groups contiguous when requested', () => {
    const a = mkElement({
      id: 'a',
      rings: [SQUARE],
      threadIndex: 0,
      sourceOrder: 0,
      groupPath: ['group-a'],
    });
    const b = mkElement({
      id: 'b',
      rings: [SQUARE],
      threadIndex: 2,
      sourceOrder: 1,
      groupPath: ['group-a'],
    });
    const c = mkElement({
      id: 'c',
      rings: [SQUARE],
      threadIndex: 1,
      sourceOrder: 2,
      groupPath: ['group-b'],
    });
    expect(orderOperations([a, b, c], 'color', true).map((operation) => operation.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(orderOperations([a, b, c], 'color', false).map((operation) => operation.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });
});

describe('parseSvgToModel', () => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
    <circle cx="50" cy="50" r="10" fill="none" stroke="#0000ff" stroke-width="3"/>
  </svg>`;

  it('builds an element model in hoop mm and auto-suggests strategies', () => {
    const { doc } = parseSvgToModel(SVG, { palette: PALETTE, name: 'logo.svg', fitMM: 50 });
    expect(doc.name).toBe('logo');
    expect(doc.operations.length).toBe(2);
    const rect = doc.operations.find((e) => e.geomType === 'rect')!;
    expect(rect.strategy.kind).toBe('tatamiFill');
    const circ = doc.operations.find((e) => e.geomType === 'circle')!;
    expect(circ.sourceFill).toBeNull();
    expect(circ.strategy.kind).toBe('outline');
  });

  it('derives adjacent fill and stroke operations that share one geometry', () => {
    const { doc } = parseSvgToModel(fillAndStrokeFixture, { palette: PALETTE, fitMM: 50 });
    expect(doc.sourceObjects).toHaveLength(1);
    expect(doc.geometries).toHaveLength(1);
    expect(doc.operations.map((operation) => operation.role)).toEqual(['fill', 'stroke']);
    expect(doc.operations[0].geometryIds).toEqual(doc.operations[1].geometryIds);
    const code = emit(doc, { date: '2026-01-01' }).code;
    expect(code.match(/let badge =/g)).toHaveLength(1);
    expect(code).toContain('beginfill');
    expect(code).toContain('satin ');
  });

  it('resolves inherited paint, nested group paths, and physical stroke width', () => {
    const { doc } = parseSvgToModel(nestedGroupsFixture, {
      palette: PALETTE,
      fitMM: 60,
    });
    expect(doc.operations.map((operation) => operation.role)).toEqual(['fill', 'stroke']);
    expect(doc.operations[0].groupPath).toEqual(['logo', 'details']);
    expect(doc.operations[1].sourceStrokeWidth).toBeCloseTo(6, 4);
    expect(doc.operations[1].strategy.kind).toBe('satinBorder');
  });

  it('retains physical dash, cap, join, and offset metadata', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">
      <g stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"
        stroke-linejoin="bevel" stroke-dasharray="10 5" stroke-dashoffset="2">
        <line id="route" x1="0" y1="10" x2="100" y2="10"/>
      </g>
    </svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE, fitMM: 50 });
    expect(doc.sourceObjects[0].paint).toMatchObject({
      strokeWidthMM: 2,
      lineCap: 'round',
      lineJoin: 'bevel',
      dashArrayMM: [5, 2.5],
      dashOffsetMM: 1,
    });
  });

  it('normalizes same- and opposite-winding nonzero compound paths', () => {
    const { doc } = parseSvgToModel(compoundNonzeroFixture, { palette: PALETTE, fitMM: 70 });
    const same = doc.operations.find((operation) => operation.name.startsWith('same-winding'))!;
    const opposite = doc.operations.find((operation) =>
      operation.name.startsWith('opposite-winding'),
    )!;
    expect(same.holeMap.map((entry) => entry.hole)).toEqual([false, false]);
    expect(opposite.holeMap.map((entry) => entry.hole)).toEqual([false, true]);
    expect(normalizedFillGroups(same.holeMap)).toEqual([[0]]);
    expect(normalizedFillGroups(opposite.holeMap)).toEqual([[0, 1]]);
  });

  it('keeps mixed open/closed subpaths on shared geometry but fills only closed paths', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path id="mixed" d="M10 10 H40 V40 H10 Z M60 10 L90 40"
        fill="#c8472f" stroke="#2b2b2b"/>
    </svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE, fitMM: 70 });
    const fill = doc.operations.find((operation) => operation.role === 'fill')!;
    const stroke = doc.operations.find((operation) => operation.role === 'stroke')!;
    expect(fill.pathIndices).toEqual([0]);
    expect(stroke.pathIndices).toEqual([0, 1]);
    expect(stroke.geomType).toBe('openPath');
  });

  it('fits and validates against an oval sewable field', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="#c8472f"/>
    </svg>`;
    const { doc } = parseSvgToModel(svg, {
      palette: PALETTE,
      fitMM: 90,
      field: { shape: 'oval', widthMM: 114, heightMM: 69 },
    });
    expect(doc.operations[0].flags.outsideHoop).toBeUndefined();
    expect(doc.operations[0].bbox.maxY - doc.operations[0].bbox.minY).toBeLessThanOrEqual(69.01);
  });

  it('reports unsupported paints instead of silently substituting gray', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs>
      <rect id="gradient" x="10" y="10" width="80" height="80" fill="url(#g)"/>
    </svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE });
    expect(doc.operations).toHaveLength(0);
    expect(doc.sourceObjects[0].findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-paint', severity: 'error' }),
      ]),
    );
    expect(doc.threadMap).not.toHaveProperty('#808080');
  });

  it('parses an opaque 2–8 stop linear gradient in hoop space', () => {
    const { doc } = parseSvgToModel(linearGradientFixture, {
      palette: PALETTE,
      fitMM: 70,
      field: { shape: 'rectangle', widthMM: 94, heightMM: 94 },
    });
    expect(doc.operations).toHaveLength(1);
    const operation = doc.operations[0];
    expect(operation.strategy).toEqual({
      kind: 'gradientFill',
      params: { pitch: 0.5, stitchlen: 2.5 },
    });
    expect(operation.sourceGradient).toMatchObject({
      kind: 'linear',
      id: 'sunset',
      stops: [
        { offset: 0, color: '#c8472f' },
        { offset: 0.5, color: '#d9a441' },
        { offset: 1, color: '#3a4e8c' },
      ],
    });
    expect(operation.sourceGradient!.start).toEqual([-35, 35]);
    expect(operation.sourceGradient!.end).toEqual([35, 35]);
    expect(operation.holeMap.map((ring) => ring.hole)).toEqual([false, true]);
    expect(Object.keys(doc.threadMap)).toEqual(
      expect.arrayContaining(['#c8472f', '#d9a441', '#3a4e8c']),
    );
  });

  it('emits density-neutral SVG gradient rows and runs them through the real engine', () => {
    const { doc: parsed } = parseSvgToModel(linearGradientFixture, {
      palette: PALETTE,
      fitMM: 50,
    });
    const doc: StagedDocument = {
      ...parsed,
      operations: parsed.operations.map((operation) => ({
        ...operation,
        strategy: { kind: 'gradientFill', params: { pitch: 0.75, stitchlen: 3.1 } },
      })),
    };
    const code = emit(doc, { date: '2026-01-01' }).code;
    expect(code).toContain('import std.stitchcraft.gradientrowsn as svg_gradientrowsn');
    expect(code).toContain('import std.stitchcraft.serpentinerows as svg_serpentinerows');
    expect(code).toContain('def gradient_badge_gradient_weights(v)');
    expect(code).toContain('svg_gradientrowsn([gradient_badge_path1, gradient_badge_path2]');
    expect(code).toContain(', 0.75, @gradient_badge_gradient_weights)');
    expect(code).toContain('gradient_badge_gradient_groups[channel] = concat(');
    expect(code).toContain('color gradient_badge_gradient_colors[channel]');
    expect(code).toContain('sewpath(resample(row, 3.1))');
    const result = run(code);
    expect(result.events.filter((event) => event.t === 'stitch').length).toBeGreaterThan(0);
    expect(result.events.filter((event) => event.t === 'color')).toHaveLength(2);
  });

  it('inherits stops, honors user-space vectors and transforms, and preserves append colors', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="base">
          <stop offset="0" stop-color="#c8472f"/>
          <stop offset="1" stop-color="#3a4e8c"/>
        </linearGradient>
        <linearGradient id="turned" href="#base" gradientUnits="userSpaceOnUse"
          x1="0" y1="50" x2="100" y2="50" gradientTransform="rotate(90 50 50)"/>
      </defs>
      <rect x="10" y="10" width="80" height="80" fill="url(#turned)"/>
    </svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE, fitMM: 40 });
    const gradient = doc.operations[0].sourceGradient!;
    expect(gradient.start[0]).toBeCloseTo(0, 6);
    expect(gradient.start[1]).toBeCloseTo(25, 6);
    expect(gradient.end[0]).toBeCloseTo(0, 6);
    expect(gradient.end[1]).toBeCloseTo(-25, 6);

    const appended = emitAppend(
      doc,
      `import std.stitchcraft.gradientrowsn as blendrows
import std.stitchcraft.serpentinerows as routerows
seed 9
fd 1`,
      { date: '2026-01-01' },
    );
    expect(appended.code.match(/^import std\.stitchcraft\.gradientrowsn as /gm)).toHaveLength(1);
    expect(appended.code.match(/^import std\.stitchcraft\.serpentinerows as /gm)).toHaveLength(1);
    expect(appended.fragmentCode).toContain("let rect_1_gradient_colors = ['#c8472f', '#3a4e8c']");
    expect(appended.fragmentCode).toContain('blendrows(');
    expect(appended.fragmentCode).toContain('routerows(');
    expect(() => run(appended.code)).not.toThrow();
  });

  it('keeps radial, repeating, transparent, and oversized gradients as explicit findings', () => {
    const cases = [
      '<radialGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient>',
      '<linearGradient id="g" spreadMethod="repeat"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>',
      '<linearGradient id="g"><stop offset="0" stop-color="red" stop-opacity="0.5"/><stop offset="1" stop-color="blue"/></linearGradient>',
      `<linearGradient id="g">${Array.from({ length: 9 }, (_, index) => `<stop offset="${index / 8}" stop-color="#${index}${index}${index}"/>`).join('')}</linearGradient>`,
    ];
    for (const definition of cases) {
      const { doc } = parseSvgToModel(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
          <defs>${definition}</defs><rect width="10" height="10" fill="url(#g)"/>
        </svg>`,
        { palette: PALETTE },
      );
      expect(doc.operations).toHaveLength(0);
      expect(doc.sourceObjects[0].findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'unsupported-paint', severity: 'error' }),
        ]),
      );
    }
  });

  it('parse → emit → run round-trips to real stitches', () => {
    const { doc } = parseSvgToModel(SVG, { palette: PALETTE, name: 'logo.svg', fitMM: 80 });
    const { code } = emit(doc);
    const result = run(code);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('flags <text> as unsupported and skipped', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
      <text x="10" y="50">hi</text></svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE, name: 'x.svg' });
    const unsupported = doc.sourceObjects.find((object) =>
      object.findings.some((finding) => finding.code === 'unsupported-element'),
    );
    expect(unsupported?.name).toBe('text #1');
  });

  it('keeps a text-only SVG openable as findings without fabricating an operation', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text id="caption" x="10" y="50">hello</text>
    </svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE });
    expect(doc.operations).toHaveLength(0);
    expect(doc.sourceObjects[0]).toMatchObject({ name: 'caption', geometryId: null });
    expect(doc.sourceObjects[0].findings[0].code).toBe('unsupported-element');
  });

  it('retains C/Q/A/Z geometry as editable cubic specs and emits it opt-in', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M10 50 C20 10 40 10 50 50 Q70 90 90 50 A10 10 0 0 1 10 50 Z"
        fill="none" stroke="#000"/></svg>`;
    const { doc } = parseSvgToModel(svg, { palette: PALETTE, name: 'curves.svg', fitMM: 60 });
    expect(doc.geometries[0].curveSpecs?.[0].closed).toBe(true);
    expect(doc.geometries[0].curveSpecs?.[0].anchors.length).toBeGreaterThan(3);
    const legacy = emit(doc, { date: '2026-01-01' }).code;
    expect(legacy).not.toContain('// [curve');
    const editable = emit({ ...doc, editableCurves: true }, { date: '2026-01-01' }).code;
    expect(editable).toContain('// [curve: closed]');
    expect(editable).toContain('curveflat(');
    expect(run(editable).events.length).toBeGreaterThan(0);
  });
});

describe('pathToCurveSpecs', () => {
  it('degree-elevates quadratics and resolves smooth cubic reflection', () => {
    const [spec] = pathToCurveSpecs('M0 0 Q3 6 6 0 T12 0 C14 4 16 4 18 0 S22 -4 24 0');
    expect(spec.anchors).toHaveLength(5);
    expect(spec.anchors[1][1]).toEqual([-2, 4]);
    expect(spec.anchors[2][1]).toEqual([-2, -4]);
    expect(spec.anchors[4][1]).toEqual([-2, -4]);
  });
});

// ---------- helpers ----------

function mkElement(partial: Partial<ElementModel> & { rings: [number, number][][] }): ElementModel {
  const rings = partial.rings;
  const holeMap = computeHoleMap(rings, partial.fillRule ?? 'nonzero');
  const id = partial.id ?? 'el';
  return {
    id,
    sourceObjectId: `source-${id}`,
    geometryIds: [`geometry-${id}`],
    pathIndices: rings.map((_, index) => index),
    name: 'el',
    role: 'fill',
    geomType: 'closedPath',
    bbox: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    areaMm2: netFillArea(rings, holeMap),
    sourceFill: '#ff0000',
    sourceGradient: null,
    sourceStroke: null,
    sourceStrokeWidth: null,
    fillRule: 'nonzero',
    strategy: defaultStrategy('tatamiFill'),
    threadIndex: 0,
    holeMap,
    sourceOrder: 0,
    order: 0,
    include: true,
    flags: {},
    findings: [],
    groupPath: [],
    groupId: null,
    ...partial,
  };
}

function mkDoc(operations: ElementModel[]): StagedDocument {
  operations.forEach((operation, index) => {
    operation.order = index;
    operation.sourceOrder = index;
  });
  return {
    name: 'logo',
    fabric: 'woven',
    sewOrderKey: 'depth',
    keepGroups: true,
    geometryToleranceMM: 0.2,
    scaleFactor: 1,
    seed: 1,
    palette: PALETTE,
    threadMap: {},
    activeField: { shape: 'circle', widthMM: 94, heightMM: 94 },
    sourceObjects: operations.map((operation) => ({
      id: operation.sourceObjectId,
      name: operation.name,
      geometryId: operation.geometryIds[0],
      groupPath: operation.groupPath,
      sourceIndex: operation.sourceOrder,
      paint: {
        fill: operation.sourceFill,
        fillGradient: operation.sourceGradient,
        stroke: operation.sourceStroke,
        strokeWidthMM: operation.sourceStrokeWidth,
        fillRule: operation.fillRule,
        lineCap: 'butt',
        lineJoin: 'miter',
        dashArrayMM: null,
        dashOffsetMM: 0,
        visible: true,
      },
      findings: [],
    })),
    geometries: operations.map((operation) => ({
      id: operation.geometryIds[0],
      sourceObjectId: operation.sourceObjectId,
      name: operation.name,
      kind: 'path',
      groupPath: operation.groupPath,
      paths: operation.rings,
      sourcePaths: operation.rings,
      curveSpecs: operation.curveSpecs,
      closed: operation.rings.map(() => true),
      bbox: operation.bbox,
      outputMode: 'compact',
      flags: {},
    })),
    operations,
  };
}
