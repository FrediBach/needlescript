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
import { orderOperations } from '../svg/ordering.ts';
import { parseSvgToModel } from '../../svg-import/parse-svg-dom.ts';
import { pathToCurveSpecs } from '../svg/svg-path.ts';
import { defaultStrategy, type StagedDocument, type ElementModel } from '../svg/model.ts';
import { run } from '../interpreter.ts';
import fillAndStrokeFixture from './fixtures/svg/fill-and-stroke.svg?raw';
import compoundNonzeroFixture from './fixtures/svg/compound-nonzero.svg?raw';
import nestedGroupsFixture from './fixtures/svg/nested-groups.svg?raw';

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
