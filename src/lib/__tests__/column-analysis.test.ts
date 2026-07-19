import { describe, expect, it } from 'vitest';
import {
  analyzeRailPairColumn,
  analyzeSpineColumn,
  legacyRailWidthIssue,
  legacySpineWidthIssue,
} from '../column-analysis.ts';
import type { Pt } from '../genmath.ts';

describe('column analysis', () => {
  it('analyzes a straight open spine in physical arc-length order', () => {
    const analysis = analyzeSpineColumn(
      [
        [0, 0],
        [0, 5],
        [0, 10],
      ],
      4,
    );

    expect(analysis).toMatchObject({
      source: 'spine',
      closed: false,
      lengthMM: 10,
      tipIndices: [0, 2],
      sharpCornerIndices: [],
      unsafeWidthIndices: [],
    });
    expect(analysis.samples.map((sample) => sample.arcLengthMM)).toEqual([0, 5, 10]);
    expect(analysis.samples.map((sample) => sample.kind)).toEqual(['tip', 'straight', 'tip']);
    expect(analysis.samples[1]).toMatchObject({
      tangent: [0, 1],
      curvatureRadiusMM: Infinity,
      cornerAngleDeg: 180,
      widthToRadiusRatio: 0,
    });
    expect(analysis.segments).toHaveLength(1);
  });

  it('keeps gentle sampled curvature continuous and estimates its radius', () => {
    const radius = 10;
    const points: Pt[] = [0, 15, 30, 45, 60, 75, 90].map((degrees) => {
      const angle = (degrees * Math.PI) / 180;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    });
    const analysis = analyzeSpineColumn(points, 3);

    expect(analysis.samples.slice(1, -1).every((sample) => sample.continuousCurvature)).toBe(true);
    expect(analysis.sharpCornerIndices).toEqual([]);
    expect(analysis.samples[3].curvatureRadiusMM).toBeCloseTo(9.97, 1);
    expect(analysis.samples[3].widthToRadiusRatio).toBeCloseTo(0.3, 1);
  });

  it('distinguishes a collapsed cusp from a full-width U-turn', () => {
    const spine: Pt[] = [
      [0, 0],
      [0, 5],
      [0.1, 0],
    ];
    const cusp = analyzeSpineColumn(spine, [2, 0, 2]);
    const uTurn = analyzeSpineColumn(spine, 2);

    expect(cusp.samples[1]).toMatchObject({ kind: 'cusp', collapsedTip: true });
    expect(uTurn.samples[1]).toMatchObject({ kind: 'u-turn', collapsedTip: false });
    expect(cusp.samples[1].turnAngleDeg).toBeGreaterThan(178);
    expect(cusp.segments.map((segment) => segment.sampleIndices)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('classifies a taper without confusing width change with curvature', () => {
    const analysis = analyzeSpineColumn(
      [
        [0, 0],
        [0, 5],
        [0, 10],
      ],
      [4, 2, 0],
    );

    expect(analysis.samples.map((sample) => sample.taper)).toEqual([
      'narrowing',
      'narrowing',
      'narrowing',
    ]);
    expect(analysis.samples[2]).toMatchObject({ kind: 'tip', collapsedTip: true });
    expect(analysis.tipIndices).toEqual([0, 2]);
  });

  it('segments a closed column at every detected sharp corner', () => {
    const square: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const analysis = analyzeSpineColumn(square, 2);

    expect(analysis.closed).toBe(true);
    expect(analysis.lengthMM).toBe(40);
    expect(analysis.tipIndices).toEqual([]);
    expect(analysis.sharpCornerIndices).toEqual([0, 1, 2, 3]);
    expect(analysis.segments.map((segment) => segment.lengthMM)).toEqual([10, 10, 10, 10]);
    expect(analysis.segments.map((segment) => segment.sampleIndices)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
  });

  it('honors a declared construction corner on an otherwise straight column', () => {
    const analysis = analyzeSpineColumn(
      [
        [0, 0],
        [0, 5],
        [0, 10],
      ],
      2,
      { declaredCornerIndices: [1] },
    );

    expect(analysis.samples[1]).toMatchObject({
      declaredCorner: true,
      sharpCorner: true,
      kind: 'sharp-corner',
    });
    expect(analysis.segments.map((segment) => segment.sampleIndices)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('opens a closed column at one declared corner', () => {
    const points: Pt[] = Array.from({ length: 9 }, (_, index) => {
      const angle = ((index % 8) * Math.PI) / 4;
      return [Math.cos(angle) * 10, Math.sin(angle) * 10];
    });
    const analysis = analyzeSpineColumn(points, 2, { declaredCornerIndices: [0] });

    expect(analysis.closed).toBe(true);
    expect(analysis.sharpCornerIndices).toEqual([0]);
    expect(analysis.segments).toHaveLength(1);
    expect(analysis.segments[0]).toMatchObject({ startIndex: 0, endIndex: 0, closed: false });
    expect(analysis.segments[0].lengthMM).toBeCloseTo(analysis.lengthMM);
  });

  it('shares the model with rail pairs and records realized taper widths', () => {
    const analysis = analyzeRailPairColumn([
      { a: [-2, 0], b: [2, 0] },
      { a: [-1, 5], b: [1, 5] },
      { a: [0, 10], b: [0, 10] },
    ]);

    expect(analysis.source).toBe('rail-pair');
    expect(analysis.samples.map((sample) => sample.realizedWidthMM)).toEqual([4, 2, 0]);
    expect(analysis.samples[1].railCurvature).toBeDefined();
    expect(analysis.samples[2].collapsedTip).toBe(true);
  });

  it('reproduces both historical width-warning predicates', () => {
    const spine = analyzeSpineColumn(
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      4,
    );
    const rails = analyzeRailPairColumn([
      { a: [-2, 0], b: [2, 0] },
      { a: [-2, 1], b: [2, 1] },
      { a: [-1, 2], b: [3, 2] },
    ]);

    expect(legacySpineWidthIssue(spine)?.inputIndex).toBe(1);
    expect(spine.samples[1].unsafeWidth).toBe(true);
    expect(legacyRailWidthIssue(rails)).toMatchObject({
      sample: { inputIndex: 1 },
      rail: 'a',
    });
  });

  it('is deterministic, drawless, and does not retain mutable input points', () => {
    const points: Pt[] = [
      [0, 0],
      [2, 3],
      [5, 5],
    ];
    const first = analyzeSpineColumn(points, [2, 3, 4]);
    const second = analyzeSpineColumn(points, [2, 3, 4]);
    points[1][0] = 999;

    expect(first).toEqual(second);
    expect(first.samples[1].point).toEqual([2, 3]);
  });
});
