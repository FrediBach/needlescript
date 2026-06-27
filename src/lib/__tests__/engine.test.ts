import { describe, it, expect } from 'vitest';
import { run, NeedlescriptError, LIMITS } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

// ── helpers ────────────────────────────────────────────────────────────────

const stitches = (src: string) => run(src).events.filter((e) => e.t === 'stitch');
const evts = (src: string) => run(src).events;

/** Count events of a given type */
const count = (src: string, t: StitchEvent['t']) => run(src).events.filter((e) => e.t === t).length;

/** Round to 3 decimal places for coordinate comparisons */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ── basic movement ──────────────────────────────────────────────────────────
describe('run — movement', () => {
  it('fd produces stitches along y-axis (heading 0 = north)', () => {
    const s = stitches('fd 10');
    expect(s.length).toBeGreaterThan(0);
    // final stitch should be near (0, 10)
    const last = s[s.length - 1];
    expect(r3(last.x)).toBeCloseTo(0, 1);
    expect(r3(last.y)).toBeCloseTo(10, 1);
  });

  it('bk moves in the opposite direction', () => {
    const s = stitches('bk 10');
    const last = s[s.length - 1];
    expect(last.y).toBeLessThan(0);
  });

  it('rt 90 turns to face east, fd moves along +x', () => {
    const s = stitches('rt 90 fd 10');
    const last = s[s.length - 1];
    expect(r3(last.x)).toBeCloseTo(10, 1);
    expect(r3(last.y)).toBeCloseTo(0, 1);
  });

  it('lt 90 turns to face west', () => {
    const s = stitches('lt 90 fd 10');
    const last = s[s.length - 1];
    expect(last.x).toBeLessThan(0);
  });

  it('home returns to origin with heading 0', () => {
    const s = stitches('rt 45 fd 20 home');
    const last = s[s.length - 1];
    expect(r3(last.x)).toBeCloseTo(0, 1);
    expect(r3(last.y)).toBeCloseTo(0, 1);
  });

  it('setxy moves to absolute coordinates', () => {
    const s = stitches('setxy 5 -3');
    const last = s[s.length - 1];
    expect(r3(last.x)).toBeCloseTo(5, 1);
    expect(r3(last.y)).toBeCloseTo(-3, 1);
  });

  it('seth changes heading independently', () => {
    const s = stitches('seth 180 fd 10'); // heading south
    const last = s[s.length - 1];
    expect(r3(last.y)).toBeCloseTo(-10, 1);
  });

  it('cs (clearscreen) is a no-op but does not throw', () => {
    expect(() => run('cs fd 10')).not.toThrow();
  });

  it('up / down controls pen state', () => {
    // pen starts down; "up" before any move means no stitches at all (just a jump)
    const ev = evts('up fd 10');
    const jumpEvs = ev.filter((e) => e.t === 'jump');
    const stitchEvs = ev.filter((e) => e.t === 'stitch');
    // With pen up the move is a jump, not a stitch
    expect(jumpEvs.length).toBeGreaterThan(0);
    // No stitches sewn because pen was never put down
    expect(stitchEvs.length).toBe(0);
  });

  it('penup / pendown aliases work', () => {
    expect(() => run('penup fd 5 pendown fd 5')).not.toThrow();
  });

  it('forward / backward / right / left aliases work', () => {
    expect(() => run('forward 5 backward 3 right 45 left 45')).not.toThrow();
  });
});

// ── stitch splitting ────────────────────────────────────────────────────────
describe('run — stitch splitting', () => {
  it('long fd is split into multiple stitches at stitchlen', () => {
    // lock 0 to avoid extra lock stitches muddying the count
    const s = stitches('lock 0 stitchlen 5 fd 25');
    // 1 anchor at (0,0) + 5 running stitches = 6
    expect(s.length).toBe(6);
  });

  it('stitchlen clamps below minimum (0.4)', () => {
    const { warnings } = run('stitchlen 0.1 fd 5');
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });

  it('stitchlen clamps above maximum (12)', () => {
    const { warnings } = run('stitchlen 15 fd 5');
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });

  it('sub-minimum moves are merged and warn', () => {
    // Move 0.1 mm — below 0.4 mm minimum
    const { warnings } = run('fd 0.1');
    expect(warnings.some((w) => w.includes('sub-'))).toBe(true);
  });
});

// ── satin stitch ────────────────────────────────────────────────────────────
describe('run — satin stitch', () => {
  it('satin generates zigzag stitches', () => {
    const s = stitches('satin 3 fd 10');
    expect(s.length).toBeGreaterThan(5);
    // zigzag: x-coords should alternate sign
    const xs = s.slice(1).map((e) => r3(e.x));
    const signs = xs.map((x) => Math.sign(x));
    const hasAlternating = signs.some((s, i) => i > 0 && s !== signs[i - 1]);
    expect(hasAlternating).toBe(true);
  });

  it('satin 0 reverts to running stitch', () => {
    expect(() => run('satin 3 fd 5 satin 0 fd 5')).not.toThrow();
  });

  it('wide satin emits a warning', () => {
    const { warnings } = run('satin 12 fd 5');
    expect(warnings.some((w) => w.includes('wide'))).toBe(true);
  });

  it('density changes satin spacing', () => {
    const s1 = stitches('satin 4 density 0.4 fd 10');
    const s2 = stitches('satin 4 density 1.0 fd 10');
    // coarser density → fewer stitches
    expect(s1.length).toBeGreaterThan(s2.length);
  });
});

// ── bean stitch ─────────────────────────────────────────────────────────────
describe('run — bean stitch', () => {
  it('bean 3 produces more stitches than plain running', () => {
    const plain = stitches('stitchlen 5 fd 20');
    const bean = stitches('stitchlen 5 bean 3 fd 20');
    expect(bean.length).toBeGreaterThan(plain.length);
  });

  it('bean 1 is effectively the same as no bean', () => {
    const plain = stitches('stitchlen 5 fd 20');
    const b1 = stitches('bean 1 stitchlen 5 fd 20');
    expect(b1.length).toBe(plain.length);
  });

  it('even bean values are bumped to odd and warn', () => {
    const { warnings } = run('bean 2 fd 5');
    expect(warnings.some((w) => w.includes('odd'))).toBe(true);
  });

  it('bean > 9 is clamped to 9 with warning', () => {
    const { warnings } = run('bean 11 fd 5');
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });
});

// ── e-stitch (blanket stitch) ────────────────────────────────────────────────
describe('run — estitch (blanket stitch)', () => {
  it('estitch produces triplets of stitches per step', () => {
    // lock 0 to avoid extra stitches; estitch 3 on a 20mm path with stitchlen 5
    // → 4 spine steps, each emitting 3 stitches = 12, plus the anchor = 13
    const s = stitches('lock 0 stitchlen 5 estitch 3 fd 20');
    // Each step emits 3 stitches (spine forward, prong, spine back)
    // Total = anchor + steps*3
    // The spine point count = round(20/5) = 4, so 4*3=12 + 1 anchor = 13
    expect(s.length).toBe(13);
  });

  it('estitch 0 turns it off', () => {
    expect(() => run('estitch 3 fd 5 estitch 0 fd 5')).not.toThrow();
  });

  it('wide estitch warns', () => {
    const { warnings } = run('estitch 12 fd 5');
    expect(warnings.some((w) => w.includes('wide'))).toBe(true);
  });
});

// ── fills ────────────────────────────────────────────────────────────────────
describe('run — tatami fill', () => {
  it('beginfill/endfill generates fill stitches', () => {
    const src = 'up setxy -15 -15 down beginfill repeat 4 [ fd 30 rt 90 ] endfill';
    const s = stitches(src);
    expect(s.length).toBeGreaterThan(50);
  });

  it('fillangle changes fill direction', () => {
    const base = 'up setxy -15 -15 down beginfill repeat 4 [ fd 30 rt 90 ] endfill';
    const r0 = run(base);
    const r45 = run(`fillangle 45 ${base}`);
    // Different fill angles produce different event streams
    expect(r0.events.length).not.toBe(r45.events.length);
  });

  it('fillspacing coarser means fewer stitches', () => {
    const base = 'up setxy -15 -15 down beginfill repeat 4 [ fd 30 rt 90 ] endfill';
    const fine = stitches(`fillspacing 0.4 ${base}`);
    const coarse = stitches(`fillspacing 2.0 ${base}`);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it('filllen overrides stitch length inside fill', () => {
    expect(() =>
      run('filllen 3 up setxy -10 -10 down beginfill repeat 4 [ fd 20 rt 90 ] endfill'),
    ).not.toThrow();
  });

  it('filllen 0 resets to follow stitchlen', () => {
    expect(() => run('filllen 0')).not.toThrow();
  });

  it('fillspacing out of range is clamped and warns', () => {
    const { warnings } = run(
      'fillspacing 0.1 up setxy -10 -10 down beginfill repeat 4 [ fd 20 rt 90 ] endfill',
    );
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });

  it('warns if fill boundary has fewer than 3 points', () => {
    const { warnings } = run('beginfill fd 5 endfill');
    expect(warnings.some((w) => w.includes('boundary'))).toBe(true);
  });

  it('unclosed beginfill auto-closes at end with warning', () => {
    const src = 'up setxy -10 -10 down beginfill repeat 4 [ fd 20 rt 90 ]';
    const { warnings } = run(src);
    expect(warnings.some((w) => w.includes('beginfill'))).toBe(true);
  });

  it('endfill without beginfill throws', () => {
    expect(() => run('endfill')).toThrow(NeedlescriptError);
  });

  it('nested beginfill throws', () => {
    expect(() => run('beginfill beginfill')).toThrow(NeedlescriptError);
  });
});

// ── color & trim ─────────────────────────────────────────────────────────────
describe('run — color and trim', () => {
  it('color n emits a color event and tags subsequent stitches', () => {
    const ev = evts('fd 5 color 2 fd 5');
    const colorEvs = ev.filter((e) => e.t === 'color');
    expect(colorEvs.length).toBe(1);
    // stitches after color change have c === 2
    const afterColor = ev.filter((e) => e.t === 'stitch' && e.c === 2);
    expect(afterColor.length).toBeGreaterThan(0);
  });

  it('stop advances color by 1', () => {
    const ev = evts('fd 5 stop fd 5');
    const s2 = ev.filter((e) => e.t === 'stitch' && e.c === 1);
    expect(s2.length).toBeGreaterThan(0);
  });

  it('trim emits a trim event', () => {
    expect(count('fd 5 trim fd 5', 'trim')).toBe(1);
  });
});

// ── lock ─────────────────────────────────────────────────────────────────────
describe('run — lock stitches', () => {
  it('lock > 0 (default) adds lock events and returns locks > 0', () => {
    const { locks } = run('fd 20');
    expect(locks).toBeGreaterThan(0);
  });

  it('lock 0 disables locking (locks === 0)', () => {
    const { locks } = run('lock 0 fd 20');
    expect(locks).toBe(0);
  });

  it('lock out of range is clamped and warns', () => {
    const { warnings } = run('lock 2 fd 5');
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });
});

// ── control flow ─────────────────────────────────────────────────────────────
describe('run — control flow', () => {
  it('repeat runs body the correct number of times', () => {
    // lock 0 to avoid lock stitches; stitchlen 10, fd 10 per iter → 1 stitch each
    const s = stitches('lock 0 stitchlen 10 repeat 5 [ fd 10 ]');
    // 1 anchor + 5 stitches = 6
    expect(s.length).toBe(6);
  });

  it('repcount is 1-based inside repeat', () => {
    const { printed } = run('repeat 3 [ print repcount ]');
    expect(printed).toEqual(['1', '2', '3']);
  });

  it('if executes body when condition is truthy', () => {
    const { printed } = run('if 1 > 0 [ print 42 ]');
    expect(printed).toEqual(['42']);
  });

  it('if skips body when condition is falsy', () => {
    const { printed } = run('if 0 > 1 [ print 42 ]');
    expect(printed).toEqual([]);
  });

  it('if/else executes else branch when condition is false', () => {
    const { printed } = run('if 0 [ print 1 ] else [ print 2 ]');
    expect(printed).toEqual(['2']);
  });

  it('make / variable reference works', () => {
    const { printed } = run('make "n 7 print :n');
    expect(printed).toEqual(['7']);
  });

  it('throws on unknown variable', () => {
    expect(() => run('fd :undefined_var')).toThrow(NeedlescriptError);
  });

  it('procedures with parameters work', () => {
    const { printed } = run('to double :x\n  print :x * 2\nend\ndouble 5');
    expect(printed).toEqual(['10']);
  });

  it('procedures can be called before definition if pre-scanned', () => {
    // The parser pre-scans arities — but execution must see proc defined first
    // In Needlescript, procedures must be defined before they're called at runtime
    expect(() => run('to sq :s\n  fd :s\nend\nsq 10')).not.toThrow();
  });

  it('recursive procedures work (tree pattern)', () => {
    const src = [
      'to branch :len',
      '  if :len < 4 [ fd :len bk :len ]',
      '  else [ fd :len / 2 lt 30 branch :len * 0.6 rt 30 bk :len / 2 ]',
      'end',
      'branch 20',
    ].join('\n');
    expect(() => run(src)).not.toThrow();
  });

  it('throws on excessive recursion depth', () => {
    const src = 'to inf\n  inf\nend\ninf';
    expect(() => run(src)).toThrow(NeedlescriptError);
  });

  it('throws on excessive repeat count', () => {
    expect(() => run('repeat 300000 [ fd 1 ]')).toThrow(NeedlescriptError);
  });
});

// ── arithmetic expressions ────────────────────────────────────────────────────
describe('run — expression evaluation', () => {
  it('addition', () => {
    const { printed } = run('print 3 + 4');
    expect(printed).toEqual(['7']);
  });

  it('subtraction', () => {
    const { printed } = run('print 10 - 3');
    expect(printed).toEqual(['7']);
  });

  it('multiplication', () => {
    const { printed } = run('print 3 * 4');
    expect(printed).toEqual(['12']);
  });

  it('division', () => {
    const { printed } = run('print 10 / 4');
    expect(printed).toEqual(['2.5']);
  });

  it('throws on division by zero', () => {
    expect(() => run('print 1 / 0')).toThrow(NeedlescriptError);
  });

  it('comparison returns 1 (true) and 0 (false)', () => {
    const { printed } = run('print 3 > 2\nprint 2 > 3\nprint 3 = 3');
    expect(printed).toEqual(['1', '0', '1']);
  });

  it('mod', () => {
    const { printed } = run('print mod 10 3');
    expect(printed).toEqual(['1']);
  });

  it('sin and cos (degrees)', () => {
    const { printed } = run('print round sin 90\nprint round cos 0');
    expect(printed).toEqual(['1', '1']);
  });

  it('sqrt', () => {
    const { printed } = run('print sqrt 16');
    expect(printed).toEqual(['4']);
  });

  it('sqrt of negative throws', () => {
    expect(() => run('print sqrt -1')).toThrow(NeedlescriptError);
  });

  it('abs', () => {
    const { printed } = run('print abs -5');
    expect(printed).toEqual(['5']);
  });

  it('round', () => {
    const { printed } = run('print round 3.7');
    expect(printed).toEqual(['4']);
  });

  it('xcor / ycor return current position', () => {
    const { printed } = run('fd 10 print xcor\nprint ycor');
    expect(parseFloat(printed[0])).toBeCloseTo(0, 1);
    expect(parseFloat(printed[1])).toBeCloseTo(10, 1);
  });

  it('heading returns current heading', () => {
    const { printed } = run('rt 90 print heading');
    expect(parseFloat(printed[0])).toBeCloseTo(90, 1);
  });
});

// ── seed / random ─────────────────────────────────────────────────────────────
describe('run — seed and random', () => {
  it('same seed produces the same sequence', () => {
    const r1 = run('seed 42 repeat 5 [ print random 100 ]');
    const r2 = run('seed 42 repeat 5 [ print random 100 ]');
    expect(r1.printed).toEqual(r2.printed);
  });

  it('different seeds produce different sequences', () => {
    const r1 = run('seed 1 repeat 5 [ print random 100 ]');
    const r2 = run('seed 2 repeat 5 [ print random 100 ]');
    expect(r1.printed).not.toEqual(r2.printed);
  });

  it('random stays in range [0, n)', () => {
    const { printed } = run('seed 7 repeat 20 [ print random 10 ]');
    printed.forEach((v) => {
      const n = parseFloat(v);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    });
  });
});

// ── print ─────────────────────────────────────────────────────────────────────
describe('run — print', () => {
  it('print logs values as formatted strings', () => {
    const { printed } = run('print 3.14159');
    expect(printed[0]).toBe('3.142');
  });

  it('print formats integers without decimal point', () => {
    const { printed } = run('print 42');
    expect(printed[0]).toBe('42');
  });
});

// ── limits ────────────────────────────────────────────────────────────────────
describe('run — safety limits', () => {
  it('exceeding maxStitches throws', () => {
    // 60 mm / 0.4 mm per stitch = 150 stitches per fd; repeat enough to exceed 60k
    expect(() => run('stitchlen 0.4 repeat 1000 [ fd 60 ]')).toThrow(NeedlescriptError);
  });

  it('exceeding maxOps throws (infinite loop detection)', () => {
    // `repeat` does NOT tick per iteration; ops come from statements and expressions.
    // Cost of `repeat n [ repeat n [ rt 1 lt 1 ] ]`:
    //   outer: 2 (stmt + count expr) + n × (inner: 2 + n × 4) ≈ 4n²
    // Choose n so that 4n² >> LIMITS.maxOps.
    const n = Math.ceil(Math.sqrt(LIMITS.maxOps / 4)) + 100;
    expect(() => run(`repeat ${n} [ repeat ${n} [ rt 1 lt 1 ] ]`)).toThrow(NeedlescriptError);
  });
});

// ── all built-in examples ─────────────────────────────────────────────────────
describe('run — built-in example programs', () => {
  const examples: [string, string][] = [
    ['bloom', `stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]`],
    [
      'wreath',
      `to leaf :s\n  repeat 2 [\n    repeat 30 [ fd :s rt 3 ]\n    rt 90\n  ]\nend\nrepeat 8 [ leaf 1.2 rt 45 ]`,
    ],
    [
      'wander',
      `seed 11\nstitchlen 2\nrepeat 420 [\n  fd 2.6\n  rt random 70 - 35\n  if sqrt ( xcor * xcor + ycor * ycor ) > 36 [\n    rt 140 + random 80\n  ]\n]`,
    ],
    ['star', `up setxy -6 -21 down\nsatin 3\nrepeat 5 [ fd 42 rt 144 ]\nsatin 0`],
    [
      'badge',
      `fillangle 30\nup setxy -26 -15 down\nbeginfill\n  repeat 6 [ fd 30 rt 60 ]\nendfill\ncolor 3\nbean 3\nrepeat 6 [ fd 30 rt 60 ]\nbean 1`,
    ],
    [
      'sampler',
      `stitchlen 2.5\nup setxy -30 27 seth 90 down\nfd 60\nup setxy -30 10 seth 90 down\nbean 3 fd 60 bean 1\nup setxy -30 -8 seth 90 down\nsatin 2.5 fd 60 satin 0\nup setxy -30 -24 seth 90 down\nestitch 4 fd 60 estitch 0`,
    ],
    [
      'waves',
      `stitchlen 2.5\nto wave\n  repeat 3 [\n    repeat 18 [ fd 1.1 rt 10 ]\n    repeat 18 [ fd 1.1 lt 10 ]\n  ]\nend\nrepeat 4 [\n  up setxy 38 repcount * 16 - 40 seth 180 down\n  wave\n]`,
    ],
    [
      'tree',
      `to branch :len\n  if :len < 5 [ fd :len bk :len ]\n  else [\n    fd :len / 2\n    lt 28 branch :len * 0.62 rt 28\n    fd :len / 4\n    rt 32 branch :len * 0.62 lt 32\n    fd :len / 4\n    bk :len\n  ]\nend\nup setxy 0 -27 down\nbranch 34`,
    ],
  ];

  for (const [name, src] of examples) {
    it(`runs "${name}" without error and produces stitches`, () => {
      const result = run(src);
      const s = result.events.filter((e) => e.t === 'stitch');
      expect(s.length).toBeGreaterThan(0);
    });
  }
});
