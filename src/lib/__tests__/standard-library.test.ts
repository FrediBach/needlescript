import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';

describe('standard-library modules', () => {
  it('imports an exported reporter under a local alias', () => {
    const result = run(`
      import std.textures.radialdir as radial
      print radial([0, 0])
      print radial([0, 10])
      print radial([10, 0])
    `);
    expect(result.printed).toEqual(['0', '0', '90']);
  });

  it('lets imported reporters be passed by reference', () => {
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        fill dir @radial
        beginfill
          repeat 4 [ fd 10 rt 90 ]
        endfill
      `),
    ).not.toThrow();
  });

  it('accepts export-prefixed definitions in a source program', () => {
    const result = run(`
      export def twice(n) [ return n * 2 ]
      print twice(6)
    `);
    expect(result.printed).toEqual(['12']);
  });

  it('reports unknown modules and exports clearly', () => {
    expect(() => run('import std.missing.thing as thing')).toThrow(
      /Unknown standard-library module "std\.missing"/,
    );
    expect(() => run('import std.textures.missing as thing')).toThrow(/does not export "missing"/);
  });

  it('rejects non-standard imports for now', () => {
    expect(() => run('import my.textures.radialdir as radial')).toThrow(
      /Only bundled standard-library imports are available for now/,
    );
  });

  it('rejects duplicate aliases and local collisions', () => {
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        import std.textures.radialdir as radial
      `),
    ).toThrow(/Duplicate import alias "radial"/);
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        def radial(p) [ return 0 ]
      `),
    ).toThrow(/both imported and defined locally/);
  });

  it('provides every std.mathx easing, waveform, angle, vector, and remap helper', () => {
    const result = run(`
      import std.mathx.easein as easein
      import std.mathx.easeout as easeout
      import std.mathx.easeinout as easeinout
      import std.mathx.easeback as easeback
      import std.mathx.triwave as triwave
      import std.mathx.pulse as pulse
      import std.mathx.wrapdeg as wrapdeg
      import std.mathx.angdiff as angdiff
      import std.mathx.lerpheading as lerpheading
      import std.mathx.vperp as vperp
      import std.mathx.vproj as vproj
      import std.mathx.vreflect as vreflect
      import std.mathx.remapc as remapc
      print easein(0.5)
      print easeout(0.5)
      print easeinout(0.25)
      print round(easeback(1) * 1000)
      print triwave(0.25)
      print pulse(0.6, 0.5)
      print wrapdeg(-10)
      print angdiff(350, 10)
      print lerpheading(350, 10, 0.5)
      print vperp([2, 3])
      print vproj([2, 2], [1, 0])
      print vreflect([1, -1], [0, 1])
      print remapc(12, 0, 10, 0, 100)
    `);
    expect(result.printed).toEqual([
      '0.25',
      '0.75',
      '0.125',
      '1000',
      '0',
      '0',
      '350',
      '20',
      '0',
      '[-3, 2]',
      '[2, 0]',
      '[1, 1]',
      '100',
    ]);
  });

  it('provides every std.mathx random helper with documented draw counts', () => {
    const source = `
      import std.mathx.randbetween as randbetween
      import std.mathx.randint as randint
      import std.mathx.chance as chance
      import std.mathx.weightedpick as weightedpick
      import std.mathx.jitterpt as jitterpt
      seed 123
      print randbetween(2, 4)
      print randint(2, 4)
      print chance(0.5)
      print weightedpick([10, 20, 30], [1, 2, 1])
      print jitterpt([0, 0], 1)
      print random(1)
    `;
    expect(run(source).printed).toEqual(run(source).printed);

    const baseline = run(`seed 123 repeat 7 [ print random(1) ]`).printed;
    const afterHelpers = run(source).printed.at(-1);
    expect(afterHelpers).toBe(baseline[6]);
  });

  it('provides every std.listx collection helper', () => {
    const result = run(`
      import std.listx.sortby as sortbyx
      import std.listx.argmin as argminx
      import std.listx.argmax as argmaxx
      import std.listx.pairwise as pairwise
      import std.listx.zip as zipx
      import std.listx.flatten as flattenx
      import std.listx.unique as uniquex
      import std.listx.chunk as chunkx
      import std.listx.rotatedlist as rotatedlist
      import std.listx.countif as countifx
      def negkey(x) [ return -x ]
      def odd(x) [ return mod(x, 2) ]
      print sortbyx([3, 1, 2], @negkey)
      print sortbyx([2, -2, 1], @abs)
      print argminx([3, 1, 2], @negkey)
      print argmaxx([3, 1, 2], @negkey)
      print pairwise([1, 2, 3])
      print zipx([1, 2], [3, 4, 5])
      print flattenx([1, [2, [3]], 4])
      print uniquex([1, 2, 1, 3, 2])
      print chunkx([1, 2, 3, 4, 5], 2)
      print rotatedlist([1, 2, 3, 4], -1)
      print countifx([1, 2, 3, 4], @odd)
    `);
    expect(result.printed).toEqual([
      '[3, 2, 1]',
      '[1, 2, -2]',
      '3',
      '1',
      '[[1, 2], [2, 3]]',
      '[[1, 3], [2, 4]]',
      '[1, 2, 3, 4]',
      '[1, 2, 3]',
      '[[1, 2], [3, 4], [5]]',
      '[4, 1, 2, 3]',
      '2',
    ]);
  });

  it('provides every std.shapes path constructor with centered, closed outlines', () => {
    const result = run(`
      import std.shapes.polypath as polypath
      import std.shapes.starpath as starpath
      import std.shapes.rectpath as rectpath
      import std.shapes.roundrect as roundrect
      import std.shapes.ellipsepath as ellipsepath
      import std.shapes.arcpath as arcpath
      import std.shapes.coilpath as coilpath
      import std.shapes.heartpath as heartpath
      import std.shapes.gearpath as gearpath
      import std.shapes.superellipsepath as superellipsepath
      import std.shapes.wavepath as wavepath
      import std.shapes.rosepath as rosepath
      import std.shapes.lissajouspath as lissajouspath
      print len(polypath(5, 10))
      print len(starpath(5, 10, 5))
      print bbox(rectpath(20, 10))
      print round(len(roundrect(20, 10, 2)))
      print bbox(ellipsepath(10, 5))
      print len(arcpath(90, 10))
      print len(coilpath(2, 1, 10))
      print first(heartpath(20)) = last(heartpath(20))
      print len(gearpath(8, 10, 2))
      print first(superellipsepath(20, 10, 4)) = last(superellipsepath(20, 10, 4))
      print bbox(wavepath(20, 3, 2))
      print first(rosepath(4, 10)) = last(rosepath(4, 10))
      print first(lissajouspath(3, 2, 30, 20)) = last(lissajouspath(3, 2, 30, 20))
    `);
    expect(result.printed).toEqual([
      '6',
      '11',
      '[-10, -5, 10, 5]',
      '39',
      '[-10, -5, 10, 5]',
      '16',
      '145',
      '1',
      '33',
      '1',
      '[-10, -3, 10, 3]',
      '1',
      '1',
    ]);
  });

  it('provides every std.pathops arc-length and polyline operation', () => {
    const result = run(`
      import std.pathops.pointat as pointat
      import std.pathops.headingat as headingat
      import std.pathops.paramof as paramof
      import std.pathops.subpath as subpath
      import std.pathops.dashes as dashes
      import std.pathops.simplifypath as simplifypath
      import std.pathops.smoothclosed as smoothclosed
      import std.pathops.morphpaths as morphpaths
      import std.pathops.pathisects as pathisects
      import std.pathops.offsetopen as offsetopen
      let route = [[0, 0], [10, 0], [10, 10]]
      print pointat(route, 0.75)
      print headingat(route, 0.75)
      print paramof([10, 6], route)
      print subpath(route, 0.25, 0.75)
      print len(dashes([[0, 0], [20, 0]], 3, 2))
      print simplifypath([[0, 0], [5, 0.01], [10, 0]], 0.1)
      print len(smoothclosed([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], 1))
      print morphpaths([[0, 0], [10, 0]], [[0, 10], [20, 10]], 0.5)
      print pathisects([[0, 0], [10, 10]], [[0, 10], [10, 0]])
      print offsetopen([[0, 0], [10, 0]], 2)
    `);
    expect(result.printed).toEqual([
      '[10, 5]',
      '0',
      '0.8',
      '[[5, 0], [10, 0], [10, 5]]',
      '4',
      '[[0, 0], [10, 0]]',
      '9',
      '[[0, 5], [15, 5]]',
      '[[5, 5]]',
      '[[0, 2], [10, 2]]',
    ]);
  });
});
