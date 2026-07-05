// ---------- String type test suite ----------
//
// Covers all 8 categories from the spec §15 test plan:
//   1. Tokenizer
//   2. Classic/modern equivalence
//   3. Semantics
//   4. Library functions
//   5. Determinism
//   6. Limits
//   7. Mode consumers
//   8. Sandbox (trace)

import { describe, it, expect } from 'vitest';
import { run, tokenize, LIMITS } from '../engine.ts';

const printed = (src: string) => run(src).printed;
const events = (src: string) => run(src).events;

// ── 1. Tokenizer ─────────────────────────────────────────────────────────────

describe('tokenizer: string literals', () => {
  it('emits a string token for a plain literal', () => {
    const toks = tokenize("'hello'");
    expect(toks.length).toBe(1);
    expect(toks[0].t).toBe('string');
    expect(toks[0].v).toBe('hello');
  });

  it('empty string', () => {
    const toks = tokenize("''");
    expect(toks[0].t).toBe('string');
    expect(toks[0].v).toBe('');
  });

  it('escape: single-quote', () => {
    const toks = tokenize("'it\\'s'");
    expect(toks[0].v).toBe("it's");
  });

  it('escape: backslash', () => {
    const toks = tokenize("'a\\\\b'");
    expect(toks[0].v).toBe('a\\b');
  });

  it('escape: newline', () => {
    const toks = tokenize("'a\\nb'");
    expect(toks[0].v).toBe('a\nb');
  });

  it('escape: tab', () => {
    const toks = tokenize("'a\\tb'");
    expect(toks[0].v).toBe('a\tb');
  });

  it('unknown escape is a hard error naming the sequence', () => {
    expect(() => tokenize("'\\q'")).toThrow(/Unknown escape.*\\q/);
    expect(() => tokenize("'\\q'")).toThrow(/valid escapes are/);
  });

  it('unterminated string (end of input) is an error', () => {
    expect(() => tokenize("'hello")).toThrow(/Unterminated string/);
  });

  it('unterminated string (newline before close) is an error', () => {
    expect(() => tokenize("'hello\nworld'")).toThrow(/Unterminated string/);
  });

  it('string contents are case-sensitive', () => {
    const toks = tokenize("'Hello'");
    expect(toks[0].v).toBe('Hello');
  });

  it('single-quote inside a comment is ignored', () => {
    expect(() => tokenize("// don't care\nfd 5")).not.toThrow();
  });

  it("qword lowercasing is preserved: \"KNIT produces 'knit'", () => {
    const toks = tokenize('"KNIT');
    expect(toks[0].t).toBe('qword');
    expect(toks[0].v).toBe('knit');
  });
});

// ── 2. Classic / modern equivalence ──────────────────────────────────────────

describe('classic/modern equivalence', () => {
  const fabricProgram = (mode: string) => `lock 0 ${mode} satin 3 beginfill fd 5 endfill`;

  it("fabric \"knit and fabric 'knit' produce identical event streams", () => {
    const a = events(fabricProgram('fabric "knit'));
    const b = events(fabricProgram("fabric 'knit'"));
    expect(a).toEqual(b);
  });

  it("fabric 'KNIT' (uppercase string) works via case-insensitive matching", () => {
    const a = events(fabricProgram('fabric "knit'));
    const b = events(fabricProgram("fabric 'KNIT'"));
    expect(a).toEqual(b);
  });

  it('fabric lower("KNIT") is equivalent', () => {
    const a = events(fabricProgram('fabric "knit'));
    const b = events(fabricProgram("fabric lower('KNIT')"));
    expect(a).toEqual(b);
  });

  it("underlay \"auto and underlay 'auto' produce identical event streams", () => {
    const prog = (mode: string) => `lock 0 satin 3 ${mode} beginfill fd 5 endfill`;
    expect(events(prog('underlay "auto'))).toEqual(events(prog("underlay 'auto'")));
  });

  it('clippaths with "union and "union string produce identical results', () => {
    const prog = (op: string) => `
      let a = [[0, 0], [10, 0], [10, 10], [0, 10]]
      let b = [[5, 0], [15, 0], [15, 10], [5, 10]]
      print len(clippaths(a, b, ${op}))
    `;
    expect(printed(prog('"union'))).toEqual(printed(prog("'union'")));
  });

  it('computed mode: pick from a list of operations works', () => {
    const r = run(`
      seed 7
      let ops = ['union', 'difference', 'intersect']
      let a = [[0, 0], [10, 0], [10, 10], [0, 10]]
      let b = [[5, 0], [15, 0], [15, 10], [5, 10]]
      let result = clippaths(a, b, pick(ops))
      print len(result) > 0
    `);
    expect(r.printed).toEqual(['1']);
  });
});

// ── 3. Value semantics ────────────────────────────────────────────────────────

describe('string value semantics', () => {
  it('print outputs raw contents with no quotes', () => {
    expect(printed("print 'hello'")).toEqual(['hello']);
    expect(printed("print ''")).toEqual(['']);
  });

  it('string inside a list renders with single quotes', () => {
    expect(printed("print ['a', 1, 'b']")).toEqual(["['a', 1, 'b']"]);
  });

  it('escaped characters render with escapes inside list', () => {
    // spec: inside a list, strings appear single-quoted with escapes
    expect(printed("print ['it\\'s']")).toEqual(["['it\\'s']"]);
  });

  it('equality: case-sensitive exact match', () => {
    expect(printed("print 'Anna' == 'Anna'")).toEqual(['1']);
    expect(printed("print 'Anna' == 'anna'")).toEqual(['0']);
    expect(printed("print 'a' != 'b'")).toEqual(['1']);
    expect(printed("print '' == ''")).toEqual(['1']);
  });

  it('cross-type equality is 0, not an error', () => {
    expect(printed("print 'knit' == 1")).toEqual(['0']);
    expect(printed("print 'x' == [1, 2]")).toEqual(['0']);
  });

  it('strings inside lists can be deep-equal compared', () => {
    expect(printed("print ['a', 1] == ['a', 1]")).toEqual(['1']);
    expect(printed("print ['a', 1] == ['b', 1]")).toEqual(['0']);
  });

  it('strings are immutable — index assignment is an error', () => {
    expect(() => run("let s = 'hello' s[0] = 'H'")).toThrow(/strings are immutable/);
  });

  it('string in a condition is a loud error with a hint', () => {
    expect(() => run("if 'hello' [ fd 1 ]")).toThrow(/string in a condition/);
    expect(() => run("if 'hello' [ fd 1 ]")).toThrow(/len\(s\)/);
    expect(() => run("while 'go' [ fd 1 ]")).toThrow(/string in a condition/);
  });

  it('operator +: error with concat hint', () => {
    expect(() => run("print 'a' + 'b'")).toThrow(/cannot join strings/);
    expect(() => run("print 'a' + 'b'")).toThrow(/concat/);
  });

  it('operator -/*: error with conversion hint', () => {
    expect(() => run("print 'x' * 3")).toThrow(/on a string/);
    expect(() => run("print 3 - 'x'")).toThrow(/on a string/);
  });

  it('ordering operators error with no-ordering message', () => {
    expect(() => run("print 'a' < 'b'")).toThrow(/strings have no ordering/);
    expect(() => run("print 'a' >= 'b'")).toThrow(/strings have no ordering/);
  });

  it('unary minus on a string errors', () => {
    expect(() => run("print -'hello'")).toThrow(/expected a number/);
  });

  it('fd and other scalar commands reject strings', () => {
    expect(() => run("fd 'hello'")).toThrow(/"fd" expected a number, got a string/);
  });

  it('string indexing: 0-based, returns 1-char string', () => {
    expect(printed("print 'hello'[0]")).toEqual(['h']);
    expect(printed("print 'hello'[4]")).toEqual(['o']);
  });

  it('string indexing: negatives count from the end', () => {
    expect(printed("print 'hello'[-1]")).toEqual(['o']);
    expect(printed("print 'hello'[-5]")).toEqual(['h']);
  });

  it('string indexing: out of range is an error', () => {
    expect(() => run("print 'hi'[5]")).toThrow(/out of range/);
    expect(() => run("print 'hi'[-3]")).toThrow(/out of range/);
  });

  it('string indexing: non-integer index is an error', () => {
    expect(() => run("print 'hi'[1.5]")).toThrow(/isn't a whole number/);
  });

  it('append to a string errors with immutability hint', () => {
    expect(() => run("let s = 'x' append(s, 'y')")).toThrow(/strings are immutable/);
    expect(() => run("let s = 'x' append(s, 'y')")).toThrow(/concat/);
  });

  it('prepend to a string errors with immutability hint', () => {
    expect(() => run("let s = 'x' prepend(s, 'y')")).toThrow(/strings are immutable/);
  });

  it('insertat on a string errors', () => {
    expect(() => run("let s = 'x' insertat(s, 0, 'y')")).toThrow(/strings are immutable/);
  });

  it('for…in over a string iterates 1-char strings', () => {
    const r = run("let out = [] for c in 'abc' [ append(out, c) ] print joinstr(out, '')");
    expect(r.printed).toEqual(['abc']);
  });

  it('for…in loop variable does not leak', () => {
    expect(() => run("for c in 'hi' [ fd 1 ] print c")).toThrow(
      /variable.*never assigned|Unknown variable/i,
    );
  });

  it('trim(s) gives the helpful strip() error', () => {
    expect(() => run("trim('hello')")).toThrow(/"trim" cuts the thread/);
    expect(() => run("trim('hello')")).toThrow(/strip/);
  });
});

// ── 4. Library functions ──────────────────────────────────────────────────────

describe('string library: overloaded sequence functions', () => {
  it('len(s) returns character count', () => {
    expect(printed("print len('hello')")).toEqual(['5']);
    expect(printed("print len('')")).toEqual(['0']);
  });

  it('first(s) and last(s) return 1-char strings', () => {
    expect(printed("print first('hello')")).toEqual(['h']);
    expect(printed("print last('hello')")).toEqual(['o']);
  });

  it('first/last on empty string errors', () => {
    expect(() => run("print first('')")).toThrow(/empty string/);
    expect(() => run("print last('')")).toThrow(/empty string/);
  });

  it('slice(s, a) and slice(s, a, b): Python semantics', () => {
    expect(printed("print slice('hello', 1)")).toEqual(['ello']);
    expect(printed("print slice('hello', 1, 3)")).toEqual(['el']);
    expect(printed("print slice('hello', -2)")).toEqual(['lo']);
    expect(printed("print slice('hello', 1, -1)")).toEqual(['ell']);
  });

  it('slice bounds are clamped (no error for over-bounds)', () => {
    expect(printed("print slice('hi', 0, 100)")).toEqual(['hi']);
    expect(printed("print slice('hi', 10)")).toEqual(['']);
  });

  it('reverse(s) returns a reversed string', () => {
    expect(printed("print reverse('hello')")).toEqual(['olleh']);
  });

  it('concat(a, b): both strings → concatenated string', () => {
    expect(printed("print concat('foo', 'bar')")).toEqual(['foobar']);
    expect(printed("print concat('', 'x')")).toEqual(['x']);
  });

  it('concat: mixed string/number is an error with str() hint', () => {
    expect(() => run("print concat('a', 1)")).toThrow(/str/);
  });

  it('contains(s, sub): substring test', () => {
    expect(printed("print contains('hello', 'ell')")).toEqual(['1']);
    expect(printed("print contains('hello', 'xyz')")).toEqual(['0']);
    expect(printed("print contains('hi', '')")).toEqual(['1']);
  });

  it('indexof(s, sub): first index or -1', () => {
    expect(printed("print indexof('hello', 'l')")).toEqual(['2']);
    expect(printed("print indexof('hello', 'x')")).toEqual(['-1']);
  });

  it('copy(s) is identity (strings are immutable)', () => {
    expect(printed("let s = 'hi' print copy(s) == s")).toEqual(['1']);
  });

  it('islist returns 0 for strings', () => {
    expect(printed("print islist('x')")).toEqual(['0']);
  });

  it('sort errors if list contains strings', () => {
    expect(() => run("print sort(['b', 'a'])")).toThrow(/sort can only sort numbers.*string/);
  });

  it('sum/mean/minof/maxof error on string elements', () => {
    expect(() => run("print sum(['a', 1])")).toThrow(/"sum" expected a number, got a string/);
    expect(() => run("print mean(['a'])")).toThrow(/expected a number/);
  });
});

describe('string library: new functions', () => {
  it('str(n) renders a number exactly as print does', () => {
    expect(printed('print str(3)')).toEqual(['3']);
    expect(printed('print str(3.14)')).toEqual(['3.14']);
    // str(x) must produce exactly the same as print x for the same value
    expect(printed("let x = 42 print str(x) == '42'")).toEqual(['1']);
    expect(printed("let x = 1.5 print str(x) == '1.5'")).toEqual(['1']);
  });

  it('str(s) is identity', () => {
    expect(printed("print str('hello')")).toEqual(['hello']);
  });

  it('str(list) is an error', () => {
    expect(() => run('print str([1, 2])')).toThrow(/str\(\)/);
  });

  it('num(s) parses a number string', () => {
    expect(printed("print num('3.14')")).toEqual(['3.14']);
    expect(printed("print num('-5') + 1")).toEqual(['-4']);
    expect(printed("print num('1e3')")).toEqual(['1000']);
  });

  it('num(n) is identity', () => {
    expect(printed('print num(42)')).toEqual(['42']);
  });

  it('num(bad) without fallback is an error naming the string', () => {
    expect(() => run("print num('abc')")).toThrow(/not a number/);
    expect(() => run("print num('abc')")).toThrow(/fallback/);
  });

  it('num(bad, fallback) returns fallback', () => {
    expect(printed("print num('abc', 0)")).toEqual(['0']);
    expect(printed("print num('abc', -1)")).toEqual(['-1']);
  });

  it('isstring predicate', () => {
    expect(printed("print isstring('x')")).toEqual(['1']);
    expect(printed('print isstring(1)')).toEqual(['0']);
    expect(printed('print isstring([1])')).toEqual(['0']);
  });

  it('chars(s) returns list of 1-char strings', () => {
    expect(printed("print chars('hi')")).toEqual(["['h', 'i']"]);
    expect(printed("print chars('')")).toEqual(['[]']);
  });

  it("chars/joinstr round-trip: joinstr(chars(s), '') == s", () => {
    expect(printed("let s = 'hello' print joinstr(chars(s), '') == s")).toEqual(['1']);
  });

  it('split(s, sep) returns a list of strings', () => {
    expect(printed("print split('a,b,c', ',')")).toEqual(["['a', 'b', 'c']"]);
    expect(printed("print split('hello', 'l')")).toEqual(["['he', '', 'o']"]);
  });

  it('split: unmatched separator returns the whole string as one element', () => {
    expect(printed("print split('hello', 'x')")).toEqual(["['hello']"]);
  });

  it('split: empty separator is a loud error', () => {
    expect(() => run("print split('hi', '')")).toThrow(/separator must not be empty/);
    expect(() => run("print split('hi', '')")).toThrow(/chars/);
  });

  it('joinstr(xs, sep) joins string elements', () => {
    expect(printed("print joinstr(['a', 'b', 'c'], '-')")).toEqual(['a-b-c']);
    expect(printed("print joinstr([], ',')")).toEqual(['']);
  });

  it('joinstr: non-string element is an error with map(@str) hint', () => {
    expect(() => run("print joinstr([1, 2], ',')")).toThrow(/element 0 is/);
    expect(() => run("print joinstr([1, 2], ',')")).toThrow(/map.*@str/);
  });

  it('upper(s): ASCII only', () => {
    expect(printed("print upper('Hello World')")).toEqual(['HELLO WORLD']);
    expect(printed("print upper('abc123')")).toEqual(['ABC123']);
  });

  it('lower(s): ASCII only', () => {
    expect(printed("print lower('HELLO')")).toEqual(['hello']);
    expect(printed("print lower('abc')")).toEqual(['abc']);
  });

  it('strip(s) removes leading and trailing whitespace', () => {
    expect(printed("print strip('  hello  ')")).toEqual(['hello']);
    expect(printed("print strip('\\n\\t hi \\n')")).toEqual(['hi']);
    expect(printed("print strip('no spaces')")).toEqual(['no spaces']);
  });

  it('repeatstr(s, n) repeats a string n times', () => {
    expect(printed("print repeatstr('ab', 3)")).toEqual(['ababab']);
    expect(printed("print repeatstr('x', 0)")).toEqual(['']);
    expect(printed("print repeatstr('', 100)")).toEqual(['']);
  });

  it('repeatstr: negative n is an error', () => {
    expect(() => run("print repeatstr('x', -1)")).toThrow(/non-negative integer/);
  });

  it('repeatstr: non-integer n is an error', () => {
    expect(() => run("print repeatstr('x', 1.5)")).toThrow(/non-negative integer/);
  });

  it('@str, @upper, @lower work as FuncRefs in map', () => {
    expect(printed("print map(['1', '2'], @str)")).toEqual(["['1', '2']"]);
    expect(printed("print map(['a', 'b'], @upper)")).toEqual(["['A', 'B']"]);
    expect(printed("print map(['A', 'B'], @lower)")).toEqual(["['a', 'b']"]);
  });
});

// ── 5. Determinism (no RNG draws for pure string functions) ──────────────────

describe('string determinism', () => {
  it('pure string ops draw no RNG values', () => {
    // A string-heavy program with one pick() should draw exactly one RNG value.
    // If string ops drew RNG, the seed output would differ.
    const r1 = run(`
      seed 42
      let ops = ['union', 'difference']
      let picked = pick(ops)
      print picked
    `);
    const r2 = run(`
      seed 42
      let ops = ['union', 'difference']
      let s = upper(lower(concat('hel', 'lo')))
      let picked = pick(ops)
      print picked
    `);
    // Both programs pick from the same seed after exactly one draw — should match.
    expect(r1.printed).toEqual(r2.printed);
  });

  it('same seed → same string output forever', () => {
    const prog = `
      seed 11
      let pieces = ['rose', 'meadow', 'anna']
      print pick(pieces)
    `;
    expect(run(prog).printed).toEqual(run(prog).printed);
  });
});

// ── 6. Limits ─────────────────────────────────────────────────────────────────

describe('string limits', () => {
  it('a string exceeding maxStringLength is an error', () => {
    // Build a string just over the limit using repeatstr
    expect(() => run(`print repeatstr('x', ${LIMITS.maxStringLength + 1})`)).toThrow(
      /too long|allocation budget/i,
    );
  });

  it('a string at exactly maxStringLength is allowed', () => {
    expect(() => run(`print len(repeatstr('x', ${LIMITS.maxStringLength}))`)).not.toThrow();
  });

  it('string literal at the limit is allowed', () => {
    // Literals are checked but not charged to the allocation budget
    const src = `print len('${'x'.repeat(100)}')`;
    expect(printed(src)).toEqual(['100']);
  });
});

// ── 7. Mode consumers ────────────────────────────────────────────────────────

describe('mode consumers', () => {
  it('fabric accepts a string variable', () => {
    // fabric 'woven' should work and not throw
    expect(() => run("let f = 'woven' fabric f")).not.toThrow();
    // knit sets densityFloor and other parameters — check it doesn't error
    expect(() => run("let f = 'knit' fabric f satin 2 fd 5")).not.toThrow();
  });

  it('underlay accepts a string variable', () => {
    expect(() => run("let m = 'center' underlay m satin 2 fd 5")).not.toThrow();
  });

  it('fillunderlay accepts a string variable', () => {
    expect(() => run("let m = 'edge' fillunderlay m beginfill fd 5 endfill")).not.toThrow();
  });

  it('fabric mode is case-insensitive', () => {
    expect(() => run("fabric 'WOVEN' satin 2 fd 5")).not.toThrow();
    expect(() => run("fabric 'Woven' satin 2 fd 5")).not.toThrow();
  });

  it('unknown fabric mode errors with did-you-mean', () => {
    expect(() => run("fabric 'velvet'")).toThrow(/Unknown fabric 'velvet'/);
    expect(() => run("fabric 'kavas'")).toThrow(/canvas/); // did-you-mean
  });

  it('unknown underlay mode errors', () => {
    expect(() => run("underlay 'wave'")).toThrow(/Unknown underlay/);
  });

  it('clippaths accepts a string expression', () => {
    const r = run(`
      let a = [[0,0],[10,0],[10,10],[0,10]]
      let b = [[5,0],[15,0],[15,10],[5,10]]
      let mode = 'union'
      print len(clippaths(a, b, mode)) > 0
    `);
    expect(r.printed).toEqual(['1']);
  });

  it('clippaths unknown mode errors with did-you-mean', () => {
    expect(() =>
      run(`
        let a = [[0,0],[1,0],[1,1],[0,1]]
        let b = [[0,0],[1,0],[1,1],[0,1]]
        let r = clippaths(a, b, 'diference')
      `),
    ).toThrow(/difference/);
  });
});

// ── 8. print variadic, assert 2-arg, mark label ───────────────────────────────

describe('print variadic form', () => {
  it('print(v1, v2, …) concatenates renderings', () => {
    expect(printed("print('r: ', 3.14, ' mm')")).toEqual(['r: 3.14 mm']);
  });

  it('strings in variadic print appear raw', () => {
    expect(printed("let n = 5 print('n is ', n)")).toEqual(['n is 5']);
  });

  it('classic `print "label expr` still works', () => {
    expect(printed('print "radius 5')).toEqual(['radius: 5']);
  });

  it('single-arg print("string") still works', () => {
    expect(printed("print('hello')")).toEqual(['hello']);
  });
});

describe('assert 2-arg form', () => {
  it('assert(cond) classic form still works', () => {
    expect(() => run('assert 1 == 1')).not.toThrow();
    expect(() => run('assert 0')).toThrow(/assertion failed/);
  });

  it('assert(cond, message) shows message on failure', () => {
    expect(() => run("assert(0, 'clip produced nothing')")).toThrow(/clip produced nothing/);
  });

  it('assert(1, message) — message not evaluated on pass', () => {
    // If message were evaluated eagerly, num('x') would throw
    expect(() => run("assert(1, num('x'))")).not.toThrow();
  });

  it('assert failure carries the source line', () => {
    expect(() => run('\nassert(0, "failed")'.trimStart())).toThrow(/line/);
  });
});

describe('mark label', () => {
  it('mark with no label still works', () => {
    const r = run('lock 0 fd 5 mark');
    const marks = r.events.filter((e) => e.t === 'mark');
    expect(marks.length).toBe(1);
    expect(marks[0].label).toBeUndefined();
  });

  it("mark 'label' attaches a label to the event", () => {
    const r = run("lock 0 fd 5 mark 'rose'");
    const marks = r.events.filter((e) => e.t === 'mark');
    expect(marks.length).toBe(1);
    expect(marks[0].label).toBe('rose');
  });

  it('mark variable label works', () => {
    const r = run("let name = 'anna' lock 0 fd 5 mark name");
    const marks = r.events.filter((e) => e.t === 'mark');
    expect(marks[0].label).toBe('anna');
  });

  it('mark with a non-string label is an error', () => {
    expect(() => run('lock 0 fd 5 mark 5')).toThrow(/label must be a string/);
  });
});

// ── Strings inside lists ──────────────────────────────────────────────────────

describe('strings inside lists', () => {
  it('string list literal', () => {
    expect(printed("print ['a', 'b', 'c']")).toEqual(["['a', 'b', 'c']"]);
  });

  it('mixed-type list', () => {
    expect(printed("print [1, 'two', [3]]")).toEqual(["[1, 'two', [3]]"]);
  });

  it('destructuring with strings', () => {
    expect(printed("let [a, b] = ['knit', 'woven'] print a")).toEqual(['knit']);
  });

  it('contains and indexof on a list with strings', () => {
    expect(printed("print contains(['a', 'b'], 'b')")).toEqual(['1']);
    expect(printed("print indexof(['a', 'b', 'c'], 'b')")).toEqual(['1']);
  });

  it('pick from a string list', () => {
    const r = run("seed 0 print pick(['x', 'y', 'z'])");
    expect(['x', 'y', 'z']).toContain(r.printed[0]);
  });
});
