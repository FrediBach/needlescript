import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';

describe('standard-library modules', () => {
  it('imports an exported reporter under a local alias', () => {
    const result = run(`
      import std.textures.radialdir as radial
      print radial([0, 0])
      print radial([0, 10])
      print radial([10, 0])
    `);
    expect(result.printed).toEqual(['0', '0', '90']);
  });

  it('lets imported reporters be passed by reference', () => {
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        fill dir @radial
        beginfill
          repeat 4 [ fd 10 rt 90 ]
        endfill
      `),
    ).not.toThrow();
  });

  it('accepts export-prefixed definitions in a source program', () => {
    const result = run(`
      export def twice(n) [ return n * 2 ]
      print twice(6)
    `);
    expect(result.printed).toEqual(['12']);
  });

  it('reports unknown modules and exports clearly', () => {
    expect(() => run('import std.missing.thing as thing')).toThrow(
      /Unknown standard-library module "std\.missing"/,
    );
    expect(() => run('import std.textures.missing as thing')).toThrow(/does not export "missing"/);
  });

  it('rejects non-standard imports for now', () => {
    expect(() => run('import my.textures.radialdir as radial')).toThrow(
      /Only bundled standard-library imports are available for now/,
    );
  });

  it('rejects duplicate aliases and local collisions', () => {
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        import std.textures.radialdir as radial
      `),
    ).toThrow(/Duplicate import alias "radial"/);
    expect(() =>
      run(`
        import std.textures.radialdir as radial
        def radial(p) [ return 0 ]
      `),
    ).toThrow(/both imported and defined locally/);
  });
});
