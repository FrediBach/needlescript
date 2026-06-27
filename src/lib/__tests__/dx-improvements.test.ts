import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

// Test suite for NeedleScript DX Improvements (RFC DX items 1–7).

const evts = (src: string) => run(src).events;
const stitches = (src: string) => evts(src).filter((e) => e.t === 'stitch');
const printed = (src: string) => run(src).printed;
const warns = (src: string) => run(src).warnings;

const sameStream = (a: StitchEvent[], b: StitchEvent[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    if (
      x.t !== y.t ||
      x.c !== y.c ||
      (x.u || 0) !== (y.u || 0) ||
      Math.abs(x.x - y.x) > 1e-9 ||
      Math.abs(x.y - y.y) > 1e-9
    )
      return false;
  }
  return true;
};

// ── RFC #1: moveto / jump ────────────────────────────────────────────────────

describe('moveto — reposition without sewing', () => {
  it('moveto produces a jump event, not a stitch', () => {
    const e = evts('fd 5 moveto 10 20');
    const js = e.filter((ev) => ev.t === 'jump');
    expect(js.length).toBeGreaterThan(0);
    const last = e[e.length - 1];
    expect(last.t).toBe('jump');
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(20, 6);
  });

  it('moveto with pen already up stays a jump, pen remains up', () => {
    // up → moveto → fd: the fd should produce stitches, not jumps
    // because moveto restores pen state (it was up before, remains up)
    const e = evts('up moveto 10 0 fd 5');
    const js = e.filter((ev) => ev.t === 'jump');
    // all events are jumps — pen was up before moveto and fd also sews as jump
    for (const ev of e) expect(ev.t).toBe('jump');
    expect(js.length).toBeGreaterThan(0);
  });

  it('moveto with pen down restores pen to down after the move', () => {
    // Pen is down → moveto (jump) → fd: fd should sew (pen restored to down)
    const e = evts('moveto 10 0 fd 5');
    const s = e.filter((ev) => ev.t === 'stitch');
    expect(s.length).toBeGreaterThan(0);
  });

  it('moveto is byte-identical to up setxy down when pen was down', () => {
    const withMoveto = evts('lock 0 fd 5 moveto 10 0 fd 5');
    const withLegacy = evts('lock 0 fd 5 up setxy 10 0 down fd 5');
    expect(sameStream(withMoveto, withLegacy)).toBe(true);
  });

  it('moveto is byte-identical to up setxy when pen was already up', () => {
    const withMoveto = evts('lock 0 up fd 20 moveto 5 5 fd 5');
    const withLegacy = evts('lock 0 up fd 20 up setxy 5 5 fd 5');
    expect(sameStream(withMoveto, withLegacy)).toBe(true);
  });

  it('moveto call syntax works: moveto(x, y)', () => {
    const withPrefix = evts('moveto 10 20 fd 5');
    const withCall = evts('moveto(10, 20) fd 5');
    expect(sameStream(withPrefix, withCall)).toBe(true);
  });

  it('jump is an alias for moveto', () => {
    const withMoveto = evts('lock 0 fd 5 moveto 10 0 fd 5');
    const withJump = evts('lock 0 fd 5 jump 10 0 fd 5');
    expect(sameStream(withMoveto, withJump)).toBe(true);
  });

  it('moveto draws nothing from the seeded RNG (draw cost: 0)', () => {
    // A random() call after moveto should give the same value as without moveto
    const withMoveto = printed('moveto 10 0 print random(1000)');
    const without = printed('print random(1000)');
    expect(withMoveto).toEqual(without);
  });

  it('moveto respects the current transform (coordinates are local-frame)', () => {
    // Under a translate(10, 20), moveto 5 3 should land at hoop-space (15, 23)
    const e = evts('translate 10 20 [ moveto 5 3 ]');
    const jumpsEvts = e.filter((ev) => ev.t === 'jump');
    const last = jumpsEvts[jumpsEvts.length - 1];
    expect(last.x).toBeCloseTo(15, 6);
    expect(last.y).toBeCloseTo(23, 6);
  });
});

// ── RFC #5: gohome ───────────────────────────────────────────────────────────

describe('gohome — pen-safe return to origin', () => {
  it('gohome jumps to (0, 0) without sewing', () => {
    // Pen is down, so any sewing move would produce stitches
    const e = evts('fd 10 gohome');
    // The return leg must be a jump, not stitches
    const js = e.filter((ev) => ev.t === 'jump');
    expect(js.length).toBeGreaterThan(0);
    const last = js[js.length - 1];
    expect(last.x).toBeCloseTo(0, 6);
    expect(last.y).toBeCloseTo(0, 6);
  });

  it('gohome ≡ moveto 0 0, byte-identical', () => {
    const withGohome = evts('lock 0 fd 10 gohome fd 5');
    const withMoveto = evts('lock 0 fd 10 moveto 0 0 fd 5');
    expect(sameStream(withGohome, withMoveto)).toBe(true);
  });

  it('gohome does NOT reset heading (use seth 0 for that)', () => {
    // After rt 90 + gohome, heading should still be 90 (east)
    // So fd 5 after lands at (5, 0), not (0, 5)
    const e = stitches('rt 90 gohome fd 5');
    const last = e[e.length - 1];
    expect(last.x).toBeCloseTo(5, 1);
    expect(last.y).toBeCloseTo(0, 1);
  });

  it('gohome restores pen state', () => {
    // Pen down before gohome → pen remains down afterward
    const e = evts('fd 5 gohome fd 5');
    const finalStitches = e.filter((ev) => ev.t === 'stitch');
    expect(finalStitches.length).toBeGreaterThan(0);
  });

  it('gohome draws nothing from the seeded RNG (draw cost: 0)', () => {
    const withGohome = printed('gohome print random(1000)');
    const without = printed('print random(1000)');
    expect(withGohome).toEqual(without);
  });
});

// ── RFC #2: circle r ─────────────────────────────────────────────────────────

describe('circle r — full closed circle', () => {
  it('circle r ≡ arc 360 r, byte-identical event stream', () => {
    const withCircle = evts('lock 0 circle 15');
    const withArc = evts('lock 0 arc 360 15');
    expect(sameStream(withCircle, withArc)).toBe(true);
    expect(withCircle.filter((e) => e.t === 'stitch').length).toBeGreaterThan(10);
  });

  it('works in satin mode: circle produces a satin ring', () => {
    const withCircle = evts('lock 0 satin 3 circle 12');
    const withArc = evts('lock 0 satin 3 arc 360 12');
    expect(sameStream(withCircle, withArc)).toBe(true);
  });

  it('works in bean mode', () => {
    const withCircle = evts('lock 0 bean 3 circle 10');
    const withArc = evts('lock 0 bean 3 arc 360 10');
    expect(sameStream(withCircle, withArc)).toBe(true);
  });

  it('works in estitch mode', () => {
    const withCircle = evts('lock 0 estitch 3 circle 10');
    const withArc = evts('lock 0 estitch 3 arc 360 10');
    expect(sameStream(withCircle, withArc)).toBe(true);
  });

  it('call syntax: circle(15)', () => {
    const withPrefix = evts('lock 0 circle 15');
    const withCall = evts('lock 0 circle(15)');
    expect(sameStream(withPrefix, withCall)).toBe(true);
  });

  it('draws nothing from the seeded RNG (draw cost: 0)', () => {
    const withCircle = printed('circle 10 print random(1000)');
    const without = printed('arc 360 10 print random(1000)');
    expect(withCircle).toEqual(without);
  });
});

// ── RFC #3: satinpair / satinrake / satinasym ────────────────────────────────

describe('satinpair — symmetric satin tuple helper', () => {
  it('satinpair(advance, width) ≡ [advance, width, width, 0, 0]', () => {
    const viaHelper = printed('print satinpair(0.4, 2)');
    const viaLiteral = printed('print [0.4, 2, 2, 0, 0]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('satin @fn using satinpair(0.4, 2) is byte-identical to satin 4', () => {
    const builtin = evts('lock 0 satin 4\nfd 40');
    const programmable = evts(
      'def c(t, s, i, u) [ return satinpair(0.4, 2) ]\nlock 0 satin @c\nfd 40',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
  });

  it('draw cost is 0', () => {
    const withHelper = printed(
      'def c(t,s,i,u)[return satinpair(0.4,2)] satin @c fd 5 print random(1000)',
    );
    const withLiteral = printed(
      'def c(t,s,i,u)[return [0.4,2,2,0,0]] satin @c fd 5 print random(1000)',
    );
    expect(withHelper).toEqual(withLiteral);
  });
});

describe('satinrake — raked satin tuple helper', () => {
  it('satinrake(advance, width, lag) ≡ [advance, width, width, -lag, lag]', () => {
    const viaHelper = printed('print satinrake(0.4, 2, 0.8)');
    const viaLiteral = printed('print [0.4, 2, 2, -0.8, 0.8]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('negative lag also correct: satinrake(a, w, -lag) ≡ [a, w, w, lag, -lag]', () => {
    const viaHelper = printed('print satinrake(0.4, 2, -0.8)');
    const viaLiteral = printed('print [0.4, 2, 2, 0.8, -0.8]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('satin @fn crosshatch (alternating rake): byte-identical to hand-written tuples', () => {
    const withHelper = evts(
      'def ch(t, s, i, u) [\n' +
        '  if mod(i, 2) = 0 [ return satinrake(0.4, 2, 0.8) ]\n' +
        '  return satinrake(0.4, 2, -0.8)\n' +
        ']\nlock 0 satin @ch\nfd 40',
    );
    const withLiteral = evts(
      'def ch(t, s, i, u) [\n' +
        '  if mod(i, 2) = 0 [ return [0.4, 2, 2, -0.8, 0.8] ]\n' +
        '  return [0.4, 2, 2, 0.8, -0.8]\n' +
        ']\nlock 0 satin @ch\nfd 40',
    );
    expect(sameStream(withHelper, withLiteral)).toBe(true);
  });
});

describe('satinasym — asymmetric satin tuple helper', () => {
  it('satinasym(advance, leftw, rightw) ≡ [advance, leftw, rightw, 0, 0]', () => {
    const viaHelper = printed('print satinasym(0.4, 1.5, 2.5)');
    const viaLiteral = printed('print [0.4, 1.5, 2.5, 0, 0]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('satin @fn using satinasym is byte-identical to equivalent raw tuple', () => {
    const withHelper = evts(
      'def af(t, s, i, u) [ return satinasym(0.4, 1, 3) ]\nlock 0 satin @af\nfd 30',
    );
    const withLiteral = evts(
      'def af(t, s, i, u) [ return [0.4, 1, 3, 0, 0] ]\nlock 0 satin @af\nfd 30',
    );
    expect(sameStream(withHelper, withLiteral)).toBe(true);
  });
});

// ── RFC #4: tatamirow ────────────────────────────────────────────────────────

describe('tatamirow — fill-shaper helper', () => {
  it('tatamirow(spacing, len) ≡ [spacing, len, 0.5]', () => {
    const viaHelper = printed('print tatamirow(0.4, 2.5)');
    const viaLiteral = printed('print [0.4, 2.5, 0.5]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('tatamirow(spacing, len, phase) ≡ [spacing, len, phase]', () => {
    const viaHelper = printed('print tatamirow(0.4, 2.5, 0.3)');
    const viaLiteral = printed('print [0.4, 2.5, 0.3]');
    expect(viaHelper).toEqual(viaLiteral);
  });

  it('fill @zero shape @tatamirow-reporter is byte-identical to plain fill', () => {
    const builtin = evts('stitchlen 2.5\nbeginfill\narc 360 20\nendfill');
    const programmable = evts(
      'stitchlen 2.5\n' +
        'def zero(p) [ return 0 ]\n' +
        'def cons(p, row, v) [ return tatamirow(0.4, 2.5) ]\n' +
        'fill dir @zero shape @cons\n' +
        'beginfill\narc 360 20\nendfill',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
  });

  it('draw cost is 0', () => {
    const withHelper = printed(
      'def zero(p)[return 0] def sh(p,row,v)[return tatamirow(0.4,2.5)] fill dir @zero shape @sh beginfill arc 360 15 endfill print random(1000)',
    );
    const withLiteral = printed(
      'def zero(p)[return 0] def sh(p,row,v)[return [0.4,2.5,0.5]] fill dir @zero shape @sh beginfill arc 360 15 endfill print random(1000)',
    );
    expect(withHelper).toEqual(withLiteral);
  });
});

// ── RFC #7: printloc ─────────────────────────────────────────────────────────

describe('printloc — needle-position diagnostic', () => {
  it('printloc prints loc: [x, y] at the current turtle position', () => {
    const p = printed('fd 10 printloc');
    expect(p.length).toBe(1);
    expect(p[0]).toMatch(/^loc: /);
    expect(p[0]).toMatch(/\[0, 10\]/);
  });

  it('printloc "label uses the given label', () => {
    const p = printed('seth 90 fd 5 printloc "pos');
    expect(p[0]).toMatch(/^pos: /);
  });

  it('printloc output equals print "loc pos() at representative positions', () => {
    const via_printloc = printed('rt 45 fd 20 printloc "here');
    // Manually build the equivalent
    const via_print = printed('rt 45 fd 20 print "here pos()');
    expect(via_printloc).toEqual(via_print);
  });

  it('printloc inside a translate reports local-frame coordinates', () => {
    // Turtle is still at (0,0) in local frame inside the translate block
    const p = printed('translate 15 20 [ printloc ]');
    expect(p[0]).toBe('loc: [0, 0]');
  });

  it('printloc draws nothing (no stitch events)', () => {
    const e = evts('printloc');
    expect(e.length).toBe(0);
  });

  it('call syntax: printloc() works', () => {
    const p1 = printed('fd 5 printloc');
    const p2 = printed('fd 5 printloc()');
    expect(p1).toEqual(p2);
  });

  it('printloc draws nothing from the seeded RNG', () => {
    const withPrintloc = printed('printloc print random(1000)');
    const without = printed('print random(1000)');
    expect(withPrintloc[withPrintloc.length - 1]).toEqual(without[0]);
  });
});

// ── RFC #6: parse-time reporter-path check ───────────────────────────────────

describe('parse-time reporter-path check', () => {
  it('a reporter with no return at all fails at parse time', () => {
    expect(() => run('def r(t,s,i,u) [ fd 1 ]\nsatin @r\nfd 10')).toThrow(
      /may finish without returning a value/,
    );
  });

  it('a reporter with an if but no matching else fails at parse time', () => {
    expect(() =>
      run('def r(t,s,i,u) [\n  if s > 0.5 [ return satinpair(0.4, 2) ]\n]\nsatin @r\nfd 10'),
    ).toThrow(/may finish without returning a value/);
  });

  it('an if-else where both branches return is valid', () => {
    expect(() =>
      run(
        'def r(t, s, i, u) [\n' +
          '  if s > 0.5 [ return satinpair(0.4, 2) ]\n' +
          '  else [ return satinpair(0.3, 1.5) ]\n' +
          ']\nsatin @r\nfd 10',
      ),
    ).not.toThrow();
  });

  it('a return reachable only inside a repeat does not cover the path', () => {
    expect(() =>
      run('def r(t,s,i,u) [\n  repeat 3 [ return satinpair(0.4,2) ]\n]\nsatin @r\nfd 10'),
    ).toThrow(/may finish without returning a value/);
  });

  it('a valued return after a loop does cover the path', () => {
    expect(() =>
      run(
        'def r(t,s,i,u) [\n' +
          '  repeat 3 [ fd 0 ]\n' +
          '  return satinpair(0.4, 2)\n' +
          ']\nsatin @r\nfd 10',
      ),
    ).not.toThrow();
  });

  it('the check applies to callexpr (not just @name / procref)', () => {
    // print f calls f in expression position → f must return
    expect(() => run('to f fd 1 end print f')).toThrow(/may finish without returning a value/);
  });

  it('the check does NOT apply to procedures used only as commands', () => {
    // draw is used only as a command (not as a value), so no path check
    expect(() => run('to draw fd 10 end draw')).not.toThrow();
  });

  it('error message names the reporter and has a helpful tip', () => {
    let msg = '';
    try {
      run(
        'def myreporter(t,s,i,u) [ if s > 0 [ return [0.4,2,2,0,0] ] ]\nsatin @myreporter\nfd 10',
      );
    } catch (e) {
      msg = String(e);
    }
    expect(msg).toMatch(/myreporter/);
    expect(msg).toMatch(/else/i);
  });

  it('a procedure used via warp @name is also checked', () => {
    expect(() => run('def noret(p) [ fd 1 ]\nwarp @noret [ fd 5 ]')).toThrow(
      /may finish without returning a value/,
    );
  });

  it('a warp reporter with a guaranteed return passes', () => {
    expect(() => run('def identity(p) [ return p ]\nwarp @identity [ fd 5 ]')).not.toThrow();
  });

  it('fill dir reporter missing return fails at parse time', () => {
    expect(() => run('def noret(p) [ fd 1 ]\nfill @noret\nbeginfill arc 360 15 endfill')).toThrow(
      /may finish without returning a value/,
    );
  });
});

// ── Warns section: no new runtime warnings from new commands ──────────────────

describe('no accidental warnings from new commands', () => {
  it('moveto does not warn about anything', () => {
    expect(warns('moveto 5 5')).toEqual([]);
  });

  it('gohome does not warn', () => {
    expect(warns('fd 20 gohome')).toEqual([]);
  });

  it('circle does not warn for normal radii', () => {
    expect(warns('circle 15')).toEqual([]);
  });

  it('satinpair/satinrake/satinasym return correct shapes without warning', () => {
    // These are pure helpers — just check they produce 5-element lists
    const r1 = run('def c(t,s,i,u)[return satinpair(0.4,2)] satin @c fd 5');
    const r2 = run('def c(t,s,i,u)[return satinrake(0.4,2,0.5)] satin @c fd 5');
    const r3 = run('def c(t,s,i,u)[return satinasym(0.4,1,3)] satin @c fd 5');
    expect(r1.warnings.filter((w) => !w.includes('note:'))).toEqual([]);
    expect(r2.warnings.filter((w) => !w.includes('note:'))).toEqual([]);
    expect(r3.warnings.filter((w) => !w.includes('note:'))).toEqual([]);
  });
});
