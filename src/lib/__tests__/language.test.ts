import { describe, it, expect } from 'vitest';
import { run, designStats, makeNoise, suggest, NeedlescriptError } from '../engine.ts';
import { toDST } from '../formats/dst.ts';
import { EXAMPLES } from '../../data.ts';

// ── helpers ────────────────────────────────────────────────────────────────

const stitches = (src: string) => run(src).events.filter((e) => e.t === 'stitch');
const lastStitch = (src: string) => {
  const s = stitches(src);
  return s[s.length - 1];
};
const printed = (src: string) => run(src).printed;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── new operators ───────────────────────────────────────────────────────────
describe('operators — <= >= != and or not', () => {
  it('<= and >= compare inclusively', () => {
    expect(printed('print 3 <= 3 print 4 <= 3 print 3 >= 3 print 2 >= 3')).toEqual([
      '1',
      '0',
      '1',
      '0',
    ]);
  });

  it('!= compares for inequality', () => {
    expect(printed('print 1 != 2 print 1 != 1')).toEqual(['1', '0']);
  });

  it('and / or / not work on truthiness (0 = false)', () => {
    expect(
      printed('print 1 and 0 print 1 and 2 print 0 or 0 print 0 or 5 print not 0 print not 7'),
    ).toEqual(['0', '1', '0', '1', '1', '0']);
  });

  it('and / or short-circuit, so guarded division is safe', () => {
    expect(printed('print 0 and 1 / 0')).toEqual(['0']);
    expect(printed('print 1 or 1 / 0')).toEqual(['1']);
  });

  it('lone "!" is a tokenizer error', () => {
    expect(() => run('print 1 ! 2')).toThrow(NeedlescriptError);
  });
});

// ── while / for ─────────────────────────────────────────────────────────────
describe('while and for loops', () => {
  it('while runs until the condition is false', () => {
    expect(printed('make "i 0 while :i < 5 [ make "i :i + 1 ] print :i')).toEqual(['5']);
  });

  it('while that never sews and never ends hits the ops budget', () => {
    expect(() => run('make "i 1 while :i > 0 [ make "i :i + 1 ]')).toThrow(/ran too long/);
  });

  it('for counts inclusively with the given step', () => {
    expect(printed('for "i 1 5 1 [ print :i ]')).toEqual(['1', '2', '3', '4', '5']);
    expect(printed('for "i 0 10 5 [ print :i ]')).toEqual(['0', '5', '10']);
  });

  it('for steps downward with a negative step', () => {
    expect(printed('for "i 5 1 -2 [ print :i ]')).toEqual(['5', '3', '1']);
  });

  it('for with step 0 is an error', () => {
    expect(() => run('for "i 0 10 0 [ fd 1 ]')).toThrow(/step/);
  });

  it('for counter does not leak after the loop', () => {
    expect(() => run('for "i 1 3 1 [ ] print :i')).toThrow(/Unknown variable/);
  });

  it('for restores a pre-existing variable of the same name', () => {
    expect(printed('make "i 99 for "i 1 3 1 [ ] print :i')).toEqual(['99']);
  });
});

// ── local / make scoping ────────────────────────────────────────────────────
describe('local variables', () => {
  it('local stays inside the procedure and make updates it there', () => {
    const src = ['to f', '  local "x 5', '  make "x 7', '  print :x', 'end', 'f'].join('\n');
    expect(printed(src)).toEqual(['7']);
    expect(() => run(src + '\nprint :x')).toThrow(/Unknown variable/);
  });

  it('make on a procedure parameter updates the local copy', () => {
    const src = [
      'to f :n',
      '  make "n :n + 1',
      '  print :n',
      'end',
      'make "n 100',
      'f 1',
      'print :n',
    ].join('\n');
    expect(printed(src)).toEqual(['2', '100']);
  });

  it('make without a local still writes a global from inside a procedure', () => {
    expect(printed('to f make "g 3 end f print :g')).toEqual(['3']);
  });

  it('local at the top level is an error', () => {
    expect(() => run('local "x 1')).toThrow(/inside a procedure/);
  });
});

// ── output / exit (reporters) ───────────────────────────────────────────────
describe('output and exit', () => {
  it('a procedure with output can be used as a value', () => {
    expect(printed('to double :n output :n * 2 end print double 21')).toEqual(['42']);
  });

  it('reporters work in command arguments', () => {
    const last = lastStitch('lock 0 to double :n output :n * 2 end fd double 5');
    expect(r2(last.y)).toBeCloseTo(10, 1);
  });

  it('reporters can recurse', () => {
    const src = [
      'to fact :n',
      '  if :n < 2 [ output 1 ]',
      '  output :n * fact :n - 1',
      'end',
      'print fact 5',
    ].join('\n');
    expect(printed(src)).toEqual(['120']);
  });

  it('exit leaves a procedure early', () => {
    expect(stitches('to f :n if :n > 3 [ exit ] fd 10 end f 5').length).toBe(0);
    expect(stitches('to f :n if :n > 3 [ exit ] fd 10 end lock 0 f 1').length).toBeGreaterThan(0);
  });

  it('output also stops the procedure when called as a plain command', () => {
    expect(printed('to f print 1 output 9 print 2 end f')).toEqual(['1']);
  });

  it('using a procedure as a value without output is an error', () => {
    // RFC DX item 6: parse-time reporter-path check promotes this to a compile error.
    expect(() => run('to f fd 1 end print f')).toThrow(/may finish without returning a value/);
  });

  it('output / exit at the top level are errors', () => {
    expect(() => run('output 1')).toThrow(/inside a procedure/);
    expect(() => run('exit')).toThrow(/inside a procedure/);
    expect(() => run('repeat 3 [ exit ]')).toThrow(/inside a procedure/);
  });

  it('op is an alias for output', () => {
    expect(printed('to three op 3 end print three')).toEqual(['3']);
  });
});

// ── new math functions ──────────────────────────────────────────────────────
describe('math functions', () => {
  it('min / max / pow / floor / ceil', () => {
    expect(
      printed('print min 3 5 print max 3 5 print pow 2 10 print floor 2.7 print ceil 2.1'),
    ).toEqual(['3', '5', '1024', '2', '3']);
  });

  it('pow that overflows is an error', () => {
    expect(() => run('print pow 10 10000')).toThrow(/not a finite/);
  });

  it('log is the natural logarithm and supports base conversion', () => {
    expect(
      printed('print round(log(2.718281828459045) * 1000) print round(log(1000) / log(10))'),
    ).toEqual(['1000', '3']);
  });

  it('log rejects zero and negative inputs', () => {
    expect(() => run('print log 0')).toThrow(/log requires a positive number, got 0/);
    expect(() => run('print log(-1)')).toThrow(/log requires a positive number, got -1/);
  });

  it('atan returns a heading-convention angle (0 = north, clockwise)', () => {
    expect(printed('print atan 1 0 print atan 0 1 print atan 0 -1')).toEqual(['90', '0', '180']);
  });

  it('towards and distance measure from the needle', () => {
    expect(printed('print towards 10 0 print distance 3 4')).toEqual(['90', '5']);
    // after moving, both are relative to the new position
    expect(printed('lock 0 up setxy 10 0 print towards 20 0 print distance 10 10')).toEqual([
      '90',
      '10',
    ]);
  });
});

// ── noise ───────────────────────────────────────────────────────────────────
describe('noise', () => {
  it('is deterministic for a given seed', () => {
    const a = printed('print noise 3.7 print noise2 1.2 8.4');
    const b = printed('print noise 3.7 print noise2 1.2 8.4');
    expect(a).toEqual(b);
  });

  it('changes when reseeded', () => {
    const a = printed('seed 1 print noise 3.7');
    const b = printed('seed 2 print noise 3.7');
    expect(a).not.toEqual(b);
  });

  it('stays in [0, 1) and is smooth', () => {
    const n = makeNoise(42);
    for (let x = -5; x < 5; x += 0.37) {
      const v = n(x, x * 1.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // adjacent samples should be close
    expect(Math.abs(n(2.5) - n(2.51))).toBeLessThan(0.06);
  });

  it('same coordinates give the same value across calls', () => {
    const n = makeNoise(7);
    expect(n(1.5, 2.5)).toBe(n(1.5, 2.5));
  });
});

// ── arc ─────────────────────────────────────────────────────────────────────
describe('arc', () => {
  it('arc 360 comes back to the start', () => {
    const last = lastStitch('lock 0 stitchlen 1 arc 360 10');
    expect(Math.hypot(last.x, last.y)).toBeLessThan(0.5);
  });

  it('arc 90 to the right lands on the circle and turns the heading', () => {
    const out = run('lock 0 stitchlen 1 arc 90 10 print xcor print ycor print heading');
    expect(Number(out.printed[0])).toBeCloseTo(10, 1);
    expect(Number(out.printed[1])).toBeCloseTo(10, 1);
    expect(Number(out.printed[2])).toBeCloseTo(90, 1);
  });

  it('negative degrees curve left', () => {
    const out = run('lock 0 stitchlen 1 arc -90 10 print xcor print ycor');
    expect(Number(out.printed[0])).toBeCloseTo(-10, 1);
    expect(Number(out.printed[1])).toBeCloseTo(10, 1);
  });

  it('arc 0 or radius 0 sews nothing', () => {
    expect(stitches('lock 0 arc 0 10').length).toBe(0);
    expect(stitches('lock 0 arc 90 0').length).toBe(0);
  });
});

// ── push / pop ──────────────────────────────────────────────────────────────
describe('push and pop', () => {
  it('pop jumps back to the saved position and heading', () => {
    const out = run('lock 0 push rt 45 fd 10 pop print xcor print ycor print heading');
    expect(out.printed).toEqual(['0', '0', '0']);
    expect(out.events.some((e) => e.t === 'jump')).toBe(true);
  });

  it('pop never sews the way back', () => {
    const before = stitches('lock 0 fd 5').length;
    const after = stitches('lock 0 push fd 5 pop').length;
    expect(after).toBe(before); // the return trip added no stitches
  });

  it('push/pop nest', () => {
    const out = run('lock 0 push fd 5 push rt 90 fd 5 pop pop print xcor print ycor');
    expect(out.printed).toEqual(['0', '0']);
  });

  it('pop with an empty stack warns instead of failing', () => {
    const out = run('pop fd 1');
    expect(out.warnings.some((w) => w.includes('pop ignored'))).toBe(true);
  });
});

// ── setx / sety ─────────────────────────────────────────────────────────────
describe('setx / sety', () => {
  it('move one axis at a time', () => {
    const last = lastStitch('lock 0 setx 10 sety 5');
    expect(r2(last.x)).toBeCloseTo(10, 1);
    expect(r2(last.y)).toBeCloseTo(5, 1);
  });
});

// ── debugging: mark, assert, labeled print ──────────────────────────────────
describe('debugging commands', () => {
  it('mark emits a render-only event at the needle', () => {
    const out = run('lock 0 fd 5 mark');
    const marks = out.events.filter((e) => e.t === 'mark');
    expect(marks.length).toBe(1);
    expect(r2(marks[0].y)).toBeCloseTo(5, 1);
  });

  it('mark does not change stats or the DST export', () => {
    const plain = run('lock 0 fd 5 rt 90 fd 5');
    const marked = run('lock 0 fd 5 mark rt 90 fd 5 mark');
    expect(designStats(marked.events)).toEqual(designStats(plain.events));
    expect(toDST(marked.events).length).toBe(toDST(plain.events).length);
  });

  it('assert passes silently and fails loudly with a line number', () => {
    expect(() => run('assert 1 fd 1')).not.toThrow();
    expect(() => run('fd 1\nassert xcor > 5')).toThrow(/assertion failed.*line 2/);
  });

  it('print accepts an optional label', () => {
    expect(printed('print "size 42')).toEqual(['size: 42']);
    expect(printed('make "r 1.5 print "radius :r')).toEqual(['radius: 1.5']);
  });
});

// ── stitch ↔ source line mapping ────────────────────────────────────────────
describe('source line tagging', () => {
  it('every stitch knows the line that sewed it', () => {
    const out = run('lock 0 fd 5\nrt 90\nfd 5');
    const lines = new Set(out.events.map((e) => e.line));
    expect(lines.has(1)).toBe(true);
    expect(lines.has(3)).toBe(true);
    expect(out.events.every((e) => e.line !== undefined)).toBe(true);
  });

  it('stitches sewn inside a procedure report the call site, not the line of the fd', () => {
    const out = run('lock 0\nto f\nfd 5\nend\nf');
    expect(out.events.every((e) => e.line === 5)).toBe(true);
  });

  it('lock stitches inherit a neighbouring line', () => {
    const out = run('fd 5');
    expect(out.events.every((e) => e.line !== undefined)).toBe(true);
  });
});

// ── did-you-mean ────────────────────────────────────────────────────────────
describe('did-you-mean suggestions', () => {
  it('suggests close command names, labelled with their kind', () => {
    expect(() => run('stichlen 2')).toThrow(/did you mean the command "stitchlen"/);
  });

  it('suggests close variable names', () => {
    expect(() => run('make "size 5 fd :sive')).toThrow(/did you mean "size"/);
  });

  it('suggests user procedure names, labelled with their kind', () => {
    expect(() => run('to petal fd 1 end petall')).toThrow(/did you mean the procedure "petal"/);
  });

  it('stays silent when nothing is close', () => {
    expect(() => run('zzzzzzz 1')).toThrow(/^(?!.*did you mean).*Unknown command/);
  });

  it('suggest() respects the distance threshold', () => {
    expect(suggest('stichlen', ['stitchlen', 'fd'])).toBe('stitchlen');
    expect(suggest('zz', ['stitchlen', 'fd'])).toBe(null);
  });
});

// ── reserved words ──────────────────────────────────────────────────────────
describe('reserved words', () => {
  it.each([
    'while',
    'for',
    'output',
    'exit',
    'local',
    'and',
    'or',
    'not',
    'noise',
    'arc',
    'push',
    'break',
    'continue',
  ])('refuses to redefine "%s"', (w) => {
    expect(() => run(`to ${w} fd 1 end`)).toThrow(/can't be redefined/);
  });
});

// ── examples stay sewable ───────────────────────────────────────────────────
describe('bundled examples', () => {
  it.each(Object.keys(EXAMPLES))('"%s" runs and fits the hoop', (key) => {
    const out = run(EXAMPLES[key]);
    const stats = designStats(out.events);
    expect(stats.stitches).toBeGreaterThan(0);
    // When the example declares a hoop, allow the larger field radius.
    // For rectangular hoops, use the half-diagonal as the outer bound.
    const maxAllowed = out.activeHoop
      ? Math.hypot(out.activeHoop.fieldWidthMM, out.activeHoop.fieldHeightMM) / 2 + 5
      : 47;
    expect(stats.maxRadius).toBeLessThanOrEqual(maxAllowed);
  });
});
