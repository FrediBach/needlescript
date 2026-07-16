import { describe, expect, it } from 'vitest';
import { designStats, run, toDST } from '../engine.ts';

describe('chalk command', () => {
  it('snapshots points, paths, and mixed groups without entering the stitch stream', () => {
    const result = run(`
let point = [2, 3]
let path = [[0, 0], [5, 0], [5, 5]]
chalk point 'anchor'
chalk path 'spine' 'line'
chalk [point, path] 'layout' 'dots'
fd 10
`);

    expect(result.chalk).toHaveLength(3);
    expect(result.chalk?.map((item) => item.kind)).toEqual(['point', 'path', 'mixed']);
    expect(result.chalk?.map((item) => item.style)).toEqual(['auto', 'line', 'dots']);
    expect(result.chalk?.[2].vertexCount).toBe(4);
    expect(result.events.some((event) => event.t === 'mark')).toBe(false);
  });

  it('is stitch-, history-, and RNG-inert', () => {
    const plain = run(`seed 8
let p = [[0, 0], [4, 5]]
let before = random(100)
fd 12
let coverage = coverat([0, 6])
let after = random(100)`);
    const marked = run(`seed 8
let p = [[0, 0], [4, 5]]
let before = random(100)
chalk p
fd 12
chalk p 'again'
let coverage = coverat([0, 6])
let after = random(100)`);

    const withoutSourceLines = (events: typeof marked.events) =>
      events.map((event) => ({
        t: event.t,
        x: event.x,
        y: event.y,
        c: event.c,
        u: event.u,
        label: event.label,
      }));
    expect(withoutSourceLines(marked.events)).toEqual(withoutSourceLines(plain.events));
    expect(marked.globals?.before).toBe(plain.globals?.before);
    expect(marked.globals?.after).toBe(plain.globals?.after);
    expect(marked.globals?.coverage).toBe(plain.globals?.coverage);
    expect(designStats(marked.events)).toEqual(designStats(plain.events));
    expect(toDST(marked.events)).toEqual(toDST(plain.events));
  });

  it('maps through the affine transform at the call and snapshots before mutation', () => {
    const result = run(`
let p = [[1, 2], [3, 4]]
translate 10 20 [ rotate 90 [ chalk p ] ]
append(p, [9, 9])
`);
    expect(result.chalk?.[0].strokes[0].vertices).toEqual([
      [12, 19],
      [14, 17],
    ]);
    expect(result.chalk?.[0].vertexCount).toBe(2);
    expect(result.dataVars?.find((value) => value.name === 'p')?.vertexCount).toBe(3);
  });

  it('records playback anchors and remains active inside trace', () => {
    const result = run(`
fd 5
chalk [[0, 0], [2, 2]] 'middle'
let captured = trace [ chalk [3, 4] 'inside' fd 5 ]
fd 5
`);
    expect(result.chalk?.map((item) => item.stitchIndexAtEmit)).toEqual([3, 3]);
    expect(result.chalk?.[1].strokes[0].vertices[0]).toEqual([3, 4]);
  });

  it('supports modern call syntax and validates labels, styles, and shapes loudly', () => {
    expect(run("chalk([1, 2], 'p', 'DOTS')").chalk?.[0].style).toBe('dots');
    expect(() => run('chalk [1, 2, 3]')).toThrow(/flat list of 3 numbers/);
    expect(() => run('chalk [[1, 2], [3, 4, 5]]')).toThrow(/element 2, vertex 1/);
    expect(() => run('chalk [1, 2] 4')).toThrow(/label must be a string/);
    expect(() => run("chalk [1, 2] 'p' 'solid'")).toThrow(/expected 'auto', 'dots', or 'line'/);
  });

  it('warns and does nothing for an empty list', () => {
    const result = run('chalk []');
    expect(result.chalk).toEqual([]);
    expect(result.warnings).toContain('chalk ignored an empty list');
  });

  it('reserves chalk and enforces its object budget', () => {
    expect(() => run('let chalk = 1')).toThrow(/reserved|built-in/i);
    expect(() =>
      run(`override 'chalks' 10
repeat 11 [ chalk [0, 0] ]`),
    ).toThrow(/chalks budget reached/);
  });
});
