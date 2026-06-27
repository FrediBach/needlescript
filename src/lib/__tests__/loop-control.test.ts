import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';

// ── Loop control: break / continue (RFC-4) ──────────────────────────────────
//
// The RFC-4 test matrix. break ends the innermost enclosing loop; continue
// skips to its next iteration. Both are lexical (parse-time validated, like
// output/exit) and invisible to the stitch machine.

const printed = (src: string) => run(src).printed;

// ── 1. every loop form ───────────────────────────────────────────────────────
describe('break and continue in each loop form', () => {
  it('repeat — break ends the loop, repcount advances across continue', () => {
    expect(printed('repeat 5 [ if repcount = 3 [ break ] print repcount ]')).toEqual(['1', '2']);
    expect(printed('repeat 5 [ if repcount % 2 = 0 [ continue ] print repcount ]')).toEqual([
      '1',
      '3',
      '5',
    ]);
  });

  it('while — break stops, continue re-evaluates the condition', () => {
    expect(
      printed('make "i 0 while :i < 10 [ make "i :i + 1 if :i = 4 [ break ] ] print :i'),
    ).toEqual(['4']);
    expect(
      printed('make "i 0 while :i < 6 [ make "i :i + 1 if :i % 2 = 0 [ continue ] print :i ]'),
    ).toEqual(['1', '3', '5']);
  });

  it('keyword for — break, and continue applies the step', () => {
    expect(printed('for i = 1 to 10 [ if i = 4 [ break ] print i ]')).toEqual(['1', '2', '3']);
    expect(printed('for i = 1 to 5 [ if i % 2 == 0 [ continue ] print i ]')).toEqual([
      '1',
      '3',
      '5',
    ]);
  });

  it('keyword for — continue applies a negative step too', () => {
    expect(printed('for i = 5 to 1 step -2 [ if i = 3 [ continue ] print i ]')).toEqual(['5', '1']);
    expect(printed('for i = 10 to 1 step -3 [ if i < 5 [ break ] print i ]')).toEqual(['10', '7']);
  });

  it('classic for — both spellings behave identically', () => {
    expect(printed('for "i 1 5 1 [ if :i = 3 [ break ] print :i ]')).toEqual(['1', '2']);
    expect(printed('for "i 1 5 1 [ if :i = 3 [ continue ] print :i ]')).toEqual([
      '1',
      '2',
      '4',
      '5',
    ]);
  });

  it('for … in — break and continue over list elements', () => {
    expect(printed('for x in [1, 2, 3, 4] [ if x = 3 [ break ] print x ]')).toEqual(['1', '2']);
    expect(printed('for x in [1, 2, 3, 4] [ if x = 2 [ continue ] print x ]')).toEqual([
      '1',
      '3',
      '4',
    ]);
  });

  it('loop variables still do not leak after a break', () => {
    expect(() => run('for i = 1 to 5 [ break ] print i')).toThrow(/never assigned on this path/);
    expect(() => run('for x in [1, 2] [ break ] print x')).toThrow(/never assigned on this path/);
  });
});

// ── 2. innermost-only ────────────────────────────────────────────────────────
describe('break is innermost-only', () => {
  it('break in the inner loop leaves the outer loop running', () => {
    expect(printed('repeat 3 [ repeat 5 [ if repcount = 2 [ break ] print repcount ] ]')).toEqual([
      '1',
      '1',
      '1',
    ]);
  });

  it('outer repcount is correct again after an inner break', () => {
    expect(printed('repeat 3 [ repeat 5 [ break ] print repcount ]')).toEqual(['1', '2', '3']);
  });

  it('continue in the inner loop does not skip outer iterations', () => {
    expect(printed('repeat 2 [ repeat 3 [ continue ] print repcount ]')).toEqual(['1', '2']);
  });
});

// ── 3. through if/else nesting and beginfill ─────────────────────────────────
describe('break/continue through nested blocks', () => {
  it('works through nested if blocks', () => {
    expect(printed('repeat 5 [ if repcount > 2 [ if 1 [ break ] ] print repcount ]')).toEqual([
      '1',
      '2',
    ]);
  });

  it('works in else and else-if branches', () => {
    expect(
      printed(
        'repeat 5 [ if repcount = 1 [ print 1 ] else if repcount = 3 [ break ] else [ print repcount ] ]',
      ),
    ).toEqual(['1', '2']);
    expect(printed('repeat 4 [ if repcount < 3 [ continue ] else [ print repcount ] ]')).toEqual([
      '3',
      '4',
    ]);
  });

  it('works inside beginfill … endfill within a loop', () => {
    const out = run(
      [
        'up setxy -10 -10 down',
        'beginfill',
        'repeat 10 [ fd 20 rt 90 if repcount = 4 [ break ] ]',
        'endfill',
      ].join('\n'),
    );
    expect(out.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(0);
  });

  it('break in a loop wrapping a complete fill leaves the fill intact', () => {
    const broken = run(
      'repeat 3 [ up setxy -10 -10 down beginfill repeat 4 [ fd 12 rt 90 ] endfill if repcount = 1 [ break ] ]',
    );
    const single = run('up setxy -10 -10 down beginfill repeat 4 [ fd 12 rt 90 ] endfill');
    expect(broken.events).toEqual(single.events);
  });
});

// ── 4. parse errors (lexical validation) ─────────────────────────────────────
describe('break/continue parse errors', () => {
  it('are errors at the top level, outside any loop', () => {
    expect(() => run('break')).toThrow(/"break" can only be used inside a loop/);
    expect(() => run('continue')).toThrow(/"continue" can only be used inside a loop/);
    expect(() => run('if 1 [ break ]')).toThrow(/inside a loop/);
  });

  it('a REPL-appended bare break errors; an appended loop with break works', () => {
    expect(() => run('repeat 3 [ fd 1 ]\nbreak')).toThrow(/inside a loop/);
    expect(printed('fd 1\nrepeat 9 [ if repcount > 2 [ break ] print repcount ]')).toEqual([
      '1',
      '2',
    ]);
  });

  it('break is lexical: a procedure called from a loop is not "inside" it', () => {
    expect(() => run('def helper() [ break ] repeat 3 [ helper() ]')).toThrow(
      /the loop is in the caller/,
    );
    expect(() => run('to helper break end repeat 3 [ helper ]')).toThrow(
      /use return \(or exit\/output\) to leave the procedure/,
    );
  });

  it('a loop inside the procedure makes them valid again', () => {
    expect(
      printed('def f() [ repeat 5 [ if repcount = 2 [ break ] print repcount ] ] f()'),
    ).toEqual(['1']);
  });

  it('break/continue are reserved words with loud definition-time errors', () => {
    expect(() => run('to break fd 1 end')).toThrow(/can't be redefined/);
    expect(() => run('def continue() [ fd 1 ]')).toThrow(/can't be redefined/);
    expect(() => run('let break = 1')).toThrow(/reserved word/);
    expect(() => run('make "continue 1')).toThrow(/reserved word/);
  });
});

// ── 5. while true [ … break ] ────────────────────────────────────────────────
describe('the while-true search idiom', () => {
  it('while true [ … break ] is the sanctioned search loop', () => {
    expect(printed('make "i 0 while true [ make "i :i + 1 if :i = 7 [ break ] ] print :i')).toEqual(
      ['7'],
    );
  });

  it('the op budget still catches while true without a break', () => {
    expect(() => run('while true [ make "x 1 ]')).toThrow(/ran too long/);
  });
});

// ── 6. interaction with the procedure-level transfers ────────────────────────
describe('break vs exit/return', () => {
  it('exit inside a loop leaves the whole procedure, not just the loop', () => {
    expect(
      printed('to f repeat 10 [ if repcount = 3 [ exit ] print repcount ] print 99 end f'),
    ).toEqual(['1', '2']);
  });

  it('return e inside a loop in a reporter returns the value', () => {
    expect(
      printed('def f() [ for i = 1 to 10 [ if i == 4 [ return i * 10 ] ] return 0 ] print f()'),
    ).toEqual(['40']);
  });
});

// ── 7. loop control is invisible to the stitch machine ───────────────────────
describe('satin buffering across break', () => {
  it('a buffered satin column survives a break and flushes on the pen change', () => {
    const withBreak = run('lock 0 satin 3 repeat 10 [ fd 1 if repcount = 5 [ break ] ] up fd 5');
    const plain = run('lock 0 satin 3 repeat 5 [ fd 1 ] up fd 5');
    expect(withBreak.events).toEqual(plain.events);
    expect(withBreak.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(0);
  });
});

// ── 8. edge cases ────────────────────────────────────────────────────────────
describe('loop-control edge cases', () => {
  it('continue as the last statement of a body is a no-op', () => {
    expect(printed('repeat 3 [ print repcount continue ]')).toEqual(['1', '2', '3']);
  });

  it('break in a for … in over a list being mutated (length-at-entry holds)', () => {
    expect(
      printed(
        [
          'let xs = [1, 2, 3]',
          'for x in xs [ append(xs, 9) if x = 2 [ break ] print x ]',
          'print len(xs)',
        ].join('\n'),
      ),
    ).toEqual(['1', '5']);
  });

  it('break under the iteration cap still counts ops normally', () => {
    // 200,000-iteration loops are legal; break makes them cheap.
    expect(printed('for i = 1 to 200000 [ if i = 3 [ break ] ] print 1')).toEqual(['1']);
  });
});

// ── single-quote reservation (RFC-4 §4, closing RFC-1 Q4) ───────────────────
describe("the ' character", () => {
  it('is reserved with a forward-looking error', () => {
    expect(() => run("print 'hi'")).toThrow(
      /single-quote strings are reserved for a future version/,
    );
    expect(() => run("fd 10 ' rt 90")).toThrow(/reserved for a future version/);
  });
});
