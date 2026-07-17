import { describe, expect, it } from 'vitest';
import { colorDist, hsl, lerpColor, parseColor, rgb, run } from '../engine.ts';

describe('native colors', () => {
  it.each([
    ['#f60', '#ff6600'],
    ['#E94560', '#e94560'],
    ['crimson', '#dc143c'],
    ['Gold', '#ffd700'],
  ])('normalizes %s', (input, expected) => {
    expect(parseColor(input)).toBe(expected);
  });

  it('rejects malformed, alpha, and unknown colors loudly', () => {
    expect(() => parseColor('#ff00')).toThrow(/#rgb or #rrggbb/);
    expect(() => parseColor('#11223344')).toThrow(/opaque/);
    expect(() => parseColor('crimsom')).toThrow(/crimson/);
  });

  it('implements deterministic color math', () => {
    expect(rgb(255, 0, 127.6)).toBe('#ff0080');
    expect(hsl(0, 1, 0.5)).toBe('#ff0000');
    expect(lerpColor('#000000', '#ffffff', 0.5, 'rgb')).toBe('#808080');
    expect(colorDist('#000000', '#000000')).toBe(0);
    expect(colorDist('#000000', '#ffffff')).toBeCloseTo(1, 6);
  });

  it('declares palette and background metadata without changing event color indices', () => {
    const result = run("palette ['#112233', 'crimson'] background 'linen' fd 2 color 1 fd 2");
    expect(result.background).toBe('#faf0e6');
    expect(result.colorTable.slice(0, 2)).toMatchObject([
      { slot: 1, hex: '#112233', source: 'palette' },
      { slot: 2, hex: '#dc143c', name: 'crimson', source: 'palette' },
    ]);
    expect(result.events.some((event) => event.t === 'stitch' && event.c === 1)).toBe(true);
  });

  it('resolves string colors to the lowest slot and auto-extends exactly once', () => {
    const result = run(
      "palette ['red', '#ff0000'] color 'red' fd 2 color '#123456' fd 2 color '#123456' fd 2",
    );
    expect(result.colorTable[0]).toMatchObject({ hex: '#ff0000', source: 'palette' });
    expect(result.colorTable[2]).toMatchObject({ hex: '#123456', source: 'auto' });
    expect(result.warnings.filter((warning) => warning.includes('new thread slot'))).toHaveLength(
      1,
    );
  });

  it('exposes color reporters and pure functions to programs', () => {
    const result = run(
      "background '#101418' palette ['navy'] print colorindex() print colorhex() print backgroundcolor() print hexparts(rgb(255, 0, 0))",
    );
    expect(result.printed).toEqual(['1', '#000080', '#101418', '[255, 0, 0]']);
  });

  it('enforces directive placement', () => {
    expect(() => run("color 1 palette ['red']")).toThrow(/before color or stop/);
    expect(() => run("fd 1 background 'black'")).toThrow(/before the first stitch/);
    expect(() => run("palette ['red'] palette ['blue']")).toThrow(/already set/);
  });
});
