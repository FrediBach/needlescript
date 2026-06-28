import { describe, it, expect } from 'vitest';
import {
  signedArea,
  orientationOf,
  pointInPolygon,
  computeHoleMap,
  netFillArea,
  perimeterToAreaRatio,
  selfIntersects,
} from '../svg/geometry.ts';
import { STRATEGIES, eligibleStrategies, isClosedGeom, autoSuggest } from '../svg/strategies.ts';
import { emit, resampleRing } from '../svg/emit.ts';
import { parseSvgToModel } from '../svg/parse.ts';
import { defaultStrategy, type StagedDocument, type ElementModel } from '../svg/model.ts';
import { run } from '../interpreter.ts';

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

  it('auto-suggest: stroked-only → satin, seeded from stroke width', () => {
    const s = autoSuggest('openPath', [SQUARE], null, '#000000', 2.4);
    expect(s.kind).toBe('satinBorder');
    if (s.kind === 'satinBorder') expect(s.params.width).toBeCloseTo(2.4, 1);
  });

  it('tatami emit wraps rings in beginfill/endfill with hole', () => {
    const el = mkElement({
      rings: [SQUARE, HOLE],
      strategy: defaultStrategy('tatamiFill'),
    });
    const ctx = { ringNames: ['crest_outer', 'crest_hole0'], holeMap: el.holeMap };
    const lines = STRATEGIES.tatamiFill.emit(el, ctx);
    expect(lines).toContain('beginfill');
    expect(lines).toContain('endfill');
    expect(lines.join('\n')).toContain('sewpath(crest_outer)');
    expect(lines.join('\n')).toContain('sewpath(crest_hole0)');
  });

  it('satin emit brackets the path with satin width / 0', () => {
    const el = mkElement({ rings: [SQUARE], strategy: defaultStrategy('satinBorder') });
    const lines = STRATEGIES.satinBorder.emit(el, { ringNames: ['edge'], holeMap: el.holeMap });
    expect(lines.some((l) => /^satin \d/.test(l))).toBe(true);
    expect(lines).toContain('satin 0');
  });

  it('directional fill with no field emits a commented scaffold', () => {
    const el = mkElement({ rings: [SQUARE], strategy: defaultStrategy('directionalFill') });
    const lines = STRATEGIES.directionalFill.emit(el, {
      ringNames: ['petal'],
      holeMap: el.holeMap,
    });
    expect(lines.every((l) => l.startsWith('//'))).toBe(true);
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
    expect(code).toContain('let crest_outer =');
    expect(code).toContain('let crest_hole0 =');
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
});

describe('parseSvgToModel', () => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
    <circle cx="50" cy="50" r="10" fill="none" stroke="#0000ff" stroke-width="3"/>
  </svg>`;

  it('builds an element model in hoop mm and auto-suggests strategies', () => {
    const { doc } = parseSvgToModel(SVG, { palette: PALETTE, name: 'logo.svg', fitMM: 50 });
    expect(doc.name).toBe('logo');
    expect(doc.elements.length).toBe(2);
    const rect = doc.elements.find((e) => e.geomType === 'rect')!;
    expect(rect.strategy.kind).toBe('tatamiFill');
    const circ = doc.elements.find((e) => e.geomType === 'circle')!;
    expect(circ.sourceFill).toBeNull();
    expect(circ.strategy.kind).toBe('satinBorder');
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
    const unsup = doc.elements.find((e) => e.flags.unsupported);
    expect(unsup).toBeTruthy();
    expect(unsup!.include).toBe(false);
  });
});

// ---------- helpers ----------

function mkElement(partial: Partial<ElementModel> & { rings: [number, number][][] }): ElementModel {
  const rings = partial.rings;
  const holeMap = computeHoleMap(rings);
  return {
    id: 'el',
    name: 'el',
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
    order: 0,
    include: true,
    flags: {},
    groupId: null,
    ...partial,
  };
}

function mkDoc(elements: ElementModel[]): StagedDocument {
  elements.forEach((el, i) => (el.order = i));
  return {
    name: 'logo',
    fabric: 'woven',
    sewOrderKey: 'depth',
    keepGroups: true,
    resampleMM: 2.5,
    seed: 1,
    palette: PALETTE,
    threadMap: {},
    elements,
  };
}
