// ---------- Modern syntax (RFC-1) test matrix ----------
//
// Every modern form lowers to an existing AST node, so equivalent programs
// must produce identical event streams, warnings and printed output. Legacy
// syntax remains valid forever — the legacy half of each pair doubles as a
// preservation test.

import { describe, it, expect } from 'vitest';
import { run, tokenize, parse, NeedlescriptError } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';
import { EXAMPLES } from '../../data.ts';

const events = (src: string) => run(src).events;
const printed = (src: string) => run(src).printed;

/** Assert two programs are behaviourally identical (incl. line tags). */
function expectEquivalent(modern: string, legacy: string) {
  const a = run(modern);
  const b = run(legacy);
  expect(a.events).toEqual(b.events);
  expect(a.warnings).toEqual(b.warnings);
  expect(a.printed).toEqual(b.printed);
  expect(a.locks).toBe(b.locks);
}

/** Like expectEquivalent, but ignores source-line tags (different layouts). */
function expectEquivalentIgnoringLines(modern: string, legacy: string) {
  const strip = (evs: StitchEvent[]) => evs.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));
  const stripWarn = (w: string[]) => w.map(s => s.replace(/lines? [\d, ]+/g, 'line N'));
  const a = run(modern);
  const b = run(legacy);
  expect(strip(a.events)).toEqual(strip(b.events));
  expect(stripWarn(a.warnings)).toEqual(stripWarn(b.warnings));
  expect(a.printed).toEqual(b.printed);
  expect(a.locks).toBe(b.locks);
}

// ── 1–2: let / bare assignment / scoping ─────────────────────────────────────
describe('let and assignment', () => {
  it('let x = 5 ≡ make "x 5 (test #1)', () => {
    expectEquivalent('let x = 5 fd x', 'make "x 5 fd :x');
  });

  it('in-proc let ≡ local (test #2)', () => {
    expectEquivalent(
      'def f() [ let a = 1 a = 2 print a ] f()',
      'to f local "a 1 make "a 2 print :a end f',
    );
  });

  it('assignment updates a local in scope, else writes a global (test #2)', () => {
    // local stays local: the global g is untouched by the in-proc assignment
    expect(printed('let g = 1 def f() [ let g = 5 g = 9 print g ] f() print g'))
      .toEqual(['9', '1']);
    // no local in scope → make semantics create/update a global
    expect(printed('def f() [ made = 7 ] f() print made')).toEqual(['7']);
  });

  it('compound assignment lowers to x = x op e', () => {
    expect(printed('let x = 1 x += 2 x *= 3 x -= 4 x /= 5 print x')).toEqual(['1']);
    expectEquivalent('let x = 4 x += 2 fd x', 'make "x 4 make "x :x + 2 fd :x');
  });

  it(':x stays a valid spelling for bare reads', () => {
    expect(printed('let x = 3 print :x')).toEqual(['3']);
  });
});

// ── 3: call parens & commas ─────────────────────────────────────────────────
describe('call syntax with parentheses', () => {
  it('f(a, b) ≡ f a b for builtin functions (test #3)', () => {
    expectEquivalent('fd min(3, 4) fd max(1, 2)', 'fd min 3 4 fd max 1 2');
  });

  it('f(a, b) ≡ f a b for commands and user procs (test #3)', () => {
    expectEquivalent(
      'def hop(a, b) [ setxy(a, b) ] hop(10, 20) fd(5)',
      'to hop :a :b setxy :a :b end hop 10 20 fd 5',
    );
  });

  it('xcor() ≡ xcor (test #3)', () => {
    expectEquivalent('fd 10 print xcor()', 'fd 10 print xcor');
  });

  it('styles mix freely inside argument slots', () => {
    expectEquivalent('seed 1 setxy(random 20, random(20))', 'seed 1 setxy random 20 random 20');
  });

  it('trailing commas are allowed', () => {
    expectEquivalent('fd min(3, 4,)', 'fd min 3 4');
  });

  it('kills the trailing-operator absorption footgun', () => {
    // distance 0 0 < 47 absorbs the comparison; distance(0, 0) < 47 does not
    expect(printed('print distance(0, 0) < 47')).toEqual(['1']);
  });

  it('fd(-5) is unambiguous inside parens', () => {
    expectEquivalent('fd(-5)', 'fd -5');
  });
});

// ── 4: def / return ─────────────────────────────────────────────────────────
describe('def and return', () => {
  it('def/return ≡ to/output, including recursion (test #4)', () => {
    expectEquivalent(
      'def fact(n) [ if n < 2 [ return 1 ] return n * fact(n - 1) ] print fact(5)',
      'to fact :n if :n < 2 [ output 1 ] output :n * fact :n - 1 end print fact 5',
    );
  });

  it('bare return ≡ exit (test #4)', () => {
    expectEquivalent(
      'def half(n) [ if n < 1 [ return ] fd n half(n / 2) ] half(8)',
      'to half :n if :n < 1 [ exit ] fd :n half :n / 2 end half 8',
    );
  });

  it('params are bound as locals and read bare or with the legacy sigil', () => {
    expect(printed('def f(size) [ print size print :size ] f(4)')).toEqual(['4', '4']);
  });

  it('def signatures are pre-scanned, so call sites can precede definitions', () => {
    // parse-time arity is known up front (like legacy "to") …
    expect(() => parse(tokenize('print f(2) def f(n) [ return n * 2 ]'))).not.toThrow();
    // … and mutually-referencing procedures work end to end
    expect(printed('def f(n) [ return g(n) + 1 ] def g(n) [ return n * 2 ] print f(3)'))
      .toEqual(['7']);
  });
});

// ── 5: keyword for ──────────────────────────────────────────────────────────
describe('keyword for', () => {
  it('keyword for ≡ legacy for (test #5)', () => {
    expectEquivalent('for i = 1 to 5 [ print i ]', 'for "i 1 5 1 [ print :i ]');
  });

  it('negative step (test #5)', () => {
    expectEquivalent('for i = 10 to 1 step -3 [ print i ]', 'for "i 10 1 -3 [ print :i ]');
  });

  it('default step is 1 (test #5)', () => {
    expect(printed('for i = 1 to 3 [ print i ]')).toEqual(['1', '2', '3']);
  });

  it('bounds can be full expressions, stopped by to/step (test #5)', () => {
    expect(printed('let n = 2 for i = 1 to n * 2 [ print i ]')).toEqual(['1', '2', '3', '4']);
  });

  it('the counter does not leak (test #5)', () => {
    expect(() => run('for i = 1 to 3 [ fd 1 ] print i'))
      .toThrow(/never assigned on this path/);
  });
});

// ── 6: else if ──────────────────────────────────────────────────────────────
describe('else if', () => {
  const modern = [
    'def pick(k) [',
    '  if k == 0 [ print 1 ]',
    '  else if k == 1 [ print 2 ]',
    '  else if k == 2 [ print 3 ]',
    '  else [ print 4 ]',
    ']',
    'pick(0) pick(1) pick(2) pick(3)',
  ].join('\n');
  const legacy = [
    'to pick :k',
    '  if :k = 0 [ print 1 ]',
    '  else [ if :k = 1 [ print 2 ]',
    '  else [ if :k = 2 [ print 3 ]',
    '  else [ print 4 ] ] ]',
    'end',
    'pick 0 pick 1 pick 2 pick 3',
  ].join('\n');

  it('else if chains lower to nested else [ if … ] (test #6)', () => {
    expect(printed(modern)).toEqual(printed(legacy));
    expect(printed(modern)).toEqual(['1', '2', '3', '4']);
  });
});

// ── 7: operators ────────────────────────────────────────────────────────────
describe('modern operators', () => {
  it('% ≡ mod with floor semantics: -7 % 3 = 2 (test #7)', () => {
    expect(printed('print -7 % 3')).toEqual(['2']);
    expectEquivalent('print -7 % 3 print 10 % 4', 'print mod -7 3 print mod 10 4');
  });

  it('% sits at * / precedence', () => {
    expect(printed('print 2 + 7 % 3')).toEqual(['3']);
  });

  it('! ≡ not (test #7)', () => {
    expectEquivalent('print !0 print !5 print !(1 = 2)', 'print not 0 print not 5 print not ( 1 = 2 )');
  });

  it('== ≡ = including the 1e-9 tolerance (test #7)', () => {
    expectEquivalent('print 0.1 + 0.2 == 0.3 print 1 == 2', 'print 0.1 + 0.2 = 0.3 print 1 = 2');
    expect(printed('print 0.1 + 0.2 == 0.3')).toEqual(['1']);
  });

  it('true/false are the numbers 1/0 (test #7)', () => {
    expect(printed('print true print false')).toEqual(['1', '0']);
    expectEquivalent('let on = true if on [ fd 5 ]', 'make "on 1 if :on [ fd 5 ]');
  });
});

// ── 8 + T9: closed strings ──────────────────────────────────────────────────
describe('closed strings (word-string rule)', () => {
  it('fabric "knit" ≡ fabric "knit (test #8)', () => {
    expectEquivalent('fabric "knit" satin 2 fd 10', 'fabric "knit satin 2 fd 10');
  });

  it('underlay "auto" ≡ underlay "auto (test #8)', () => {
    expectEquivalent('underlay "auto" satin 2 fd 10', 'underlay "auto satin 2 fd 10');
  });

  it('quoted print labels close too', () => {
    expect(printed('print "radius" 3')).toEqual(['radius: 3']);
  });

  it('empty string "" is an error', () => {
    expect(() => tokenize('fabric ""')).toThrow(/[Ee]mpty string/);
  });
});

// ── Legacy preservation ─────────────────────────────────────────────────────
describe('legacy preservation', () => {
  it('two legacy qwords on one line still lex separately (test #9)', () => {
    expect(printed('make "x 5 print "y 6')).toEqual(['y: 6']);
    const toks = tokenize('make "x 5 print "y 6');
    expect(toks.filter(t => t.t === 'qword').map(t => t.v)).toEqual(['x', 'y']);
  });

  it('fd (10) stays Logo grouping; fd(10) is a call; fd ( 10 ) groups (test #10)', () => {
    expectEquivalent('fd (10)', 'fd 10');
    expectEquivalent('fd(10)', 'fd 10');
    expectEquivalent('fd ( 10 )', 'fd 10');
  });

  it('fd 10 - 5 ≡ fd 5 and fd 10 -5 still errors outside parens (test #11)', () => {
    expectEquivalent('fd 10 - 5', 'fd 5');
    expect(() => run('fd 10 -5')).toThrow(NeedlescriptError);
  });

  it('// comments to end of line, / still divides (test #12)', () => {
    expectEquivalent('fd 10 // 2', 'fd 10');
    expectEquivalent('fd 10 / 2', 'fd 5');
    expectEquivalent('fd 4 # comment\nbk 4 // comment', 'fd 4 ; comment\nbk 4 ; comment');
  });

  it('single-arity prefix commands still absorb a full expression', () => {
    // assert is single-arity, so the comparison belongs to its argument
    expect(() => run('let tries = 0 assert tries < 99')).not.toThrow();
    expect(() => run('assert 1 > 2')).toThrow(/assert failed/);
  });

  it('every bundled example still parses and runs (test #18)', () => {
    for (const [name, src] of Object.entries(EXAMPLES)) {
      expect(() => run(src), name).not.toThrow();
      expect(events(src).length, name).toBeGreaterThan(0);
    }
  });
});

// ── Errors ──────────────────────────────────────────────────────────────────
describe('definition-time collision errors (§4.3)', () => {
  it('let of a reserved word errors (test #13)', () => {
    expect(() => run('let repeat = 1')).toThrow(/"repeat" is a reserved word/);
    expect(() => run('let sin = 1')).toThrow(/"sin" is a built-in function/);
    expect(() => run('let fd = 1')).toThrow(/"fd" is a built-in command/);
    expect(() => run('let step = 1')).toThrow(/"step" is a reserved word/);
  });

  it('assigning to a procedure name errors (test #13)', () => {
    expect(() => run('def f(n) [ fd n ] f = 1'))
      .toThrow(/"f" is already a procedure \(line 1\)/);
  });

  it('let colliding with a procedure errors in any order (test #13)', () => {
    expect(() => run('let leaf = 2 def leaf(s) [ fd s ]')).toThrow(/already a procedure/);
    expect(() => run('def leaf(s) [ fd s ] let leaf = 2')).toThrow(/already a procedure/);
  });

  it('double let in one scope errors (test #13)', () => {
    expect(() => run('let x = 1 let x = 2')).toThrow(/"x" is already declared/);
    expect(() => run('def f() [ let a = 1 let a = 2 ] f()')).toThrow(/"a" is already declared/);
    expect(() => run('def f(a) [ let a = 1 ] f(0)')).toThrow(/"a" is already declared/);
  });

  it('one textual let executed many times is fine', () => {
    expect(printed('for i = 1 to 3 [ let v = i * 2 print v ]')).toEqual(['2', '4', '6']);
  });

  it('parameters cannot shadow built-ins or procedures (test #13)', () => {
    expect(() => run('def f(sin) [ fd sin ]')).toThrow(/"sin" is a built-in function/);
    expect(() => run('def g(x) [ fd x ] def f(g) [ fd g ]')).toThrow(/already a procedure/);
    expect(() => run('to f :sin fd :sin end')).toThrow(/"sin" is a built-in function/);
  });

  it('"step" is fully reserved as a definition name', () => {
    expect(() => run('to step fd 1 end')).toThrow(/built-in word/);
    expect(() => run('def step(x) [ fd x ]')).toThrow(/built-in word/);
  });
});

describe('call and comma errors', () => {
  it('glued paren on a variable errors (test #14)', () => {
    expect(() => run('let f = 3 fd f(2)')).toThrow(/"f" is a variable, not a procedure/);
    expect(() => run('let f = 3 f(2)')).toThrow(/"f" is a variable, not a procedure/);
  });

  it('wrong arity in call parens names the callee (test #14)', () => {
    expect(() => run('fd min(3)')).toThrow(/min\(…\) expects 2 arguments, got 1/);
    expect(() => run('fd(1, 2)')).toThrow(/fd\(…\) expects 1 argument, got 2/);
    expect(() => run('def f(a, b) [ fd a fd b ] f(1)')).toThrow(/f\(…\) expects 2 arguments, got 1/);
  });

  it('commas outside call parens error (test #14)', () => {
    expect(() => run('fd 1, 2')).toThrow(/Commas can only separate arguments/);
    expect(() => run('fd (1, 2)')).toThrow(/Commas can only separate arguments/);
  });
});

describe('structure errors', () => {
  it('def nested in def or to errors (test #15)', () => {
    expect(() => run('def a() [ def b() [ fd 1 ] ]')).toThrow(/inside another procedure/);
    expect(() => run('to a def b() [ fd 1 ] end')).toThrow(/inside another procedure/);
  });

  it('return at top level errors (test #15)', () => {
    expect(() => run('return 1')).toThrow(/can only be used inside a procedure/);
  });

  it('reads of declared-but-unset variables error at runtime (test #16)', () => {
    expect(() => run('if 0 [ x = 1 ] print x'))
      .toThrow(/Variable "x" was never assigned on this path/);
  });

  it('unknown names suggest across both namespaces (test #17)', () => {
    expect(() => run('let radius = 5 fd radiu'))
      .toThrow(/did you mean the variable "radius"/);
    expect(() => run('def grow(n) [ return n ] fd gros(1)'))
      .toThrow(/did you mean the procedure "grow"/);
    expect(() => run('fd stich(2)')).toThrow(/Unknown name/);
  });
});

// ── 19: the meadow pair ─────────────────────────────────────────────────────
const MEADOW_LEGACY = `
; meadow (classic syntax) — the legacy twin of the bundled meadow example.
; Behaviourally identical: same seed, same stitch events, same warnings.

fabric "knit
seed 11
stitchlen 2.2
autotrim 6

make "debug 0            ; 0 = false; no boolean literals in legacy

to clamp :v :lo :hi
  output min :hi max :lo :v
end

to len2 :x :y
  output sqrt ( :x * :x + :y * :y )
end

to inside :x :y
  output ( len2 :x :y ) < 31
end

to sprig :depth :seg
  if :depth = 0 [ exit ]
  fd :seg
  push
    lt 35
    sprig :depth - 1 :seg * 0.62
  pop
  push
    rt 30
    sprig :depth - 1 :seg * 0.62
  pop
  bk :seg
end

to leaf :size
  beginfill
    repeat 2 [ arc 90 :size rt 90 ]
  endfill
end

to bloom :size :kind
  if :kind = 0 [
    repeat 6 [
      repeat 2 [ arc 90 :size rt 90 ]
      rt 60 fd 0.9
    ]
    arc 360 clamp :size / 3 1 1.8
  ] else [
    if :kind = 1 [
      bean 3
      for "t 1 4 1 [ arc 130 :t * 0.7 ]
      bean 1
    ] else [
      repeat 8 [ fd :size + 1.5  bk :size + 1.5  rt 45 fd 0.8 ]
    ]
  ]
end

color 1
fillangle 20
up setxy -8 -33 seth -25 down
leaf 8
up setxy 8 -34 seth 20 down
leaf 7
trim

for "gx -20 20 10 [
  up
  setxy :gx -33 + random 3
  seth ( noise ( :gx / 9 ) - 0.5 ) * 40
  down
  sprig 3 3.5
  trim
]

for "i 1 7 1 [
  make "x random 64 - 32
  make "y random 44 - 14
  make "tries 0
  while not ( inside :x :y ) [
    make "x random 64 - 32
    make "y random 44 - 14
    make "tries :tries + 1
    assert :tries < 99
  ]

  color 2 + mod :i 3
  up setxy :x :y seth random 360 down

  make "kind floor random 3
  if :debug [ mark print "flower :kind ]
  bloom clamp 2.5 + random 3 2.5 5 :kind
  trim
]

color 5
satin 2.2
up setxy 0 42 seth 90 down
arc 360 42
satin 0
trim
`;

describe('meadow — modern and legacy twins (test #19)', () => {
  const modern = EXAMPLES['meadow'];

  it('both versions parse', () => {
    expect(() => parse(tokenize(modern))).not.toThrow();
    expect(() => parse(tokenize(MEADOW_LEGACY))).not.toThrow();
  });

  it('produce identical event streams, warnings and prints', () => {
    expectEquivalentIgnoringLines(modern, MEADOW_LEGACY);
  });

  it('actually sews something', () => {
    expect(events(modern).filter(e => e.t === 'stitch').length).toBeGreaterThan(500);
  });
});
