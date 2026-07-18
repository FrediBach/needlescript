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

  it('provides drawless curl direction and fill-shape reporters', () => {
    const source = `
      import std.textures.curldir as curldir
      import std.textures.wovenshape as wovenshape
      import std.textures.gradientshape as gradientshape
      seed 912
      print curldir([7, -3])
      print wovenshape([0, 0], 0, 0.5)
      print wovenshape([0, 0], 1, 0.5)
      print gradientshape([0, 0], 0, 0)
      print gradientshape([0, 0], 0, 1)
      print random(1)
    `;
    const result = run(source);
    const baseline = run('seed 912 print random(1)');
    expect(Number.isFinite(Number(result.printed[0]))).toBe(true);
    expect(result.printed.slice(1, 5)).toEqual([
      '[0.8, 3, 0]',
      '[0.8, 3, 0.5]',
      '[0.45, 2.5, 0.5]',
      '[1.2, 2.5, 0.5]',
    ]);
    expect(result.printed[5]).toBe(baseline.printed[0]);

    expect(() =>
      run(`
        import std.textures.wovenshape as woven
        fill shape @woven
        beginfill repeat 4 [ fd 10 rt 90 ] endfill
      `),
    ).not.toThrow();
  });

  it('provides configured reporter factories without changing legacy exports', () => {
    const result = run(`
      import std.textures.griddir as griddir
      import std.textures.curldirwith as curldirwith
      import std.textures.gradientshapewith as gradientshapewith
      import std.mathx.easepow as easepow
      print griddir(35)([2, 3])
      print isref(curldirwith(9))
      print gradientshapewith(0.3, 0.9)([0, 0], 0, 1)
      print easepow(3)(0.5)
      fill dir griddir(20)
      beginfill repeat 4 [ fd 8 rt 90 ] endfill
    `);
    expect(result.printed).toEqual(['35', '1', '[0.9, 2.5, 0.5]', '0.125']);
  });

  it('provides clipped geometric texture path generators', () => {
    const result = run(`
      import std.textures.hilbertpaths as hilbertpaths
      import std.textures.truchetpaths as truchetpaths
      import std.textures.hitomezashi as hitomezashi
      import std.textures.seigaiha as seigaiha
      import std.textures.asanoha as asanoha
      import std.textures.herringbonepaths as herringbonepaths
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      print len(hilbertpaths(square, 5)) > 0
      print len(truchetpaths(square, 5)) > 0
      print len(hitomezashi(square, 4, [0, 1], [1, 0])) > 0
      print len(seigaiha(square, 5)) > 0
      print len(asanoha(square, 6)) > 0
      print len(herringbonepaths(square, 4)) > 0
    `);
    expect(result.printed).toEqual(['1', '1', '1', '1', '1', '1']);

    expect(() =>
      run(`
        import std.textures.hilbertpaths as hilbertpaths
        let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
        lock 0 fillunderlay 'off'
        fill paths hilbertpaths(square, 5)
        up setxy -10 -10 down
        beginfill repeat 4 [ fd 20 rt 90 ] endfill
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

  it('provides every std.regions measurement, inset, tiling, and grid helper', () => {
    const result = run(`
      import std.regions.regionarea as regionarea
      import std.regions.poleof as poleof
      import std.regions.insetrings as insetrings
      import std.regions.tilecells as tilecells
      import std.regions.gridpoints as gridpoints
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      print regionarea(square)
      print poleof(square)
      print len(insetrings(square, 2, 2))
      print len(tilecells(square, 'square', 8)) > 0
      print len(tilecells(square, 'hex', 5)) > 0
      print len(tilecells(square, 'tri', 8)) > 0
      print len(gridpoints(square, 10))
    `);
    expect(result.printed).toEqual(['400', '[0, 0]', '2', '1', '1', '1', '4']);
  });

  it('partitions a region into n cells with exactly one main-stream draw', () => {
    const source = `
      import std.regions.partitions as partitions
      seed 321
      let square = [[-20, -20], [20, -20], [20, 20], [-20, 20]]
      print len(partitions(square, 4))
      print random(1)
    `;
    const result = run(source);
    const baseline = run('seed 321 print random(1) print random(1)');
    expect(result.printed[0]).toBe('4');
    expect(result.printed[1]).toBe(baseline.printed[1]);
    expect(run(source).printed).toEqual(result.printed);
  });

  it('provides every std.layout placement and fitting helper', () => {
    const result = run(`
      import std.layout.circlelayout as circlelayout
      import std.layout.gridlayout as gridlayout
      import std.layout.alongpath as alongpath
      import std.layout.fitpath as fitpath
      print circlelayout(4, 10)
      print gridlayout(2, 2, 10, 20)
      print alongpath([[0, 0], [10, 0], [10, 10]], 3)
      print bbox(fitpath([[-1, -1], [1, -1], [1, 1], [-1, 1]], [[-10, -5], [10, -5], [10, 5], [-10, 5]], 1))
    `);
    expect(result.printed).toEqual([
      '[[[0, 10], 270], [[-10, 0], 180], [[0, -10], 90], [[10, 0], 0]]',
      '[[[-5, 10], 0], [[5, 10], 0], [[-5, -10], 0], [[5, -10], 0]]',
      '[[[0, 0], 90], [[10, 0], 90], [[10, 10], 0]]',
      '[-4, -4, 4, 4]',
    ]);
  });

  it('provides sewrun, satinalong, and beanoutline stitch-mode rituals', () => {
    const runResult = run(`
      import std.stitchcraft.sewrun as sewrun
      lock 0
      sewrun([[0, 0], [0, 10]], 2)
    `);
    const directResult = run(`lock 0 sewpath(resample([[0, 0], [0, 10]], 2))`);
    const geometry = (result: typeof runResult) =>
      result.events.map(({ t, x, y, c }) => ({ t, x, y, c }));
    expect(geometry(runResult)).toEqual(geometry(directResult));

    const satinResult = run(`
      import std.stitchcraft.satinalong as satinalong
      lock 0 underlay 'off'
      satinalong([[0, 0], [0, 10]], 2)
      fd 5
    `);
    expect(satinResult.events.filter((event) => event.t === 'stitch').length).toBeGreaterThan(10);
    expect(satinResult.events.at(-1)).toMatchObject({ t: 'stitch', x: 0, y: 15 });

    const beanResult = run(`
      import std.stitchcraft.beanoutline as beanoutline
      lock 0 stitchlen 5
      beanoutline([[0, 0], [10, 0], [10, 10]], 3)
      fd 5
    `);
    const plainResult = run(
      `lock 0 stitchlen 5 sewpath(closepath([[0, 0], [10, 0], [10, 10]])) fd 5`,
    );
    expect(beanResult.events.length).toBeGreaterThan(plainResult.events.length);
  });

  it('provides appliquesteps and eyelet as complete sewing procedures', () => {
    const applique = run(`
      import std.stitchcraft.appliquesteps as appliquesteps
      lock 0 underlay 'off'
      appliquesteps([[-5, -5], [5, -5], [5, 5], [-5, 5]], 2)
    `);
    expect(applique.events.filter((event) => event.t === 'color')).toHaveLength(2);
    expect(applique.events.some((event) => event.t === 'stitch')).toBe(true);

    const eyelet = run(`
      import std.stitchcraft.eyelet as eyelet
      lock 0 underlay 'off'
      up setxy 4 6 down seth 90
      eyelet(2)
      print pos()
      print heading
    `);
    expect(eyelet.printed).toEqual(['[4, 6]', '90']);
    expect(eyelet.events.some((event) => event.t === 'stitch')).toBe(true);
  });

  it('preserves appliquesteps stitch geometry and stage order exactly', () => {
    const imported = run(`
      import std.stitchcraft.appliquesteps as appliquesteps
      lock 0 underlay 'off'
      appliquesteps([[-5, -5], [5, -5], [5, 5], [-5, 5]], 2)
    `);
    const direct = run(`
      lock 0 underlay 'off'
      let ring = closepath([[-5, -5], [5, -5], [5, 5], [-5, 5]])
      up setpos(first(ring)) down sewpath(resample(ring, 2.5))
      stop
      up setpos(first(ring)) down satin 0.8 sewpath(ring) satin 0
      stop
      up setpos(first(ring)) down satin 2 sewpath(ring) satin 0
    `);
    const construction = (result: typeof imported) =>
      result.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));
    expect(construction(imported)).toEqual(construction(direct));
  });

  it('sews fleece knockdown as a sparse running-stitch foundation', () => {
    const result = run(`
      import std.stitchcraft.knockdown as knockdown
      fabric 'fleece'
      lock 0
      satin 4
      knockdown([[-18, -12], [18, -12], [18, 12], [-18, 12]], 25, 3)
      fd 5
    `);
    expect(result.events.some((event) => event.t === 'stitch')).toBe(true);
    expect(result.events.some((event) => event.u === 1)).toBe(false);
    expect(result.density.peak).toBeLessThan(2.6);
    expect(result.warnings.some((warning) => warning.includes('layers of thread'))).toBe(false);
    expect(result.events.at(-1)).toMatchObject({ t: 'stitch' });

    expect(() =>
      run(`
        import std.stitchcraft.knockdown as knockdown
        knockdown([[-5, -5], [5, -5], [5, 5], [-5, 5]], 0, 0.5)
      `),
    ).toThrow(/knockdown spacing must be from 1 to 5 mm/);
  });

  it('calculates predictable fill inset and border centerlines for compound regions', () => {
    const result = run(`
      import std.stitchcraft.fillbordergeometry as fillbordergeometry
      seed 321
      let outer = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      let hole = [[-4, -4], [4, -4], [4, 4], [-4, 4]]
      let geometry = fillbordergeometry([outer, hole], 2, 0.4)
      print geometry[2]
      print len(geometry[0])
      print bbox(geometry[0][0])
      print bbox(geometry[0][1])
      print [len(geometry[1]), first(geometry[1][0]) = last(geometry[1][0]), first(geometry[1][1]) = last(geometry[1][1])]
      print random(1)
    `);
    const baseline = run('seed 321 print random(1)');
    expect(result.printed).toEqual([
      '0.6',
      '2',
      '[-9.4, -9.4, 9.4, 9.4]',
      '[-4.6, -4.6, 4.6, 4.6]',
      '[2, 1, 1]',
      baseline.printed[0],
    ]);
    expect(result.events).toHaveLength(0);
  });

  it('keeps concave fill-border inset geometry inside its source region', () => {
    const result = run(`
      import std.stitchcraft.fillbordergeometry as fillbordergeometry
      let concave = [[-10, -10], [10, -10], [10, -2], [2, -2], [2, 10], [-10, 10]]
      let geometry = fillbordergeometry(concave, 2.4, 0.4)
      let outside = 0
      for ring in geometry[0] [
        for p in ring [ if inpath(p, concave) = 0 [ outside = 1 ] ]
      ]
      print [geometry[2], len(geometry[0]), outside]
    `);
    expect(result.printed).toEqual(['[0.8, 1, 0]']);
  });

  it('sews fill and border as two explicit stages with a safe default overlap', () => {
    const defaultRecipe = run(`
      import std.stitchcraft.fillandborder as fillandborder
      lock 0 underlay 'off' density 1
      fillandborder([[-8, -6], [8, -6], [8, 6], [-8, 6]], 20, 1.2, 2)
    `);
    const explicitRecipe = run(`
      import std.stitchcraft.fillandborderwith as fillandborderwith
      lock 0 underlay 'off' density 1
      fillandborderwith([[-8, -6], [8, -6], [8, 6], [-8, 6]], 20, 1.2, 2, 0.4)
    `);
    const construction = (result: typeof defaultRecipe) =>
      result.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));
    expect(construction(defaultRecipe)).toEqual(construction(explicitRecipe));
    expect(defaultRecipe.events.filter((event) => event.t === 'color')).toHaveLength(1);
    const stitchColors = new Set(
      defaultRecipe.events.filter((event) => event.t === 'stitch').map((event) => event.c),
    );
    expect(stitchColors).toEqual(new Set([0, 1]));
  });

  it('provides configurable appliqué insets and explicit stage stops', () => {
    const staged = run(`
      import std.stitchcraft.appliquewith as appliquewith
      lock 0 underlay 'off' density 1
      appliquewith([[-8, -6], [8, -6], [8, 6], [-8, 6]], 0.4, 0.8, 2, [1, 1])
    `);
    expect(staged.events.filter((event) => event.t === 'color')).toHaveLength(2);
    expect(
      new Set(staged.events.filter((event) => event.t === 'stitch').map((event) => event.c)),
    ).toEqual(new Set([0, 1, 2]));

    const oneStop = run(`
      import std.stitchcraft.appliquewith as appliquewith
      lock 0 underlay 'off' density 1
      appliquewith([[-8, -6], [8, -6], [8, 6], [-8, 6]], 0, 0.8, 2, [0, 1])
    `);
    expect(oneStop.events.filter((event) => event.t === 'color')).toHaveLength(1);
    expect(() =>
      run(`
        import std.stitchcraft.appliquewith as appliquewith
        appliquewith([[-2, -2], [2, -2], [2, 2], [-2, 2]], 0, 0.5, 2, [1])
      `),
    ).toThrow(/appliquewith stops must be/);
  });

  it('provides gradientbands and two-color threadblend', () => {
    const bands = run(`
      import std.stitchcraft.gradientbands as gradientbands
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      print len(gradientbands(square, 30, 4))
    `);
    expect(bands.printed).toEqual(['4']);

    const blend = run(`
      import std.stitchcraft.threadblend as threadblend
      lock 0
      threadblend([[-8, -8], [8, -8], [8, 8], [-8, 8]], 20)
    `);
    const stitchColors = new Set(
      blend.events.filter((event) => event.t === 'stitch').map((event) => event.c),
    );
    expect(stitchColors).toEqual(new Set([0, 1]));
    expect(blend.events.filter((event) => event.t === 'color')).toHaveLength(1);
  });

  it('partitions one constant-pitch row set into an interleaved 50/50 gradient', () => {
    const result = run(`
      import std.stitchcraft.gradientrows as gradientrows
      def half(v) [ return 0.5 ]
      def rowaxes(rows) [
        let out = []
        for row in rows [ append(out, round(row[0][1])) ]
        return out
      ]
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      let base = fillrows(square, 2, 0)
      let groups = gradientrows(square, 0, 2, @half)
      let overlap = 0
      for a in groups[0] [
        for b in groups[1] [
          if abs(a[0][1] - b[0][1]) < 0.000001 [ overlap = 1 ]
        ]
      ]
      print len(base)
      print [len(groups[0]), len(groups[1])]
      print rowaxes(groups[0])
      print rowaxes(groups[1])
      print overlap
    `);
    expect(result.printed).toEqual([
      '10',
      '[5, 5]',
      '[-7, -3, 1, 5, 9]',
      '[-9, -5, -1, 3, 7]',
      '0',
    ]);
  });

  it('keeps ramp endpoints and empty color groups density-neutral', () => {
    const result = run(`
      import std.stitchcraft.gradientrows as gradientrows
      def ramp(v) [ return v ]
      def none(v) [ return 0 ]
      def all(v) [ return 1 ]
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      let rampgroups = gradientrows(square, 0, 2, @ramp)
      let nonegroups = gradientrows(square, 0, 2, @none)
      let allgroups = gradientrows(square, 0, 2, @all)
      print [rampgroups[0][0][0][1], last(rampgroups[1])[0][1]]
      print [len(nonegroups[0]), len(nonegroups[1])]
      print [len(allgroups[0]), len(allgroups[1])]
    `);
    expect(result.printed).toEqual(['[-9, 9]', '[10, 0]', '[0, 10]']);
  });

  it('assigns compound-region scanline fragments together and preserves fillrows clipping', () => {
    const result = run(`
      import std.stitchcraft.gradientrows as gradientrows
      let calls = 0
      def half(v) [ calls += 1 return 0.5 ]
      let outer = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      let hole = [[-4, -4], [4, -4], [4, 4], [-4, 4]]
      let region = [outer, hole]
      let base = fillrows(region, 2, 0)
      let groups = gradientrows(region, 0, 2, @half)
      let combined = concat(groups[0], groups[1])
      let retained = 0
      let splitrow = 0
      for row in base [ if contains(combined, row) [ retained += 1 ] ]
      for a in groups[0] [
        for b in groups[1] [
          if abs(a[0][1] - b[0][1]) < 0.000001 [ splitrow = 1 ]
        ]
      ]
      print calls
      print [len(base), len(groups[0]), len(groups[1]), retained]
      print splitrow
    `);
    expect(result.printed).toEqual(['10', '[14, 7, 7, 14]', '0']);
  });

  it('keeps gradientrows drawless and validates its construction contract', () => {
    const source = (seed: number) => `
      import std.stitchcraft.gradientrows as gradientrows
      seed ${seed}
      def ramp(v) [ return v ]
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      print gradientrows(square, 25, 2, @ramp)
      print random(1)
    `;
    const first = run(source(123));
    const differentSeed = run(source(999));
    const baseline = run('seed 123 print random(1)');
    expect(first.printed[0]).toBe(differentSeed.printed[0]);
    expect(first.printed[1]).toBe(baseline.printed[0]);
    expect(run(source(123)).printed).toEqual(first.printed);

    expect(() =>
      run(`
        import std.stitchcraft.gradientrows as gradientrows
        def half(v) [ return 0.5 ]
        gradientrows([[-1, -1], [1, -1], [1, 1], [-1, 1]], 0, 0.2, @half)
      `),
    ).toThrow(/gradientrows pitch must be from 0\.25 to 5 mm/);
    expect(() =>
      run(`
        import std.stitchcraft.gradientrows as gradientrows
        def invalid(v) [ return 1.1 ]
        gradientrows([[-2, -2], [2, -2], [2, 2], [-2, 2]], 0, 1, @invalid)
      `),
    ).toThrow(/gradientrows amount must return a number from 0 to 1/);
  });

  it('keeps aggregate density invariant for two through eight gradient channels', () => {
    const result = run(`
      import std.stitchcraft.gradientrowsn as gradientrowsn
      let channels = 2
      def equalweights(v) [
        let out = []
        repeat channels [ append(out, 1) ]
        return out
      ]
      let square = [[-12, -12], [12, -12], [12, 12], [-12, 12]]
      let groups = []
      let assigned = 0
      for count = 2 to 8 [
        channels = count
        groups = gradientrowsn(square, 0, 1, @equalweights)
        assigned = 0
        for group in groups [ assigned += len(group) ]
        print [len(groups), assigned, map(groups, @len)]
      ]
    `);
    expect(result.printed).toEqual([
      '[2, 24, [12, 12]]',
      '[3, 24, [8, 8, 8]]',
      '[4, 24, [6, 6, 6, 6]]',
      '[5, 24, [5, 5, 5, 5, 4]]',
      '[6, 24, [4, 4, 4, 4, 4, 4]]',
      '[7, 24, [4, 4, 4, 3, 3, 3, 3]]',
      '[8, 24, [3, 3, 3, 3, 3, 3, 3, 3]]',
    ]);
  });

  it('bounds multichannel prefix error while weights vary across the gradient', () => {
    const result = run(`
      import std.stitchcraft.gradientrowsn as gradientrowsn
      def blend3(v) [ return [1 - v, 1, v] ]
      let square = [[-20, -20], [20, -20], [20, 20], [-20, 20]]
      let groups = gradientrowsn(square, 0, 1, @blend3)
      let expected = [0, 0, 0]
      let actual = [0, 0, 0]
      let worst = 0
      let v = 0
      let axis = 0
      let found = 0
      for candidate = 0 to 39 [
        v = candidate / 39
        expected[0] += (1 - v) / 2
        expected[1] += 0.5
        expected[2] += v / 2
        axis = -19.5 + candidate
        found = 0
        for channel = 0 to 2 [
          for row in groups[channel] [
            if abs(row[0][1] - axis) < 0.000001 [ actual[channel] += 1 found += 1 ]
          ]
        ]
        assert(found = 1, 'every candidate row must have exactly one channel')
        for channel = 0 to 2 [ worst = max(worst, abs(expected[channel] - actual[channel])) ]
      ]
      print map(groups, @len)
      print round(worst * 1000) / 1000
    `);
    expect(result.printed).toEqual(['[10, 20, 10]', '0.5']);
  });

  it('keeps compound scanline fragments together in N-color groups', () => {
    const result = run(`
      import std.stitchcraft.gradientrowsn as gradientrowsn
      let calls = 0
      def equal3(v) [ calls += 1 return [1, 1, 1] ]
      let outer = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      let hole = [[-4, -4], [4, -4], [4, 4], [-4, 4]]
      let region = [outer, hole]
      let base = fillrows(region, 2, 0)
      let groups = gradientrowsn(region, 0, 2, @equal3)
      let combined = concat(concat(groups[0], groups[1]), groups[2])
      let retained = 0
      let splitrow = 0
      for row in base [ if contains(combined, row) [ retained += 1 ] ]
      for groupa = 0 to 1 [
        for groupb = groupa + 1 to 2 [
          for a in groups[groupa] [
            for b in groups[groupb] [
              if abs(a[0][1] - b[0][1]) < 0.000001 [ splitrow = 1 ]
            ]
          ]
        ]
      ]
      print calls
      print [len(base), map(groups, @len), retained]
      print splitrow
    `);
    expect(result.printed).toEqual(['10', '[14, [6, 4, 4], 14]', '0']);
  });

  it('routes gradient groups serpentine from either seeding-axis end', () => {
    const result = run(`
      import std.stitchcraft.serpentinerows as serpentinerows
      let rows = [
        [[-5, -2], [5, -2]],
        [[-5, 0], [5, 0]],
        [[-5, 2], [5, 2]]
      ]
      let routedforward = serpentinerows(rows, false)
      let routedbackward = serpentinerows(rows, true)
      print map(routedforward, @first)
      print map(routedbackward, @first)
      print serpentinerows([], false)
    `);
    expect(result.printed).toEqual([
      '[[-5, -2], [5, 0], [-5, 2]]',
      '[[5, 2], [-5, 0], [5, -2]]',
      '[]',
    ]);
  });

  it('keeps gradientrowsn drawless and reports malformed weights with their row', () => {
    const source = (seed: number) => `
      import std.stitchcraft.gradientrowsn as gradientrowsn
      seed ${seed}
      def blend3(v) [ return [1 - v, 1, v] ]
      let square = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
      print gradientrowsn(square, 15, 2, @blend3)
      print random(1)
    `;
    const first = run(source(246));
    const differentSeed = run(source(864));
    const baseline = run('seed 246 print random(1)');
    expect(first.printed[0]).toBe(differentSeed.printed[0]);
    expect(first.printed[1]).toBe(baseline.printed[0]);

    const call = (body: string) =>
      run(`
        import std.stitchcraft.gradientrowsn as gradientrowsn
        ${body}
        gradientrowsn([[-2, -2], [2, -2], [2, 2], [-2, 2]], 0, 1, @badweights)
      `);
    expect(() => call('def badweights(v) [ return 1 ]')).toThrow(
      /gradientrowsn @weights row 0: must return a weight list/,
    );
    expect(() => call('def badweights(v) [ return [1] ]')).toThrow(
      /gradientrowsn @weights row 0: must return 2 to 8 weights/,
    );
    expect(() => call("def badweights(v) [ return ['heavy', 1] ]")).toThrow(
      /gradientrowsn @weights row 0: weight 0 must be a number/,
    );
    expect(() => call('def badweights(v) [ return [-1, 2] ]')).toThrow(
      /gradientrowsn @weights row 0: weight 0 must be non-negative/,
    );
    expect(() => call('def badweights(v) [ return [0, 0] ]')).toThrow(
      /gradientrowsn @weights row 0: weights must contain at least one positive value/,
    );
    expect(() =>
      call('def badweights(v) [ if v = 0 [ return [1, 1] ] else [ return [1, 1, 1] ] ]'),
    ).toThrow(/gradientrowsn @weights row 1: must keep list length fixed at 2/);
  });

  it('provides deterministic, coverage-aware stipple with one main-stream draw', () => {
    const source = `
      import std.stitchcraft.stipple as stipple
      seed 777 lock 0
      stipple([[-10, -10], [10, -10], [10, 10], [-10, 10]], 5)
      print random(1)
    `;
    const result = run(source);
    const baseline = run('seed 777 print random(1) print random(1)');
    expect(result.printed[0]).toBe(baseline.printed[1]);
    expect(result.events.some((event) => event.t === 'stitch')).toBe(true);
    expect(run(source).events).toEqual(result.events);
  });

  it('provides stitch-inert debug chalk overlays', () => {
    const result = run(`
      import std.debugx.chalkgrid as chalkgrid
      import std.debugx.chalkbbox as chalkbbox
      import std.debugx.chalkfield as chalkfield
      chalkgrid(20)
      chalkbbox([[-3, -2], [5, 4]])
      chalkfield()
    `);
    expect(result.events).toHaveLength(0);
    expect(result.chalk?.map(({ label, style }) => [label, style])).toEqual([
      ['grid', 'line'],
      ['bbox', 'line'],
      ['field', 'line'],
    ]);
    expect(result.chalk?.[0]).toMatchObject({ kind: 'group' });
    expect(result.chalk?.[1]).toMatchObject({ kind: 'path', vertexCount: 5 });
  });

  it('provides thread-length and coverage-profile diagnostics', () => {
    const result = run(`
      import std.debugx.threadestimate as threadestimate
      import std.debugx.coverprofile as coverprofile
      lock 0 stitchlen 5
      down fd 10
      print threadestimate()
      print coverprofile([[0, 0], [0, 10]], 5)
    `);
    expect(Number(result.printed[0])).toBeGreaterThan(0);
    expect(result.printed[1]).toMatch(/^\[\[0, /);
    expect(result.printed[1]).toContain('[5, ');
    expect(result.printed[1]).toContain('[10, ');
  });
});
