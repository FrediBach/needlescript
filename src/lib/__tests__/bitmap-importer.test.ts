import { describe, expect, it } from 'vitest';
import { emitBitmapCode, processBitmap, uniqueBitmapPrefix } from '../bitmap-importer.ts';
import { run } from '../engine.ts';

const pixels = new Uint8ClampedArray([
  0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255,
]);

const settings = {
  crop: { x: 0, y: 0, width: 2, height: 2 },
  columns: 8,
  rows: 8,
  fabric: '#f5efe4',
  threads: ['#2B2B2B'],
  invert: false,
  steps: 2,
  dither: false,
  mm: 40,
};

describe('bitmap importer', () => {
  it('composites alpha, quantizes to full-range hex, and emits readable rows', () => {
    const processed = processBitmap({ width: 2, height: 2, data: pixels }, settings);
    expect(processed.plates[0].rows).toHaveLength(8);
    expect(processed.plates[0].rows.every((row) => /^[0f]{8}$/.test(row))).toBe(true);
    const code = emitBitmapCode(processed, settings, {
      filename: 'Checker.png',
      prefix: 'checker',
      source: '',
      includeHelpers: true,
    });
    expect(code).toContain('let checker = [');
    expect(() =>
      run(`${code}\nprint bmsample(checker, checker_w, checker_h, checker_mm, 0, 0)`),
    ).not.toThrow();
  });

  it('avoids existing globals when choosing a prefix', () => {
    expect(uniqueBitmapPrefix('hello.png', 'let hello = 1')).toBe('hello_2');
  });
});
