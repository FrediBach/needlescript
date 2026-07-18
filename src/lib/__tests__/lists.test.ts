// ---------- Lists (RFC-2) test matrix ----------
//
// Lists are a second runtime value type: mutable, reference semantics,
// holding numbers and other lists. They never reach the event stream —
// every pre-RFC-2 program produces byte-identical events (the existing
// suites double as that regression guarantee).

import { describe, it, expect } from 'vitest';
import { run, NeedlescriptError, LIMITS } from '../engine.ts';

const printed = (src: string) => run(src).printed;

/** Assert two programs are behaviourally identical. */
function expectEquivalent(a: string, b: string) {
  const ra = run(a);
  const rb = run(b);
  expect(ra.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }))).toEqual(
    rb.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u })),
  );
  expect(ra.printed).toEqual(rb.printed);
}

// ── 1–5: the `[` disambiguation rule (the dangerous part) ────────────────────
describe('[ disambiguation (test #1–5)', () => {
  it('legacy block forms are frozen (test #1)', () => {
    expectEquivalent('repeat 4 [ fd 10 ]', 'repeat 4[fd 10]');
    expectEquivalent('make "n 4 repeat :n[fd 10]', 'repeat 4 [ fd 10 ]');
    expectEquivalent('make "a 1 if :a = 1[fd 5]', 'fd 5');
  });

  it('glued [ after a modern bare ident in a header errors with the add-a-space hint (test #2)', () => {
    expect(() => run('let n = 2 repeat n[0]')).toThrow(
      /"\[" glued to "n" reads as indexing — add a space before the block/,
    );
    expect(() => run('let n = 2 repeat n[ fd 10 ]')).toThrow(
      /reads as indexing — add a space before the block/,
    );
  });

  it('spaced [ after a variable in statement position suggests gluing (test #2)', () => {
    expect(() => run('let xs = [1] xs [0]')).toThrow(/to index "xs", glue the bracket to the name/);
  });

  it('nested literals, trailing comma, [] and missing commas (test #3)', () => {
    expect(printed('let a = [1, [2, 3],] print a')).toEqual(['[1, [2, 3]]']);
    expect(printed('print len([])')).toEqual(['0']);
    expect(printed('print []')).toEqual(['[]']);
    expect(() => run('let a = [1 2]')).toThrow(
      /Expected , or \] in a list.*separate elements with commas/,
    );
  });

  it('index chains: pos()[i], grid[i][j], literal[i] (test #4)', () => {
    expect(printed('up setxy 7 9 print pos()[0] print pos()[1]')).toEqual(['7', '9']);
    expect(printed('let grid = [[1, 2], [3, 4]] let i = 1 let j = 0 print grid[i][j]')).toEqual([
      '3',
    ]);
    expect(printed('print [10, 20][1]')).toEqual(['20']);
  });

  it('a list literal can not be a statement (test #5)', () => {
    expect(() => run('[1, 2]')).toThrow(/a list literal can't be a statement/);
  });

  it('indexing the result of an index parses; calling it is a runtime error', () => {
    expect(printed('let xs = [[1, 2]] print xs[0][1]')).toEqual(['2']);
    expect(() => run('let xs = [[1]] print xs[0](2)')).toThrow(
      /a list value can't be called like a procedure/,
    );
  });
});

// ── 6: aliasing, copying, equality ───────────────────────────────────────────
describe('reference semantics and equality (test #6)', () => {
  it('assignment shares the list; copy() does not', () => {
    expect(printed('let a = [1, 2, 3] let b = a b[0] = 9 print a')).toEqual(['[9, 2, 3]']);
    expect(printed('let a = [1, [2]] let c = copy(a) c[1][0] = 9 print a print c')).toEqual([
      '[1, [2]]',
      '[1, [9]]',
    ]);
  });

  it('concat is shallow: elements are shared references', () => {
    expect(printed('let a = [[1]] let c = concat(a, [[2]]) a[0][0] = 7 print c')).toEqual([
      '[[7], [2]]',
    ]);
  });

  it('deep == with the 1e-9 tolerance', () => {
    expect(printed('print [1, 2] = [1, 2.0000000001]')).toEqual(['1']);
    expect(printed('print [1, [2, 3]] == [1, [2, 3]]')).toEqual(['1']);
    expect(printed('print [1, 2] != [1, 3]')).toEqual(['1']);
    expect(printed('print [1, 2] = [1, 2, 3]')).toEqual(['0']);
  });

  it('mixed number/list == is 0, not an error', () => {
    expect(printed('print [1, 2] = 5')).toEqual(['0']);
    expect(printed('print 5 != [1, 2]')).toEqual(['1']);
  });

  it('ordering with a list on either side errors', () => {
    expect(() => run('print [1] < 2')).toThrow(/"<" expected a number.*on the left/);
    expect(() => run('print 2 >= [1]')).toThrow(/">=" expected a number.*on the right/);
  });
});

// ── 7: truthiness ────────────────────────────────────────────────────────────
describe('truthiness errors (test #7)', () => {
  it('a list in a condition errors with the len() hint', () => {
    expect(() => run('let xs = [1] if xs [ fd 1 ]')).toThrow(/use len\(xs\) > 0/);
    expect(() => run('let xs = [1] while xs [ fd 1 ]')).toThrow(/use len\(xs\) > 0/);
    expect(() => run('let xs = [1] print !xs')).toThrow(/use len\(xs\) > 0/);
    expect(() => run('let xs = [1] print xs and 1')).toThrow(/use len\(xs\) > 0/);
    expect(() => run('let xs = [1] assert xs')).toThrow(/use len\(xs\) > 0/);
  });
});

// ── 8: indexing edges ────────────────────────────────────────────────────────
describe('indexing (test #8)', () => {
  it('0-based, negatives count from the end', () => {
    expect(printed('let xs = [4, 5, 6] print xs[0] print xs[-1] print xs[-3]')).toEqual([
      '4',
      '6',
      '4',
    ]);
  });

  it('out of range errors in both directions, with index and length', () => {
    expect(() => run('print [1, 2, 3][3]')).toThrow(/index 3 is out of range/);
    expect(() => run('print [1, 2, 3][-4]')).toThrow(/out of range/);
    expect(() => run('print [][0]')).toThrow(/out of range/);
  });

  it('non-integer index errors; near-integer float dust is accepted', () => {
    expect(() => run('print [1, 2][1.5]')).toThrow(
      /index 1.5 isn't a whole number — use floor\(\) deliberately/,
    );
    expect(printed('print [4, 5, 6][0.9999999999]')).toEqual(['5']);
    expect(printed('print [4, 5, 6][3 / 1 - 1]')).toEqual(['6']);
  });

  it('indexing a number errors', () => {
    expect(() => run('let x = 5 print x[0]')).toThrow(/only lists and strings can be indexed/);
  });

  it('index assignment and compound chains', () => {
    expect(printed('let xs = [1, 2] xs[0] = 5 print xs')).toEqual(['[5, 2]']);
    expect(printed('let g = [[0, 1], [2, 3]] g[1][0] += 10 print g')).toEqual([
      '[[0, 1], [12, 3]]',
    ]);
    expect(printed('let xs = [8] xs[0] /= 2 xs[0] *= 3 xs[0] -= 2 print xs')).toEqual(['[10]']);
  });
});

// ── 9: destructuring ─────────────────────────────────────────────────────────
describe('destructuring (test #9)', () => {
  it('let [x, y] = p binds elements', () => {
    expect(printed('let [x, y] = [3, 4] print x print y')).toEqual(['3', '4']);
    expect(printed('up setxy 5 6 let [x, y] = pos() print x + y')).toEqual(['11']);
  });

  it('length mismatch errors', () => {
    expect(() => run('let [x, y] = [1, 2, 3]')).toThrow(/expected a list of 2, got 3/);
    expect(() => run('let [x, y] = 5')).toThrow(/expected a list, got a number/);
  });

  it('destructured names collide like any let', () => {
    expect(() => run('let x = 1 let [x, y] = [1, 2]')).toThrow(/already declared/);
    expect(() => run('let [x, x] = [1, 2]')).toThrow(/already declared/);
  });
});

// ── 10: for-in ───────────────────────────────────────────────────────────────
describe('for-in (test #10)', () => {
  it('iterates elements in order', () => {
    expect(printed('for x in [3, 1, 2] [ print x ]')).toEqual(['3', '1', '2']);
  });

  it('length is captured at loop entry — appending does not extend the loop', () => {
    expect(printed('let xs = [1, 2] for x in xs [ print x append(xs, 9) ] print len(xs)')).toEqual([
      '1',
      '2',
      '4',
    ]);
  });

  it('elements are read live — mutating an unreached element is visible', () => {
    expect(printed('let xs = [1, 2, 3] for x in xs [ print x if x = 1 [ xs[2] = 99 ] ]')).toEqual([
      '1',
      '2',
      '99',
    ]);
  });

  it('the loop variable does not leak', () => {
    expect(() => run('for x in [1] [ fd 1 ] print x')).toThrow(/never assigned on this path/);
  });

  it('a non-list errors', () => {
    expect(() => run('for x in 5 [ fd 1 ]')).toThrow(/expected a list or string, got/);
  });

  it('works over nested elements with destructuring', () => {
    expect(printed('for p in [[1, 2], [3, 4]] [ let [x, y] = p print x * y ]')).toEqual([
      '2',
      '12',
    ]);
  });
});

// ── 11: builtins ─────────────────────────────────────────────────────────────
describe('builtins (test #11)', () => {
  it('range', () => {
    expect(printed('print range(3)')).toEqual(['[0, 1, 2]']);
    expect(printed('print range(2, 5)')).toEqual(['[2, 3, 4]']);
    expect(printed('print range(5, 2, -1)')).toEqual(['[5, 4, 3]']);
    expect(printed('print range(0, 10, 3)')).toEqual(['[0, 3, 6, 9]']);
    expect(printed('print range(5, 2)')).toEqual(['[]']);
    expect(() => run('print range(0, 1, 0)')).toThrow(/range step can't be 0/);
  });

  it('filled makes deep copies', () => {
    expect(printed('print filled(3, 7)')).toEqual(['[7, 7, 7]']);
    expect(printed('let g = filled(2, [0]) g[0][0] = 9 print g')).toEqual(['[[9], [0]]']);
    expect(() => run('print filled(1.5, 0)')).toThrow(/whole number/);
  });

  it('len, islist, first, last', () => {
    expect(printed('print len([4, 5]) print islist([]) print islist(3)')).toEqual(['2', '1', '0']);
    expect(printed('print first([4, 5]) print last([4, 5])')).toEqual(['4', '5']);
    expect(() => run('print first([])')).toThrow(/first of an empty list/);
    expect(() => run('print last([])')).toThrow(/last of an empty list/);
  });

  it('mutators: append, prepend, insertat, removeat', () => {
    expect(printed('let xs = [2] append(xs, 3) prepend(xs, 1) print xs')).toEqual(['[1, 2, 3]']);
    expect(printed('let xs = [1, 3] insertat(xs, 1, 2) insertat(xs, 3, 4) print xs')).toEqual([
      '[1, 2, 3, 4]',
    ]);
    expect(() => run('let xs = [1] insertat(xs, 3, 0)')).toThrow(
      /insertat: index 3 is out of range \(0…1 allowed\)/,
    );
    expect(printed('let xs = [5, 6, 7] let v = removeat(xs, 1) print v print xs')).toEqual([
      '6',
      '[5, 7]',
    ]);
    expect(printed('let xs = [1, 2] removeat(xs, 0) print xs')).toEqual(['[2]']);
    expect(() => run('let xs = [] removeat(xs, 0)')).toThrow(/out of range/);
  });

  it('slice: Python semantics, negatives, clamped', () => {
    expect(printed('print slice([1, 2, 3], 1)')).toEqual(['[2, 3]']);
    expect(printed('print slice([1, 2, 3], 0, 2)')).toEqual(['[1, 2]']);
    expect(printed('print slice([1, 2, 3], -2, -1)')).toEqual(['[2]']);
    expect(printed('print slice([1, 2, 3], -10, 99)')).toEqual(['[1, 2, 3]']);
    expect(printed('print slice([1, 2, 3], 2, 1)')).toEqual(['[]']);
  });

  it('reverse and sort are pure (new lists)', () => {
    expect(printed('let xs = [3, 1, 2] print sort(xs) print reverse(xs) print xs')).toEqual([
      '[1, 2, 3]',
      '[2, 1, 3]',
      '[3, 1, 2]',
    ]);
    expect(() => run('print sort([1, [2]])')).toThrow(
      /sort can only sort numbers — element 1 is a list/,
    );
  });

  it('indexof and contains use deep, tolerant comparison', () => {
    expect(printed('print indexof([1, 2], 2.0000000001)')).toEqual(['1']);
    expect(printed('print indexof([[1], [2]], [2]) print indexof([1], 9)')).toEqual(['1', '-1']);
    expect(printed('print contains([1, [2, 3]], [2, 3]) print contains([], 1)')).toEqual([
      '1',
      '0',
    ]);
  });

  it('aggregates: sum([]) is 0, the rest error on empty', () => {
    expect(
      printed('print sum([1, 2, 3]) print mean([2, 4]) print minof([3, 1]) print maxof([3, 9])'),
    ).toEqual(['6', '3', '1', '9']);
    expect(printed('print sum([])')).toEqual(['0']);
    expect(() => run('print mean([])')).toThrow(/mean of an empty list/);
    expect(() => run('print minof([])')).toThrow(/minof of an empty list/);
    expect(() => run('print maxof([])')).toThrow(/maxof of an empty list/);
    expect(() => run('print sum([1, [2]])')).toThrow(/"sum" expected a number/);
  });

  it('pos()/setpos(p) make record/replay symmetric', () => {
    expectEquivalent('up setpos([10, 20]) down fd 5', 'up setxy 10 20 down fd 5');
    expect(() => run('setpos([1])')).toThrow(/setpos expected \[x, y\]/);
    expect(() => run('setpos(5)')).toThrow(/"setpos" expected a list/);
  });

  it('print caps long lists at 64 elements', () => {
    const out = printed('print range(70)')[0];
    expect(out).toContain('63');
    expect(out).toContain('… +6 more');
    expect(out).not.toContain('64,');
  });

  it('list builtins are glued-call only', () => {
    expect(() => run('let xs = [1] print len xs')).toThrow(/need call syntax/);
    expect(() => run('let xs = [1] append xs 5')).toThrow(/need call syntax/);
  });

  it('push stays the turtle stack; the arity error hints at append', () => {
    expect(() => run('let xs = [] push(xs, 1)')).toThrow(
      /to add a value to a list, use append\(xs, v\)/,
    );
  });
});

// ── 12: determinism ──────────────────────────────────────────────────────────
describe('seeded pick and shuffle (test #12)', () => {
  it('same seed, same result — forever', () => {
    const a = printed('seed 7 print pick([10, 20, 30, 40]) print shuffle([1, 2, 3, 4, 5])');
    const b = printed('seed 7 print pick([10, 20, 30, 40]) print shuffle([1, 2, 3, 4, 5])');
    expect(a).toEqual(b);
  });

  it('pick is exactly one RNG draw', () => {
    // pick over [0..3] is floor of the same single draw random(4) consumes
    expectEquivalent(
      'seed 9 print pick([0, 1, 2, 3]) print random(1000)',
      'seed 9 print floor(random(4)) print random(1000)',
    );
  });

  it('shuffle is exactly one main-stream draw (fork convention, RFC-3 §7)', () => {
    // Inserting a shuffle shifts downstream randomness by exactly one draw,
    // same as inserting a random — regardless of the list's length.
    expectEquivalent(
      'seed 3 let s = shuffle([1, 2, 3, 4]) print random(1000)',
      'seed 3 let z = random(1) print random(1000)',
    );
    expectEquivalent(
      'seed 5 let s = shuffle(range(100)) print random(1000)',
      'seed 5 let s = shuffle([1, 2]) print random(1000)',
    );
  });

  it('a shuffle actually permutes deterministically', () => {
    const out = printed('seed 1 print sort(shuffle([3, 1, 2]))');
    expect(out).toEqual(['[1, 2, 3]']);
  });
});

// ── 13: type guards ──────────────────────────────────────────────────────────
describe('type guards (test #13)', () => {
  it('commands reject lists, naming the command', () => {
    expect(() => run('fd [1, 2]')).toThrow(/"fd" expected a number, got a list \(length 2\)/);
    expect(() => run('color [1]')).toThrow(/"color" expected a number/);
  });

  it('arithmetic rejects lists, with hints at the vector functions (RFC-3 §2)', () => {
    expect(() => run('print [1] + 1')).toThrow(
      /"\+" on lists — use vadd\(a, b\) for element-wise, concat\(a, b\) to join/,
    );
    expect(() => run('print 1 - [1, 2, 3]')).toThrow(
      /"-" on lists — use vsub\(a, b\) for element-wise/,
    );
    expect(() => run('print [1, 2] * 2')).toThrow(
      /"\*" on lists — use vscale\(a, s\) to scale a point/,
    );
    expect(() => run('let xs = [1] print -xs')).toThrow(/"-" expected a number/);
  });

  it('scalar functions reject lists, naming the function', () => {
    expect(() => run('print sin([])')).toThrow(/"sin" expected a number, got a list \(length 0\)/);
    expect(() => run('print sqrt([4])')).toThrow(/"sqrt" expected a number/);
  });

  it('list functions reject numbers', () => {
    expect(() => run('print len(5)')).toThrow(/"len" expected a list, got a number/);
    expect(() => run('for x in [1] [ fd x ] print sum(3)')).toThrow(/"sum" expected a list/);
  });
});

// ── 14: limits ───────────────────────────────────────────────────────────────
describe('limits (test #14)', () => {
  it('max list length 100,000', () => {
    expect(() => run('let xs = range(100001)')).toThrow(/List too long/);
    expect(() => run('let xs = filled(100001, 0)')).toThrow(/List too long/);
  });

  it('max total live cells 1,000,000', () => {
    expect(() => run('repeat 11 [ let xs = filled(100000, 0) ]')).toThrow(/Too many list cells/);
  });

  it('max nesting depth 16', () => {
    const deep = '['.repeat(17) + '1' + ']'.repeat(17);
    expect(() => run(`let xs = ${deep}`)).toThrow(/nesting deeper than 16/);
    const ok = '['.repeat(16) + '1' + ']'.repeat(16);
    expect(() => run(`let xs = ${ok}`)).not.toThrow();
    // mutation can't sneak past the cap either
    expect(() =>
      run(`let a = ${'['.repeat(16) + '1' + ']'.repeat(16)} let b = [] append(b, a)`),
    ).toThrow(/nesting deeper than 16/);
  });

  it('element reads count toward the op budget', () => {
    // sum(xs) costs xs.length ops via tickN. Use enough iterations to exceed LIMITS.maxOps.
    const listSize = 50000;
    const iters = Math.ceil(LIMITS.maxOps / listSize) + 10;
    expect(() => run(`let xs = range(${listSize}) repeat ${iters} [ let s = sum(xs) ]`)).toThrow(
      /ran too long/,
    );
  });

  it('a cyclic list errors loudly instead of hanging', () => {
    // append(b, a) then append(a, b) makes a cycle — printing must not hang
    expect(() => run('let a = [] let b = [] append(b, a) append(a, b) print a')).toThrow(
      NeedlescriptError,
    );
  });
});

// ── soft reservation (the regression-keeping policy) ─────────────────────────
describe('soft reservation of list builtin names', () => {
  it('legacy :len parameters still work', () => {
    expect(printed('to branch :len print :len end branch 5')).toEqual(['5']);
  });

  it('a variable may share a builtin name; the builtin wins at call position', () => {
    expect(printed('let len = 5 print len print len([1, 2])')).toEqual(['5', '2']);
  });

  it('a user procedure shadows the builtin at call sites', () => {
    expect(printed('def pick(k) [ return k * 2 ] print pick(3)')).toEqual(['6']);
  });
});

// ── legacy interplay ─────────────────────────────────────────────────────────
describe('legacy syntax meets lists', () => {
  it('make "xs takes a list literal (expression position)', () => {
    expect(printed('make "xs [1, 2] print :xs')).toEqual(['[1, 2]']);
  });

  it(':var reads stay readable but are never index left-context', () => {
    // index through a bare read instead — :xs[0] would read the [0] as a
    // separate (and invalid) statement, because legacy tokens predate indexing
    expect(printed('make "xs [4, 5] print xs[0]')).toEqual(['4']);
    expect(() => run('make "xs [4, 5] print :xs[0]')).toThrow(
      /a list literal can't be a statement/,
    );
  });

  it('procedures pass and return lists', () => {
    expect(
      printed(
        'def mid(a, b) [ return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] ] print mid([0, 0], [4, 6])',
      ),
    ).toEqual(['[2, 3]']);
    expect(printed('def naturals(n) [ return range(n) ] print len(naturals(4))')).toEqual(['4']);
  });
});

// ── lists stay out of the event stream ───────────────────────────────────────
describe('lists never reach the stitch pipeline', () => {
  it('record a path, replay it with setpos — same stitches as direct sewing', () => {
    const recordReplay = `
      let path = []
      up setxy(0, 0) down
      repeat 5 [ fd 3 rt 20 append(path, pos()) ]
      up home down
      for p in path [ setpos(p) ]
    `;
    const r = run(recordReplay);
    expect(r.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(5);
    expect(r.warnings).toEqual(run(recordReplay).warnings);
  });
});

// ── steps() — inclusive numeric sequence ─────────────────────────────────────
describe('steps()', () => {
  it('basic integer steps with default step=1', () => {
    expect(printed('print steps(0, 5)')).toEqual(['[0, 1, 2, 3, 4, 5]']);
  });

  it('custom step', () => {
    const p = printed('print len(steps(0, 6, 0.2))');
    expect(p).toEqual(['31']); // 0, 0.2, 0.4, …, 5.8, 6.0
  });

  it('first and last element are exact', () => {
    const p = printed('let s = steps(0, 6, 0.2) print first(s) print last(s)');
    expect(p).toEqual(['0', '6']);
  });

  it('single element when start == end', () => {
    expect(printed('print steps(3, 3)')).toEqual(['[3]']);
  });

  it('negative step', () => {
    expect(printed('print steps(10, 0, -2)')).toEqual(['[10, 8, 6, 4, 2, 0]']);
  });

  it('direction mismatch yields empty list', () => {
    expect(printed('print steps(5, 0)')).toEqual(['[]']);
    expect(printed('print steps(0, 5, -1)')).toEqual(['[]']);
  });

  it('step = 0 throws', () => {
    expect(() => run('let x = steps(0, 5, 0)')).toThrow(/step can't be 0/);
  });

  it('floating-point edge: steps(0, 1, 0.1) yields 11 elements', () => {
    expect(printed('print len(steps(0, 1, 0.1))')).toEqual(['11']);
  });

  it('steps composes with other list functions', () => {
    expect(printed('print sum(steps(0, 4))')).toEqual(['10']); // 0+1+2+3+4
  });
});

// ── @builtin references ─────────────────────────────────────────────────────
describe('@builtin references', () => {
  it('@sin resolves as a FuncRef', () => {
    // just verify it parses and produces a value (FuncRef prints as @sin)
    expect(printed('print @sin')).toEqual(['@sin/1']);
  });

  it('@log resolves as a FuncRef', () => {
    expect(printed('print @log')).toEqual(['@log/1']);
  });

  it('@vadd resolves as a FuncRef', () => {
    expect(printed('print @vadd')).toEqual(['@vadd/2']);
  });

  it('@vlen resolves as a FuncRef', () => {
    expect(printed('print @vlen')).toEqual(['@vlen/1']);
  });

  it('@fd (command) is rejected at parse time', () => {
    expect(() => run('print @fd')).toThrow(/doesn't return a value/);
  });

  it('@sewpath (gen command) is rejected at parse time', () => {
    expect(() => run('print @sewpath')).toThrow(/doesn't return a value/);
  });

  it('@append (list command) is rejected at parse time', () => {
    expect(() => run('print @append')).toThrow(/doesn't return a value/);
  });

  it('user proc shadows builtin for @ref', () => {
    // vlen is a library-tier builtin that can be shadowed
    expect(printed('def vlen(x) [ return x * 10 ] print map([3], @vlen)')).toEqual(['[30]']);
  });
});

// ── map() ────────────────────────────────────────────────────────────────────
describe('map()', () => {
  it('applies a user-defined function to every element', () => {
    expect(printed('def double(x) [ return x * 2 ] print map([1, 2, 3], @double)')).toEqual([
      '[2, 4, 6]',
    ]);
  });

  it('works with @abs builtin', () => {
    expect(printed('print map([-3, -1, 2], @abs)')).toEqual(['[3, 1, 2]']);
  });

  it('works with @vlen on points', () => {
    const p = printed('print map([[3, 4], [0, 1]], @vlen)');
    expect(p).toEqual(['[5, 1]']);
  });

  it('empty list returns empty list', () => {
    expect(printed('def id(x) [ return x ] print map([], @id)')).toEqual(['[]']);
  });

  it('preserves order', () => {
    expect(printed('def inc(x) [ return x + 1 ] print map([10, 20, 30], @inc)')).toEqual([
      '[11, 21, 31]',
    ]);
  });

  it('rejects non-FuncRef callback', () => {
    expect(() => run('let x = map([1, 2], 5)')).toThrow(/@procedure reference/);
  });

  it('rejects non-list first argument', () => {
    expect(() => run('def f(x) [ return x ] let x = map(42, @f)')).toThrow(/expected a list/);
  });

  it('errors when callback may not return a value (static check)', () => {
    expect(() => run('def noop(x) [ print x ] let x = map([1], @noop)')).toThrow(
      /may finish without returning a value/,
    );
  });

  it('works with steps and builtin ref for a complete pipeline', () => {
    expect(printed('print map(steps(0, 3), @floor)')).toEqual(['[0, 1, 2, 3]']);
  });
});

// ── filter() ─────────────────────────────────────────────────────────────────
describe('filter()', () => {
  it('keeps elements that pass a predicate', () => {
    expect(printed('def big(x) [ return x > 2 ] print filter([1, 2, 3, 4, 5], @big)')).toEqual([
      '[3, 4, 5]',
    ]);
  });

  it('all pass → same elements', () => {
    expect(printed('def yes(x) [ return 1 ] print filter([1, 2, 3], @yes)')).toEqual(['[1, 2, 3]']);
  });

  it('none pass → empty', () => {
    expect(printed('def no(x) [ return 0 ] print filter([1, 2, 3], @no)')).toEqual(['[]']);
  });

  it('empty input → empty output', () => {
    expect(printed('def yes(x) [ return 1 ] print filter([], @yes)')).toEqual(['[]']);
  });

  it('rejects non-FuncRef callback', () => {
    expect(() => run('let x = filter([1, 2], [3, 4])')).toThrow(/@procedure reference/);
  });
});

// ── reduce() ─────────────────────────────────────────────────────────────────
describe('reduce()', () => {
  it('sums numbers with a user-defined add', () => {
    expect(printed('def add(a, b) [ return a + b ] print reduce([1, 2, 3, 4], @add, 0)')).toEqual([
      '10',
    ]);
  });

  it('works with @vadd on points', () => {
    expect(printed('print reduce([[1, 2], [3, 4], [5, 6]], @vadd, [0, 0])')).toEqual(['[9, 12]']);
  });

  it('empty list returns initial value', () => {
    expect(printed('def add(a, b) [ return a + b ] print reduce([], @add, 42)')).toEqual(['42']);
  });

  it('single element applies fn once', () => {
    expect(printed('def add(a, b) [ return a + b ] print reduce([10], @add, 5)')).toEqual(['15']);
  });

  it('rejects non-FuncRef callback', () => {
    expect(() => run('let x = reduce([1, 2], 99, 0)')).toThrow(/@procedure reference/);
  });

  it('works with builtin @max', () => {
    expect(printed('print reduce([3, 7, 2, 9, 1], @max, 0)')).toEqual(['9']);
  });
});

// ── Integration: map + filter + reduce + steps ───────────────────────────────
describe('HOF integration', () => {
  it('map + filter pipeline', () => {
    expect(
      printed(
        'def double(x) [ return x * 2 ] def big(x) [ return x > 4 ] print filter(map([1, 2, 3], @double), @big)',
      ),
    ).toEqual(['[6]']);
  });

  it('steps + map + reduce pipeline', () => {
    expect(
      printed(
        'def sq(x) [ return x * x ] def add(a, b) [ return a + b ] print reduce(map(steps(1, 3), @sq), @add, 0)',
      ),
    ).toEqual(['14']); // 1+4+9
  });

  it('map with @vfromheading to build a ring of points', () => {
    // Verify we can map a builtin with 2 params if we wrap it
    expect(
      printed(
        'def petal(t) [ return vfromheading(t * 60, 10) ] let ring = map(steps(0, 5), @petal) print len(ring)',
      ),
    ).toEqual(['6']);
  });
});

// ── compose() ────────────────────────────────────────────────────────────────
describe('compose()', () => {
  it('basic 2-step pipeline', () => {
    expect(
      printed(
        'def double(x) [ return x * 2 ] def inc(x) [ return x + 1 ] print map([1, 2, 3], compose(@double, @inc))',
      ),
    ).toEqual(['[3, 5, 7]']);
  });

  it('3-step chain', () => {
    expect(
      printed(
        'def a(x) [ return x + 1 ] def b(x) [ return x * 2 ] def c(x) [ return x - 1 ] print map([5], compose(@a, @b, @c))',
      ),
    ).toEqual(['[11]']); // (5+1)*2-1 = 11
  });

  it('with builtin refs only', () => {
    expect(printed('print map([-3.7, 4.2], compose(@abs, @round))')).toEqual(['[4, 4]']);
  });

  it('mixed user + builtin', () => {
    expect(
      printed('def double(x) [ return x * 2 ] print map([1.7], compose(@double, @round))'),
    ).toEqual(['[3]']); // 1.7*2=3.4 → round(3.4)=3
  });

  it('stored in a variable and reused', () => {
    expect(
      printed(
        'def inc(x) [ return x + 1 ] let pipeline = compose(@inc, @inc) print map([1, 10], pipeline)',
      ),
    ).toEqual(['[3, 12]']);
  });

  it('works with filter (last step returns truthy/falsy)', () => {
    expect(
      printed(
        'def double(x) [ return x * 2 ] def big(x) [ return x > 4 ] print filter([1, 2, 3], compose(@double, @big))',
      ),
    ).toEqual(['[3]']); // only 3*2=6 > 4
  });

  it('nested compose', () => {
    expect(
      printed(
        'def inc(x) [ return x + 1 ] def double(x) [ return x * 2 ] let inner = compose(@inc, @double) let outer = compose(inner, @inc) print map([1], outer)',
      ),
    ).toEqual(['[5]']); // inc(1)=2, double(2)=4, inc(4)=5
  });

  it('rejects non-FuncRef argument', () => {
    expect(() => run('let x = compose(@abs, 5)')).toThrow(/@procedure reference/);
  });

  it('parse error with fewer than 2 args', () => {
    expect(() => run('let x = compose(@abs)')).toThrow();
  });

  it('print shows compose(...) format', () => {
    expect(printed('print compose(@abs, @round)')).toEqual(['compose(@abs/1, @round/1)']);
  });

  it('compose + steps + map integration', () => {
    expect(
      printed('def double(x) [ return x * 2 ] print map(steps(1, 3), compose(@double, @abs))'),
    ).toEqual(['[2, 4, 6]']);
  });
});
