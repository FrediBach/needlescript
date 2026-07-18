import { describe, expect, it } from 'vitest';
import { run } from '../engine.ts';

const output = (source: string) => run(source).printed;

describe('editable curve specs', () => {
  it('accepts compact and full anchors and preserves straight endpoints', () => {
    expect(output('print curveflat([[0,0], [[10,0],[0,0],[0,0]]], 0.1)')).toEqual([
      '[[0, 0], [10, 0]]',
    ]);
    expect(output('print iscurvespec([[0,0], [[10,0],[0,0],[0,0]]])')).toEqual(['1']);
  });

  it('flattens curves and emits canonical closed sampled rings', () => {
    const result = output(
      [
        'let spec = [[[0,0],[0,0],[5,0]], [[10,10],[0,-5],[0,0]], [0,10]]',
        "let ring = curvepath(spec, 2, 'closed')",
        'print ring[0] = ring[len(ring)-1]',
        'print isclosed(ring)',
      ].join('\n'),
    );
    expect(result).toEqual(['1', '1']);
  });

  it('reports the malformed anchor index', () => {
    expect(() => run('print curveflat([[0,0], [1,2,3]], 0.1)')).toThrow(/anchor 1/);
  });
});

describe('path expansion builtins', () => {
  it('normalizes closedness and orientation', () => {
    expect(
      output(
        [
          'let ring = [[0,0],[10,0],[10,10],[0,10],[0,0]]',
          'print len(openpath(ring))',
          'print pathorientation(ring)',
          "print isclosed(resample(openpath(ring), 3, 'closed'))",
        ].join('\n'),
      ),
    ).toEqual(['4', '1', '1']);
  });

  it('provides arc-length queries and editing primitives', () => {
    expect(
      output(
        [
          'let p = [[0,0],[10,0],[10,10]]',
          'print pointat(p, 0.75)',
          'print headingat(p, 0.75)',
          'print normalat(p, 0.75)',
          'print paramof([10,5], p)',
          'print paramtomm(p, 0.25)',
          'print mmtoparam(p, 5)',
          'print len(insertvertex(p, 0.25))',
          'print len(splitat(p, 0.5))',
        ].join('\n'),
      ),
    ).toEqual(['[10, 5]', '0', '270', '0.75', '5', '0.25', '4', '2']);
  });

  it('finds parameterized intersections', () => {
    expect(output('print pathisectparams([[0,0],[10,10]], [[0,10],[10,0]])')).toEqual([
      '[[[5, 5], 0.5, 0.5]]',
    ]);
    expect(output('print len(pathselfisects([[0,0],[10,10],[0,10],[10,0]]))')).toEqual(['1']);
  });

  it('clips, strokes, and joins open paths', () => {
    expect(
      output(
        [
          'let ring = [[0,0],[10,0],[10,10],[0,10]]',
          "print len(clipopen([[-5,5],[15,5]], ring, 'inside'))",
          "print len(strokepath([[0,0],[10,0]], 2, 'butt', 'bevel'))",
          'print joinpaths([[[0,0],[5,0]], [[10,0],[5,0]]], 0.01)',
        ].join('\n'),
      ),
    ).toEqual(['1', '1', '[[[0, 0], [5, 0], [10, 0]]]']);
  });

  it('recognizes point and path shapes without throwing', () => {
    expect(output('print ispoint([1,2]) print ispath([[0,0],[1,1]]) print ispath([1,2])')).toEqual([
      '1',
      '1',
      '0',
    ]);
  });

  it('supports an optional dash phase without changing the default', () => {
    expect(output('print dashes([[0,0],[12,0]], 3, 2)')).toEqual([
      '[[[0, 0], [3, 0]], [[5, 0], [8, 0]], [[10, 0], [12, 0]]]',
    ]);
    expect(output('print dashes([[0,0],[12,0]], 3, 2, 4)')).toEqual([
      '[[[1, 0], [4, 0]], [[6, 0], [9, 0]], [[11, 0], [12, 0]]]',
    ]);
    expect(
      output('import std.pathops.dashes as dashes\nprint dashes([[0,0],[12,0]], 3, 2, 4)'),
    ).toEqual(['[[[1, 0], [4, 0]], [[6, 0], [9, 0]], [[11, 0], [12, 0]]]']);
  });
});
