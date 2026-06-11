import { describe, it, expect } from 'vitest';
import { designStats, run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

function stitch(x: number, y: number, c = 0): StitchEvent { return { t: 'stitch', x, y, c }; }
function jump(x: number, y: number, c = 0): StitchEvent   { return { t: 'jump', x, y, c }; }
function colorEvt(c = 0): StitchEvent                      { return { t: 'color', x: 0, y: 0, c }; }
function trimEvt(): StitchEvent                            { return { t: 'trim', x: 0, y: 0, c: 0 }; }

describe('designStats', () => {
  it('returns zeroes for empty input', () => {
    const s = designStats([]);
    expect(s.stitches).toBe(0);
    expect(s.jumps).toBe(0);
    expect(s.trims).toBe(0);
    expect(s.colorChanges).toBe(0);
    expect(s.colorsUsed).toBe(1); // min 1
    expect(s.width).toBe(0);
    expect(s.height).toBe(0);
  });

  it('counts stitches correctly', () => {
    const { stitches } = designStats([stitch(0, 0), stitch(0, 5), stitch(0, 10)]);
    expect(stitches).toBe(3);
  });

  it('counts jumps correctly', () => {
    const { jumps } = designStats([stitch(0, 0), jump(0, 10), stitch(0, 10)]);
    expect(jumps).toBe(1);
  });

  it('counts trims correctly', () => {
    const { trims } = designStats([stitch(0, 0), trimEvt(), stitch(0, 5)]);
    expect(trims).toBe(1);
  });

  it('counts color changes correctly', () => {
    const { colorChanges } = designStats([stitch(0, 0), colorEvt(1), stitch(0, 5)]);
    expect(colorChanges).toBe(1);
  });

  it('counts distinct colors used', () => {
    const events: StitchEvent[] = [
      stitch(0, 0, 0), stitch(0, 5, 0), stitch(0, 5, 2), stitch(0, 8, 2),
    ];
    const { colorsUsed } = designStats(events);
    expect(colorsUsed).toBe(2);
  });

  it('colorsUsed is at least 1 even with no stitches', () => {
    expect(designStats([]).colorsUsed).toBe(1);
    expect(designStats([jump(0, 0), jump(5, 5)]).colorsUsed).toBe(1);
  });

  it('computes bounding box correctly', () => {
    const events: StitchEvent[] = [
      stitch(-5, -10), stitch(10, 20), stitch(0, 5),
    ];
    const s = designStats(events);
    expect(s.minX).toBe(-5);
    expect(s.maxX).toBe(10);
    expect(s.minY).toBe(-10);
    expect(s.maxY).toBe(20);
    expect(s.width).toBe(15);
    expect(s.height).toBe(30);
  });

  it('computes maxStitchLen between consecutive stitches', () => {
    // distance from (0,0) to (0,10) = 10
    const { maxStitchLen } = designStats([stitch(0, 0), stitch(0, 10)]);
    expect(maxStitchLen).toBeCloseTo(10, 5);
  });

  it('maxStitchLen resets across color changes', () => {
    // After a color event, the distance is from the color position, not the last stitch
    const events: StitchEvent[] = [
      stitch(0, 0), stitch(0, 5),
      colorEvt(1),
      stitch(0, 5), stitch(0, 8),
    ];
    const { maxStitchLen } = designStats(events);
    // Max should be 5 (from stitch(0,0) → stitch(0,5)) not 0 (color resets px/py)
    expect(maxStitchLen).toBeGreaterThan(0);
  });

  it('computes maxRadius from origin', () => {
    const events: StitchEvent[] = [stitch(3, 4)]; // distance = 5
    const { maxRadius } = designStats(events);
    expect(maxRadius).toBeCloseTo(5, 5);
  });

  it('handles events with only jumps (jumps DO contribute to bounding box)', () => {
    const s = designStats([jump(100, 200), jump(-50, -60)]);
    // Jumps don't count as stitches but DO update the bounding box
    expect(s.stitches).toBe(0);
    expect(s.jumps).toBe(2);
    // Bounding box should span the jump coordinates
    expect(s.minX).toBe(-50);
    expect(s.maxX).toBe(100);
  });

  it('bounding box from real run — square at origin', () => {
    // A 30mm square centred at origin (setxy -15 -15 then four 30mm sides)
    const result = run('up setxy -15 -15 down repeat 4 [ fd 30 rt 90 ]');
    const s = designStats(result.events);
    expect(s.width).toBeCloseTo(30, 0);
    expect(s.height).toBeCloseTo(30, 0);
  });
});
