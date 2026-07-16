import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';

const events = (source: string) => run(`lock 0\n${source}`).events;

describe('satinbetween', () => {
  it('is byte-identical to plain satin for straight parallel rails', () => {
    const between = events(
      `underlay 'off' density 0.4
       satinbetween([[-2, -20], [-2, 20]], [[2, -20], [2, 20]])`,
    );
    const spine = events(
      `underlay 'off' density 0.4 satin 4
       up moveto 0 -20 down fd 40 satin 0`,
    );
    expect(between).toEqual(spine);
  });

  it('is a reserved, call-only, statement-only Core command', () => {
    expect(() => run('let satinbetween = 1')).toThrow(/reserved|built-in/);
    expect(() => run('satinbetween [[0,0],[0,10]] [[2,0],[2,10]]')).toThrow(/call syntax/);
    expect(() => run('print @satinbetween')).toThrow(/doesn't return a value/);
  });

  it('validates paths, closure, and nonzero column width', () => {
    expect(() => run('satinbetween([[0,0]], [[1,0],[1,2]])')).toThrow(/at least 2 points/);
    expect(() => run('satinbetween([[0,0],[0,2],[0,0]], [[1,0],[1,2]])')).toThrow(
      /both be open or both be closed/,
    );
    expect(() => run('satinbetween([[0,0],[0,2]], [[0,0],[0,2]])')).toThrow(/coincide everywhere/);
  });

  it('reverses an open rail only when the reversed endpoint cost is cheaper', () => {
    const reversed = run('satinbetween([[-2,0],[-2,10]], [[2,10],[2,0]])');
    expect(reversed.warnings).toContain("note: rail B reversed to match rail A's direction");
    const tied = run('satinbetween([[-2,0],[-2,10]], [[2,0],[2,10]])');
    expect(tied.warnings.some((warning) => warning.includes('rail B reversed'))).toBe(false);
  });

  it('uses ordered checkpoints and rejects non-monotone correspondence', () => {
    expect(() =>
      run('satinbetween([[0,0],[-2,5],[0,10]], [[4,0],[8,5],[4,10]], [[[0,5],[8,5]]])'),
    ).not.toThrow();
    expect(() =>
      run('satinbetween([[0,0],[0,10]], [[4,0],[4,10]], [[[0,7],[4,3]], [[0,3],[4,7]]])'),
    ).toThrow(/checkpoint 2 is not strictly increasing/);
    expect(() => run('satinbetween([[0,0],[0,10]], [[4,0],[4,10]], [[[0,0],[4,0]]])')).toThrow(
      /repeats an endpoint/,
    );
  });

  it('supports reporter shaping and the rail tuple helpers', () => {
    const helper = run('print railinset(0.5, 0.2) print railrake(0.5, 0.8)');
    expect(helper.printed).toEqual(['[0.5, 0.2, 0.2, 0, 0]', '[0.5, 0, 0, -0.8, 0.8]']);

    const shaped = events(
      `underlay 'off'
       def inset(t, s, i, u) [ return railinset(0.5, 0.2) ]
       satinbetween([[-2,0],[-2,10]], [[2,0],[2,10]], @inset)`,
    );
    expect(shaped.filter((event) => event.t === 'stitch')).toHaveLength(21);
    expect(Math.abs(shaped[1].x)).toBeCloseTo(1.8);
  });

  it('validates reporter signatures, return paths, and tuple slots', () => {
    expect(() =>
      run('def bad(t,s,i)[return railinset(0.4,0)] satinbetween([[0,0],[0,3]],[[2,0],[2,3]],@bad)'),
    ).toThrow(/exactly 4 parameters/);
    expect(() =>
      run(
        'def bad(t,s,i,u)[if s > 0.5 [return railinset(0.4,0)]] satinbetween([[0,0],[0,3]],[[2,0],[2,3]],@bad)',
      ),
    ).toThrow(/may finish without returning a value/);
    expect(() =>
      run(
        "def bad(t,s,i,u)[return [0.4,0,'x',0,0]] satinbetween([[0,0],[0,3]],[[2,0],[2,3]],@bad)",
      ),
    ).toThrow(/insetB.*finite number/);
  });

  it('selects auto underlay from mean rail width', () => {
    const narrow = run("underlay 'auto' satinbetween([[0,0],[0,6]], [[1.4,0],[1.4,6]])");
    expect(narrow.events.some((event) => event.u === 1)).toBe(false);

    const medium = run("underlay 'auto' satinbetween([[0,0],[0,6]], [[3.9,0],[3.9,6]])");
    expect(medium.events.some((event) => event.u === 1)).toBe(true);
    expect(medium.events.filter((event) => event.u === 1).every((event) => event.x === 1.95)).toBe(
      true,
    );

    const wide = run("underlay 'auto' satinbetween([[0,0],[0,6]], [[4.1,0],[4.1,6]])");
    expect(wide.events.some((event) => event.u === 1 && event.x !== 2.05)).toBe(true);
  });

  it('maps rails before pairing so transformed and pre-transformed geometry agree', () => {
    const transformed = events(
      `underlay 'off' scale 3 [
         satinbetween([[-2,0],[-2,10]], [[2,0],[2,10]])
       ]`,
    );
    const explicit = events(
      `underlay 'off'
       satinbetween([[-6,0],[-6,30]], [[6,0],[6,30]])`,
    );
    expect(transformed).toEqual(explicit);
  });

  it('chooses a deterministic seam for closed rails', () => {
    const source = `underlay 'off'
      satinbetween([[-5,0],[0,5],[5,0],[0,-5],[-5,0]],
                   [[-3,0],[0,3],[3,0],[0,-3],[-3,0]])`;
    const first = run(source);
    const second = run(source);
    expect(first.events).toEqual(second.events);
    expect(first.warnings).toContain('note: satinbetween chose a deterministic closed-rail seam');
  });

  it('commits immediately, preserves heading, and consumes no random draws', () => {
    const result = run(
      `seed 42 seth 37
       satinbetween([[-1,0],[-1,5]], [[1,0],[1,5]])
       print countat([1,5]) print heading print random(1000)`,
    );
    const control = run('seed 42 print random(1000)');
    expect(Number(result.printed[0])).toBeGreaterThan(0);
    expect(result.printed[1]).toBe('37');
    expect(result.printed[2]).toBe(control.printed[0]);
  });

  it('flushes an active spine column and preserves its sticky mode', () => {
    const result = run(
      `underlay 'off' satin 2 fd 4
       satinbetween([[-1,4],[-1,8]], [[1,4],[1,8]])
       fd 4`,
    );
    expect(result.warnings).toContain(
      'note: satinbetween flushed the active spine satin column first; the satin mode remains active',
    );
    expect(result.events.filter((event) => event.t === 'stitch').length).toBeGreaterThan(20);
  });

  it('is forbidden inside trace and fill recording', () => {
    expect(() => run('let p = trace [ satinbetween([[0,0],[0,2]], [[1,0],[1,2]]) ]')).toThrow(
      /cannot run inside trace/,
    );
    expect(() => run('beginfill satinbetween([[0,0],[0,2]], [[1,0],[1,2]]) endfill')).toThrow(
      /cannot run inside beginfill/,
    );
  });
});

describe('railspine', () => {
  it('returns the shared derived midpoint path', () => {
    const result = run(
      'let s = railspine([[-2,0],[-2,10]], [[2,0],[2,10]]) print first(s) print last(s)',
    );
    expect(result.printed).toEqual(['[0, 0]', '[0, 10]']);
  });
});
