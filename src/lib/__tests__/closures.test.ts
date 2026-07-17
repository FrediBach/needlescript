import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';

const printed = (source: string) => run(source).printed;

describe('bound references', () => {
  it('binds leading arguments and supports stacked binding', () => {
    expect(
      printed(`
        def sum3(a, b, c) [ return a + b + c ]
        let add1 = bind(@sum3, 1)
        let add3 = bind(add1, 2)
        print add1(2, 3)
        print add3(4)
      `),
    ).toEqual(['6', '7']);
  });

  it('allows binding all arguments into a zero-argument reference', () => {
    expect(
      printed('def add(a, b) [ return a + b ] let seven = bind(@add, 3, 4) print seven()'),
    ).toEqual(['7']);
  });

  it('calls computed and indexed references and identifies them', () => {
    expect(
      printed(`
        def inc(x) [ return x + 1 ]
        let refs = [@inc, bind(@pow, 2)]
        print refs[0](9)
        print refs[1](3)
        print isref(refs[0])
        print isref(1)
      `),
    ).toEqual(['10', '8', '1', '0']);
  });

  it('works in classic syntax and composes with configured first steps', () => {
    expect(
      printed(`
        to add :a :b
          output :a + :b
        end
        make "add10 bind(@add, 10)
        print compose(:add10, @abs)(-13)
      `),
    ).toEqual(['3']);
  });

  it('creates references without consuming random draws', () => {
    const configured = run(`
      seed 812
      def add(a, b) [ return a + b ]
      let f = bind(@add, 1)
      let g = compose(f, @abs)
      print random(1)
    `);
    expect(configured.printed).toEqual(run('seed 812 print random(1)').printed);
  });

  it('rejects over-binding and reference comparison', () => {
    expect(() => run('def one(x) [ return x ] let bad = bind(@one, 1, 2)')).toThrow(
      /cannot bind 2/,
    );
    expect(() => run('print @abs = @abs')).toThrow(/references are not comparable/);
    expect(() => run('print [@abs] = [@abs]')).toThrow(/references are not comparable/);
  });
});

describe('anonymous capturing closures', () => {
  it('captures parameters and locals by snapshot', () => {
    expect(
      printed(`
        def maker(a) [
          let k = 2
          let f = def(x) [ return x * k + a ]
          k = 20
          a = 30
          return f
        ]
        print maker(3)(4)
      `),
    ).toEqual(['11']);
  });

  it('supports zero-argument and transitive nested captures', () => {
    expect(
      printed(`
        def outer(a) [
          return def() [
            return def(x) [ return a + x ]
          ]
        ]
        print outer(5)()(7)
      `),
    ).toEqual(['12']);
  });

  it('reads globals live instead of capturing them', () => {
    expect(
      printed(`
        let factor = 2
        def maker() [ return def(x) [ return x * factor ] ]
        let f = maker()
        factor = 4
        print f(3)
      `),
    ).toEqual(['12']);
  });

  it('rejects writes and shadowing of captured names', () => {
    expect(() => run('def maker(n) [ return def(x) [ n += x return n ] ]')).toThrow(
      /captured variable 'n' is read-only/,
    );
    expect(() => run('def maker(n) [ return def(n) [ return n ] ]')).toThrow(
      /shadowing is not allowed/,
    );
  });

  it('requires every closure path to return a value', () => {
    expect(() => run('def maker(n) [ return def(x) [ if x [ return n ] ] ]')).toThrow(
      /may finish without returning a value/,
    );
  });

  it('uses configured closures in reporter consumers', () => {
    expect(() =>
      run(`
        def direction(degrees) [ return def(p) [ return degrees ] ]
        fill dir direction(30)
        beginfill repeat 4 [ fd 8 rt 90 ] endfill
      `),
    ).not.toThrow();
  });

  it('keeps list captures aliased and closure creation drawless', () => {
    const source = `
      seed 721
      def maker(xs) [ return def() [ return xs[0] ] ]
      let values = [1]
      let f = maker(values)
      values[0] = 9
      print f()
      print random(1)
    `;
    const result = run(source);
    expect(result.printed[0]).toBe('9');
    expect(result.printed[1]).toBe(run('seed 721 print random(1)').printed[0]);
    expect(result.referenceVars?.find((value) => value.name === 'f')).toMatchObject({
      environment: [{ name: 'xs', value: '[9]' }],
    });
  });

  it('uses the intrinsic lowering even when the public bind name is shadowed', () => {
    expect(
      printed(`
        def bind(x) [ return x + 100 ]
        def maker(k) [ return def(x) [ return x + k ] ]
        print bind(1)
        print maker(3)(4)
      `),
    ).toEqual(['101', '7']);
  });

  it('enforces the capture limit and rejects anonymous syntax in classic procedures', () => {
    const names = Array.from({ length: 17 }, (_, index) => `p${index}`);
    const expression = names.join(' + ');
    expect(() =>
      run(`def maker(${names.join(', ')}) [ return def() [ return ${expression} ] ]`),
    ).toThrow(/at most 16 values/);
    expect(() => run('to maker :n output def(x) [ return :n + x ] end')).toThrow(
      /available only in modern def procedures/,
    );
  });
});
