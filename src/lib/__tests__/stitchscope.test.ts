import { describe, expect, it, vi } from 'vitest';
import { parse, run, tokenize } from '../engine.ts';
import { Machine } from '../machine.ts';

describe('stitchscope parsing', () => {
  it('produces a dedicated block AST node', () => {
    const program = parse(tokenize('stitchscope [ stitchlen 1 fd 5 ]'));
    expect(program).toHaveLength(1);
    expect(program[0]).toMatchObject({
      k: 'stitchscope',
      line: 1,
      body: [
        { k: 'cmd', name: 'stitchlen' },
        { k: 'cmd', name: 'fd' },
      ],
    });
  });

  it('requires a block and is a reserved Core word', () => {
    expect(() => parse(tokenize('stitchscope fd 5'))).toThrow(/Expected \[/);
    expect(() => parse(tokenize('def stitchscope() [ ]'))).toThrow(/can't be redefined/);
    expect(() => parse(tokenize('let stitchscope = 1'))).toThrow(/reserved word/);
  });

  it('counts an unconditional scoped return in reporter-path analysis', () => {
    expect(run('def answer() [ stitchscope [ return 42 ] ] print answer()').printed).toEqual([
      '42',
    ]);
  });
});

describe('stitchscope runtime semantics', () => {
  it('matches the equivalent manual reset program', () => {
    const scoped = run('lock 0 stitchlen 2.5 stitchscope [ stitchlen 1 bean 3 fd 6 ] fd 6');
    const manual = run('lock 0 stitchlen 2.5 stitchlen 1 bean 3 fd 6 bean 1 stitchlen 2.5 fd 6');
    expect(scoped.events).toEqual(manual.events);
  });

  it('restores nested scopes in LIFO order', () => {
    const scoped = run(
      'lock 0 stitchlen 2.5 stitchscope [ stitchlen 3 stitchscope [ stitchlen 1 fd 6 ] fd 6 ] fd 6',
    );
    const manual = run(
      'lock 0 stitchlen 2.5 stitchlen 3 stitchlen 1 fd 6 stitchlen 3 fd 6 stitchlen 2.5 fd 6',
    );
    expect(scoped.events).toEqual(manual.events);
  });

  it('flushes satin columns at both scope boundaries', () => {
    const scoped = run('lock 0 satin 3 fd 5 stitchscope [ satin 0 fd 5 ] fd 5');
    const manual = run('lock 0 satin 3 fd 5 satin 0 fd 5 satin 3 fd 5');
    expect(scoped.events).toEqual(manual.events);
  });

  it('restores after return, break, and continue', () => {
    const baseline = run('lock 0 stitchlen 2.5 fd 10').events;

    expect(
      run('lock 0 stitchlen 2.5 def leave() [ stitchscope [ stitchlen 1 return ] ] leave() fd 10')
        .events,
    ).toEqual(baseline);
    expect(
      run('lock 0 stitchlen 2.5 repeat 2 [ stitchscope [ stitchlen 1 break ] ] fd 10').events,
    ).toEqual(baseline);
    expect(
      run('lock 0 stitchlen 2.5 repeat 2 [ stitchscope [ stitchlen 1 continue ] ] fd 10').events,
    ).toEqual(baseline);
  });

  it('restores after a runtime error in the body', () => {
    const restore = vi.spyOn(Machine.prototype, 'restoreConstructionConfig');
    try {
      expect(() => run('stitchlen 2.5 stitchscope [ stitchlen 1 assert 0 ]')).toThrow(
        /assertion failed/,
      );
      expect(restore).toHaveBeenCalledOnce();
      const machine = restore.mock.instances[0] as Machine;
      expect(machine.stitchLen).toBe(2.5);
      expect(machine.stitchLenReporter).toBeNull();
    } finally {
      restore.mockRestore();
    }
  });

  it('restores even when a buffered reporter throws during the exit flush', () => {
    const restore = vi.spyOn(Machine.prototype, 'restoreConstructionConfig');
    try {
      expect(() =>
        run('stitchlen 2.5 def bad(t, s, i, p) [ return 0 ] stitchscope [ stitchlen @bad fd 5 ]'),
      ).toThrow(/advance must be greater than 0/);
      expect(restore).toHaveBeenCalledOnce();
      const machine = restore.mock.instances[0] as Machine;
      expect(machine.stitchLen).toBe(2.5);
      expect(machine.stitchLenReporter).toBeNull();
    } finally {
      restore.mockRestore();
    }
  });

  it('leaves color and turtle state where the body leaves them', () => {
    const result = run('lock 0 stitchscope [ fd 5 color 2 rt 90 ] fd 5');
    const last = result.events.filter((event) => event.t === 'stitch').at(-1);
    expect(last).toMatchObject({ x: 5, y: 5, c: 2 });
    expect(result.events.some((event) => event.t === 'color')).toBe(true);
  });

  it('does not restore RNG consumption', () => {
    const scoped = run('seed 7 stitchscope [ print random(100) ] print random(100)');
    const direct = run('seed 7 print random(100) print random(100)');
    expect(scoped.printed).toEqual(direct.printed);
  });

  it('composes normally with transform blocks', () => {
    const scoped = run('lock 0 translate 10 5 [ stitchscope [ stitchlen 1 fd 5 ] fd 5 ]');
    const manual = run('lock 0 translate 10 5 [ stitchlen 1 fd 5 stitchlen 2.5 fd 5 ]');
    expect(scoped.events).toEqual(manual.events);
  });

  it('rejects a scope boundary during active fill recording', () => {
    expect(() => run('beginfill stitchscope [ fd 5 ]')).toThrow(/active fill/);
    expect(() => run('stitchscope [ beginfill fd 5 ]')).toThrow(
      /cannot restore construction configuration during an active fill/,
    );
  });

  it('restores an unused outer fill arm after an inner replacement', () => {
    const definitions =
      "lock 0 fillunderlay 'off' def north(p) [ return 0 ] def east(p) [ return 90 ] ";
    const boundary = 'beginfill repeat 4 [ fd 8 rt 90 ] endfill';
    const baseline = run(`${definitions} fill dir @north ${boundary}`);
    const scoped = run(`${definitions} fill dir @north stitchscope [ fill dir @east ] ${boundary}`);

    expect(scoped.events).toEqual(baseline.events);
    expect(
      scoped.warnings.filter((warning) => warning.includes('replaced before use')),
    ).toHaveLength(1);
    expect(scoped.warnings.some((warning) => warning.includes('was never used'))).toBe(false);
  });

  it('discards an unused inner fill arm when no outer arm exists', () => {
    const result = run('def north(p) [ return 0 ] stitchscope [ fill dir @north ]');
    expect(result.warnings.some((warning) => warning.includes('was never used'))).toBe(false);
  });
});

describe('stitchscope inside trace', () => {
  it('keeps construction commands inert and restores the outer machine configuration', () => {
    const scoped = run(
      'lock 0 stitchlen 3 let p = trace [ stitchscope [ stitchlen 1 fd 5 ] fd 5 ] fd 6 print p',
    );
    const baseline = run('lock 0 stitchlen 3 let p = trace [ fd 5 fd 5 ] fd 6 print p');

    expect(scoped.events).toEqual(baseline.events);
    expect(scoped.printed).toEqual(baseline.printed);
    expect(scoped.warnings.some((warning) => warning.includes('stitchlen inside trace'))).toBe(
      true,
    );
  });
});
