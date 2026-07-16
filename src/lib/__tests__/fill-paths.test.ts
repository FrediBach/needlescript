import { describe, expect, it } from 'vitest';
import { run } from '../engine.ts';

const square = 'beginfill repeat 4 [ fd 20 rt 90 ] endfill';

describe('fill paths syntax and contract', () => {
  it('runs a one-argument path generator', () => {
    const result = run(
      "lock 0 fillunderlay 'off' def rows(rings) [ return fillrows(rings, 2, 0) ] " +
        'fill paths @rows ' +
        square,
    );
    expect(result.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(10);
  });

  it('accepts the classic quoted channel spelling', () => {
    expect(() =>
      run(
        "fillunderlay 'off' def rows(rings) [ return fillrows(rings, 2, 0) ] fill \"paths @rows " +
          square,
      ),
    ).not.toThrow();
  });

  it('supports a frozen static path list', () => {
    const result = run(
      "lock 0 fillunderlay 'off' let paths = [[[0, 1], [20, 1]], [[20, 3], [0, 3]]] " +
        'fill paths paths ' +
        square,
    );
    expect(result.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(4);
  });

  it('rejects invalid generator arity at the arm', () => {
    expect(() => run('def bad(a, b) [ return [] ] fill paths @bad ' + square)).toThrow(
      /takes 1 input/,
    );
  });

  it('warns when an arm is unused', () => {
    const result = run('def empty(rings) [ return [] ] fill paths @empty');
    expect(result.warnings.join('\n')).toMatch(/fill arming on line .* was never used/);
  });

  it('freezes static paths at arm time', () => {
    const before = run(
      "lock 0 fillunderlay 'off' let p = [[[0, 1], [20, 1]]] fill paths p " +
        'p[0][1][1] = 10 ' +
        square,
    );
    const ys = before.events.filter((e) => e.t === 'stitch').map((e) => e.y);
    expect(ys).toContain(1);
    expect(ys).not.toContain(10);
  });

  it('sandboxes machine state but preserves deliberate RNG draws', () => {
    const generated = run(
      "lock 0 fillunderlay 'off' seed 7 " +
        'def noisy(rings) [ let n = random(100) fd 9 color 3 return [[[0, 1], [20, 1]]] ] ' +
        'fill paths @noisy ' +
        square +
        ' print random(100) print pos()',
    );
    const control = run(
      "lock 0 fillunderlay 'off' seed 7 let consumed = random(100) " +
        'fill paths [[[0, 1], [20, 1]]] ' +
        square +
        ' print random(100) print pos()',
    );
    expect(generated.printed).toEqual(control.printed);
    expect(generated.warnings.join('\n')).toMatch(/machine commands.*discarded/);
  });

  it('clips paths across holes', () => {
    const result = run(
      "lock 0 fillunderlay 'off' fill paths [[[-2, 10], [22, 10]]] " +
        'beginfill repeat 4 [ fd 20 rt 90 ] up setxy 8 8 down repeat 4 [ fd 4 rt 90 ] endfill',
    );
    const stitches = result.events.filter((e) => e.t === 'stitch');
    expect(stitches.some((e) => e.x < 8 && Math.abs(e.y - 10) < 0.01)).toBe(true);
    expect(stitches.some((e) => e.x > 12 && Math.abs(e.y - 10) < 0.01)).toBe(true);
    expect(stitches.some((e) => e.x > 8.1 && e.x < 11.9 && Math.abs(e.y - 10) < 0.01)).toBe(false);
  });
});

describe('fill path helpers', () => {
  it('closepath repeats the first point', () => {
    expect(run('print closepath([[0, 0], [3, 0], [0, 3]])').printed[0]).toBe(
      '[[0, 0], [3, 0], [0, 3], [0, 0]]',
    );
  });

  it('contourpaths and spiralpath return sewable paths', () => {
    const source =
      'let r = [[0, 0], [20, 0], [20, 20], [0, 20]] ' +
      'print len(contourpaths(r, 2)) print len(spiralpath(r, 2))';
    expect(run(source).printed.map(Number)).toEqual([5, 1]);
  });
});

describe('fillrows equivalence', () => {
  it('matches the built-in tatami event stream', () => {
    const boundary = 'beginfill repeat 4 [ fd 20 rt 90 ] endfill';
    const plain = run("lock 0 fillunderlay 'off' fillspacing 2 stitchlen 2.5 " + boundary).events;
    const custom = run(
      "lock 0 fillunderlay 'off' fillspacing 2 stitchlen 2.5 " +
        'def rows(rings) [ return fillrows(rings, 2, 0) ] fill paths @rows ' +
        boundary,
    ).events;
    expect(custom).toEqual(plain);
  });

  it('matches built-in tatami with pull compensation and underlay', () => {
    const boundary = 'beginfill repeat 4 [ fd 20 rt 90 ] endfill';
    const settings = "lock 0 fillunderlay 'tatami' fillspacing 2 stitchlen 2.5 pullcomp 0.4 ";
    const plain = run(settings + boundary).events;
    const custom = run(
      settings + 'def rows(rings) [ return fillrows(rings, 2, 0) ] fill paths @rows ' + boundary,
    ).events;
    expect(custom).toEqual(plain);
  });

  it('matches built-in tatami with reporter fill length', () => {
    const boundary = 'beginfill repeat 4 [ fd 20 rt 90 ] endfill';
    const settings =
      "lock 0 fillunderlay 'off' fillspacing 2 def rowlen(t, s, i, p) [ return 2 + i % 2 ] filllen @rowlen ";
    const plain = run(settings + boundary).events;
    const custom = run(
      settings + 'def rows(rings) [ return fillrows(rings, 2, 0) ] fill paths @rows ' + boundary,
    ).events;
    expect(custom).toEqual(plain);
  });
});
