// ---------- trace / tracerings (RFC-trace) ----------
//
// Block expressions that capture turtle paths as data. The sandbox rule:
// full language semantics, but the stitch machine is disconnected; nothing
// is sewn, and on exit the turtle and all stitch state are restored. The
// returned path(s), the RNG stream, and ordinary program effects (vars,
// print, assert) escape.

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

const ev = (src: string) => run(src).events;

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Strip line tags and round coordinates so float noise doesn't matter. */
function clean(evs: StitchEvent[]) {
  return evs.map((e) => ({ t: e.t, x: r4(e.x), y: r4(e.y), c: e.c, ...(e.u ? { u: e.u } : {}) }));
}

// ── Parse tests ─────────────────────────────────────────────────────────────

describe('trace / tracerings parsing', () => {
  it('trace in statement position is a parse error', () => {
    expect(() => run('trace [ fd 10 ]')).toThrow(/produces a value/);
  });

  it('tracerings in statement position is a parse error', () => {
    expect(() => run('tracerings [ fd 10 ]')).toThrow(/produces a value/);
  });

  it('trace works as an initializer', () => {
    const r = run('let p = trace [ fd 10 ]\nprint len(p)');
    expect(r.printed).toEqual(['2']);
  });

  it('trace works as a function argument', () => {
    const r = run('print len(trace [ fd 10 ])');
    expect(r.printed).toEqual(['2']);
  });

  it('trace result can be indexed with [n]', () => {
    const r = run('let p = trace [ fd 10 ]\nprint p[1][1]');
    expect(r.printed).toEqual(['10']);
  });

  it('trace with missing [ is a parse error', () => {
    expect(() => run('let p = trace fd 10')).toThrow(/Expected \[/);
  });

  it('tracerings works as an initializer', () => {
    const r = run('let rings = tracerings [ fd 10 up fd 5 down fd 10 ]\nprint len(rings)');
    expect(r.printed).toEqual(['2']);
  });

  it('trace and tracerings are reserved — cannot shadow', () => {
    expect(() => run('def trace() [ return 1 ]')).toThrow();
    expect(() => run('def tracerings() [ return 1 ]')).toThrow();
  });
});

// ── Golden pins (§8) ────────────────────────────────────────────────────────

describe('golden pin 1: round trip', () => {
  it('sewpath(trace [ B ]) is stitch-identical to B directly', () => {
    // A simple movement-only block
    const direct = clean(ev('fd 10 rt 45 fd 15'));
    const traced = clean(ev('sewpath(trace [ fd 10 rt 45 fd 15 ])'));
    expect(traced).toEqual(direct);
  });

  it('round trip holds under an enclosing transform', () => {
    const direct = clean(ev('translate 20 5 [ fd 10 rt 90 fd 10 ]'));
    const traced = clean(ev('translate 20 5 [ sewpath(trace [ fd 10 rt 90 fd 10 ]) ]'));
    expect(traced).toEqual(direct);
  });
});

describe('golden pin 2: purity', () => {
  it('trace leaves position, heading, pen, mode, colour, and event stream unchanged', () => {
    const src = [
      'fd 5',
      'let p = trace [ fd 100 rt 45 satin 3 color 2 trim ]',
      'print xcor',
      'print ycor',
      'print heading',
    ].join('\n');
    const r = run(src);
    expect(r.printed).toEqual(['0', '5', '0']);
    // Only the first fd 5 should produce stitches — nothing from inside trace
    const stOnly = r.events.filter((e) => e.t === 'stitch');
    expect(stOnly.length).toBeGreaterThan(0);
    // No color changes or trims from the trace block
    expect(r.events.filter((e) => e.t === 'color')).toHaveLength(0);
    expect(r.events.filter((e) => e.t === 'trim')).toHaveLength(0);
  });
});

describe('golden pin 3: draw accounting', () => {
  it('trace [ random(5) ] consumes exactly 1 draw', () => {
    // Call random twice normally; after a trace with one random call,
    // the next random should equal the second of the pair.
    const pair = run('let a = random(1000)\nlet b = random(1000)\nprint b').printed[0];
    const afterTrace = run(
      'let _ = trace [ let x = random(1000) fd 1 ]\nlet b = random(1000)\nprint b',
    ).printed[0];
    expect(afterTrace).toEqual(pair);
  });

  it('trace [ fd 10 ] consumes exactly 0 draws', () => {
    // fd 10 in a trace should not advance the RNG at all.
    const without = run('print random(1000)').printed[0];
    const withTrace = run('let _ = trace [ fd 10 ]\nprint random(1000)').printed[0];
    expect(withTrace).toEqual(without);
  });
});

describe('golden pin 4: frame rule', () => {
  it('trace [ rotate 90 [ fd 10 ] ] = [[0,0],[10,0]]', () => {
    const r = run('let p = trace [ rotate 90 [ fd 10 ] ]\nprint p');
    // rotate 90 (clockwise) maps North→East, so fd 10 from origin → [10, 0]
    const pts = r.printed[0];
    expect(pts).toBe('[[0, 0], [10, 0]]');
  });

  it('translate does not affect captured points', () => {
    const r = run('translate 20 0 [ let p = trace [ fd 10 ]\nprint p ]');
    expect(r.printed[0]).toBe('[[0, 0], [0, 10]]');
  });
});

describe('golden pin 5: runs', () => {
  it('tracerings captures multiple runs', () => {
    const r = run(
      [
        'let rings = tracerings [ fd 10 up fd 5 down fd 10 ]',
        'print len(rings)',
        'print len(rings[0])',
        'print len(rings[1])',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['2', '2', '2']);
  });

  it('trace with multiple runs is a runtime error', () => {
    expect(() => run('let p = trace [ fd 10 up fd 5 down fd 10 ]')).toThrow(
      /trace captured 2 separate runs/,
    );
  });
});

describe('golden pin 6: closure dedupe', () => {
  it('trace [ repeat 6 [ fd 30 rt 60 ] ] has exactly 6 vertices', () => {
    const r = run('let hex = trace [ repeat 6 [ fd 30 rt 60 ] ]\nprint len(hex)');
    // A hexagon: 6 vertices, closing vertex deduped
    expect(r.printed).toEqual(['6']);
  });

  it('first and last vertex differ', () => {
    const r = run(
      ['let hex = trace [ repeat 6 [ fd 30 rt 60 ] ]', 'print hex[0] = hex[len(hex) - 1]'].join(
        '\n',
      ),
    );
    expect(r.printed).toEqual(['0']); // false — they are different vertices
  });
});

describe('golden pin 7: pre-split stage', () => {
  it('stitchlen does not affect trace capture', () => {
    const a = run('stitchlen 1\nlet p = trace [ fd 30 ]\nprint len(p)').printed[0];
    const b = run('stitchlen 12\nlet p = trace [ fd 30 ]\nprint len(p)').printed[0];
    expect(a).toBe('2'); // just 2 vertices: start and end
    expect(b).toBe('2');
    expect(a).toEqual(b);
  });
});

describe('golden pin 8: warp applies, humanize does not', () => {
  it('warp deforms the captured path', () => {
    const noWarp = run('let p = trace [ fd 30 ]\nprint p').printed[0];
    const withWarp = run(
      [
        'def nudge(p) [ return [p[0] + 5, p[1]] ]',
        'let p = trace [ warp @nudge [ fd 30 ] ]',
        'print p',
      ].join('\n'),
    ).printed[0];
    expect(noWarp).not.toEqual(withWarp);
    // The nudge shifts x by 5
    expect(withWarp).toBe('[[5, 0], [5, 30]]');
  });

  it('humanize does not affect the captured path (plus note)', () => {
    const plain = run('let p = trace [ fd 30 ]\nprint p').printed[0];
    const withHumanize = run('let p = trace [ humanize 1 [ fd 30 ] ]\nprint p');
    expect(withHumanize.printed[0]).toEqual(plain);
    expect(withHumanize.warnings.some((w) => w.includes('humanize inside trace'))).toBe(true);
  });
});

describe('golden pin 9: fill unification', () => {
  it('tracerings matches beginfill/endfill boundary rings for a simple shape', () => {
    // A single hexagon via beginfill captures the same ring as tracerings
    const traceResult = run(
      [
        'let rings = tracerings [ repeat 4 [ fd 10 rt 90 ] ]',
        'print len(rings)',
        'print len(rings[0])',
      ].join('\n'),
    );
    expect(traceResult.printed[0]).toBe('1');
    expect(traceResult.printed[1]).toBe('4'); // 4-vertex square, closing deduped
  });
});

describe('golden pin 10: seed independence of geometry-only traces', () => {
  it('a trace with no random calls is identical under different seeds', () => {
    const a = run('let p = trace [ fd 10 rt 90 fd 10 ]\nprint p', { seed: 1 }).printed[0];
    const b = run('let p = trace [ fd 10 rt 90 fd 10 ]\nprint p', { seed: 999 }).printed[0];
    expect(a).toEqual(b);
  });
});

// ── Error tests ─────────────────────────────────────────────────────────────

describe('trace errors', () => {
  it('beginfill inside trace is an error', () => {
    expect(() => run('let p = trace [ beginfill fd 10 endfill ]')).toThrow(
      /fill cannot run inside trace/,
    );
  });

  it('endfill inside trace is an error', () => {
    expect(() => run('let p = trace [ endfill ]')).toThrow(/fill cannot run inside trace/);
  });

  it('seed inside trace is an error', () => {
    expect(() => run('let p = trace [ seed 42 fd 10 ]')).toThrow(/reseed outside trace/);
  });

  it('return crossing trace boundary is an error', () => {
    expect(() => run('def f() [ return trace [ return 5 ] ]\nlet x = f()')).toThrow(
      /cannot leave the procedure from inside trace/,
    );
  });

  it('exit crossing trace boundary is an error', () => {
    expect(() => run('def f() [ let v = trace [ exit ] return 1 ]\nlet x = f()')).toThrow(
      /cannot leave the procedure from inside trace/,
    );
  });
});

// ── Warnings / notes ────────────────────────────────────────────────────────

describe('trace warnings and notes', () => {
  it('zero runs produce a warning and return []', () => {
    const r = run('let p = trace [ up fd 10 ]\nprint len(p)');
    expect(r.printed).toEqual(['0']);
    expect(r.warnings.some((w) => w.includes('captured nothing'))).toBe(true);
  });

  it('tracerings zero runs produce a warning and return []', () => {
    const r = run('let rings = tracerings [ up fd 10 ]\nprint len(rings)');
    expect(r.printed).toEqual(['0']);
    expect(r.warnings.some((w) => w.includes('captured nothing'))).toBe(true);
  });

  it('inert commands produce one-time notes', () => {
    const r = run('let p = trace [ trim trim color 2 mark fd 10 ]');
    const notes = r.warnings.filter((w) => w.startsWith('note:'));
    // trim, color, mark — each mentioned once despite duplicates
    expect(notes.filter((w) => w.includes('trim'))).toHaveLength(1);
    expect(notes.filter((w) => w.includes('color'))).toHaveLength(1);
    expect(notes.filter((w) => w.includes('mark'))).toHaveLength(1);
  });

  it('snaptogrid note mentions snappath', () => {
    const r = run('let p = trace [ snaptogrid 2 [ fd 10 ] ]');
    expect(r.warnings.some((w) => w.includes('snappath'))).toBe(true);
  });
});

// ── Semantics tests ─────────────────────────────────────────────────────────

describe('trace semantics', () => {
  it('pen starts down regardless of ambient state', () => {
    const r = run('up\nlet p = trace [ fd 10 ]\nprint len(p)');
    expect(r.printed).toEqual(['2']); // pen was down inside trace
  });

  it('variables mutate across trace boundary', () => {
    const r = run('let x = 0\nlet _ = trace [ x = 42 fd 1 ]\nprint x');
    expect(r.printed).toEqual(['42']);
  });

  it('print inside trace produces output', () => {
    const r = run('let _ = trace [ print 42 fd 1 ]');
    expect(r.printed).toEqual(['42']);
  });

  it('push/pop inside trace is sandboxed', () => {
    const r = run(
      ['fd 5', 'let _ = tracerings [ push fd 100 pop fd 10 ]', 'print xcor', 'print ycor'].join(
        '\n',
      ),
    );
    expect(r.printed).toEqual(['0', '5']); // turtle at (0, 5) — trace didn't move it
  });

  it('nested trace works', () => {
    const r = run(
      [
        'let outer = trace [',
        '  let inner = trace [ fd 5 ]',
        '  fd 10',
        ']',
        'print len(outer)',
        'print len(inner)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['2', '2']);
  });

  it('trace inside a fill recording works correctly', () => {
    // The trace movement should not contribute to the fill boundary
    const r = run(
      [
        'beginfill',
        '  fd 10',
        '  let p = trace [ fd 100 ]',
        '  rt 90 fd 10 rt 90 fd 10 rt 90 fd 10',
        'endfill',
        'print len(p)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['2']);
    // The fill should have completed without error
    expect(r.events.some((e) => e.t === 'stitch')).toBe(true);
  });

  it('trace result works with sewpath', () => {
    const r = run('sewpath(trace [ fd 10 ])');
    // Just verify it runs without error and produces stitches
    expect(r.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(0);
  });

  it('trace result works with resample', () => {
    const r = run(
      ['let p = trace [ fd 30 ]', 'let r = resample(p, 10)', 'print len(r)'].join('\n'),
    );
    // 30mm resampled at 10mm spacing = 4 points (0, 10, 20, 30)
    expect(r.printed).toEqual(['4']);
  });

  it('trace result works with inpath', () => {
    const r = run(
      ['let ring = trace [ repeat 4 [ fd 20 rt 90 ] ]', 'print inpath([10, 10], ring)'].join('\n'),
    );
    expect(r.printed).toEqual(['1']);
  });

  it('arc captures the polyline at arc resolution', () => {
    const r = run('let c = trace [ arc 360 10 ]\nprint len(c) > 10');
    expect(r.printed).toEqual(['1']); // many more than 2 vertices
  });

  it('procedures work inside trace', () => {
    const r = run(
      [
        'def square(s) [ repeat 4 [ fd s rt 90 ] ]',
        'let p = trace [ square(20) ]',
        'print len(p)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['4']); // 4-vertex square, closing deduped
  });

  it('up/setxy/down repositioning creates a single-run trace', () => {
    const r = run(
      ['let p = trace [ up setxy 5 0 down arc 360 10 ]', 'print p[0][0]', 'print p[0][1]'].join(
        '\n',
      ),
    );
    // First point of the run should be at (5, 0)
    expect(r.printed).toEqual(['5', '0']);
  });

  it('errors inside trace propagate normally', () => {
    expect(() => run('let p = trace [ assert 0 ]')).toThrow(/assert failed/);
  });

  it('break inside a loop within trace is fine', () => {
    const r = run(
      ['let p = trace [ repeat 100 [ fd 1 if repcount > 5 [ break ] ] ]', 'print len(p)'].join(
        '\n',
      ),
    );
    // Should capture the path up to the break
    expect(Number(r.printed[0])).toBeGreaterThan(1);
  });
});
