import { describe, expect, it } from 'vitest';
import { DEFAULT_THREAD_WIDTH_MM, DensityGrid, densityMap, run } from '../engine.ts';
import type { DensityCell, StitchEvent } from '../engine.ts';

const EVENTS: StitchEvent[] = [
  { t: 'stitch', x: 0, y: 0, c: 0, line: 1 },
  { t: 'stitch', x: 5, y: 0, c: 0, line: 1 },
  { t: 'jump', x: 5, y: 5, c: 0, line: 2 },
  { t: 'stitch', x: 5, y: 0, c: 0, line: 2 },
  { t: 'stitch', x: 0.05, y: 0.02, c: 0, line: 3 },
];

function geometry(cells: DensityCell[]) {
  return cells.map(({ ix, iy, count }) => ({ ix, iy, count }));
}

describe('thread-aware coverage', () => {
  it('preserves the complete legacy default map values at 0.4 mm', () => {
    const { threadWidthMM, ...legacyMap } = densityMap(EVENTS, 1, 3);

    expect(threadWidthMM).toBe(DEFAULT_THREAD_WIDTH_MM);
    expect(legacyMap).toEqual({
      cellMM: 1,
      cells: [
        { ix: 0, iy: 0, count: 2, layers: 0.7960032323100408 },
        { ix: 5, iy: 0, count: 2, layers: 0.4 },
        { ix: 1, iy: 0, count: 0, layers: 0.7960032323100408 },
        { ix: 2, iy: 0, count: 0, layers: 0.7960032323100408 },
        { ix: 3, iy: 0, count: 0, layers: 0.7960032323100408 },
        { ix: 4, iy: 0, count: 0, layers: 0.7960032323100408 },
        { ix: 5, iy: 4, count: 0, layers: 0.4 },
        { ix: 5, iy: 3, count: 0, layers: 0.4 },
        { ix: 5, iy: 2, count: 0, layers: 0.4 },
        { ix: 5, iy: 1, count: 0, layers: 0.4 },
      ],
      peak: 0.7960032323100408,
      hotspots: [],
    });
  });

  it('uses supplied width consistently in DensityGrid and densityMap', () => {
    const grid = new DensityGrid(1, 0.3);
    for (const event of EVENTS) grid.feed(event.t, event.x, event.y, event.line);

    expect(grid.threadWidthMM).toBe(0.3);
    expect(grid.finalize(3)).toEqual(densityMap(EVENTS, 1, 3, 0.3));
    expect(() => new DensityGrid(1, 0)).toThrow(/positive finite/);
    expect(() => grid.setThreadWidthMM(Number.NaN)).toThrow(/positive finite/);
  });

  it('reports different 40 wt and 60 wt coverage for byte-identical stitch geometry', () => {
    const source = 'lock 0 autotrim 0 stitchlen 1 fd 20';
    const forty = run(`threadprofile 'polyester-40wt' ${source}`);
    const sixty = run(`threadprofile 'polyester-60wt' ${source}`);

    expect(sixty.events).toEqual(forty.events);
    expect(geometry(sixty.density.cells)).toEqual(geometry(forty.density.cells));
    expect(forty.density.threadWidthMM).toBe(0.4);
    expect(sixty.density.threadWidthMM).toBe(0.3);
    expect(sixty.density.peak).toBeCloseTo(forty.density.peak * 0.75, 12);
    for (let index = 0; index < forty.density.cells.length; index++) {
      expect(sixty.density.cells[index].layers).toBeCloseTo(
        forty.density.cells[index].layers * 0.75,
        12,
      );
    }
  });

  it('lets explicit threadwidth override coverage without changing geometry', () => {
    const source = 'lock 0 autotrim 0 stitchlen 1 fd 20';
    const defaultWidth = run(source);
    const narrow = run(`threadwidth 0.2 ${source}`);

    expect(narrow.events).toEqual(defaultWidth.events);
    expect(narrow.density.threadWidthMM).toBe(0.2);
    expect(narrow.density.peak).toBeCloseTo(defaultWidth.density.peak * 0.5, 12);
  });

  it('uses the same configured width for live history queries and final heatmap', () => {
    const result = run(`
      lock 0
      stitchlen 1
      fd 20
      threadprofile 'rayon-60wt'
      print coverat([0, 10])
    `);
    const live = Number(result.printed[0]);
    const cell = result.density.cells.find(({ ix, iy }) => ix === 0 && iy === 10);

    expect(result.density.threadWidthMM).toBe(0.3);
    expect(cell).toBeDefined();
    expect(live).toBeCloseTo(cell!.layers, 12);
  });

  it('keeps maxdensity as an absolute layer threshold', () => {
    const forty = densityMap(EVENTS, 1, 0.7, 0.4);
    const sixty = densityMap(EVENTS, 1, 0.7, 0.3);

    expect(forty.hotspots.some(({ kind }) => kind === 'density')).toBe(true);
    expect(sixty.hotspots.some(({ kind }) => kind === 'density')).toBe(false);
  });

  it('restores scoped thread width and continues excluding lock stitches', () => {
    const scoped = run(`
      threadprofile 'rayon-40wt'
      stitchscope [ threadprofile 'rayon-60wt' ]
      lock 0 stitchlen 1 fd 20
      print coverat([0, 10])
    `);
    const cell = scoped.density.cells.find(({ ix, iy }) => ix === 0 && iy === 10)!;
    expect(scoped.density.threadWidthMM).toBe(0.4);
    expect(Number(scoped.printed[0])).toBeCloseTo(cell.layers, 12);

    const geometrySource = "threadprofile 'rayon-60wt' down fd 20 trim";
    const withLocks = run(`lock 1 ${geometrySource}`).density;
    const withoutLocks = run(`lock 0 ${geometrySource}`).density;
    expect(withLocks.threadWidthMM).toBe(0.3);
    expect(withLocks).toEqual(withoutLocks);
  });
});
