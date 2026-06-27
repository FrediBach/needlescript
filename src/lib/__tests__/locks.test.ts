import { describe, it, expect } from 'vitest';
import { applyLocks } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

// ── helpers ────────────────────────────────────────────────────────────────

function stitch(x: number, y: number, c = 0): StitchEvent {
  return { t: 'stitch', x, y, c };
}
function jump(x: number, y: number, c = 0): StitchEvent {
  return { t: 'jump', x, y, c };
}
function color(x: number, y: number, c = 0): StitchEvent {
  return { t: 'color', x, y, c };
}
function trim(x: number, y: number, c = 0): StitchEvent {
  return { t: 'trim', x, y, c };
}

describe('applyLocks', () => {
  // ── basic locking ──────────────────────────────────────────────────────────
  describe('design start / end locking', () => {
    it('returns { events, locks } shape', () => {
      const result = applyLocks([stitch(0, 0), stitch(0, 5), stitch(0, 10)], 0.7);
      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('locks');
    });

    it('inserts tie-in at design start', () => {
      const events = [stitch(0, 0), stitch(0, 5), stitch(0, 10)];
      const { events: out, locks } = applyLocks(events, 0.7);
      // The output should be longer than the input
      expect(out.length).toBeGreaterThan(events.length);
      expect(locks).toBeGreaterThan(0);
    });

    it('inserts tie-off at design end', () => {
      const events = [stitch(0, 0), stitch(0, 5), stitch(0, 10)];
      const { locks } = applyLocks(events, 0.7);
      expect(locks).toBeGreaterThanOrEqual(2); // tie-in + tie-off
    });

    it('with L=0 nothing is added and locks=0', () => {
      // L=0 case is handled at the run() level; applyLocks with tiny L may add nothing
      const events = [stitch(0, 0), stitch(0, 1)];
      const { locks } = applyLocks(events, 0.05); // below 0.2 threshold → no lock
      expect(locks).toBe(0);
    });
  });

  // ── lock structure ─────────────────────────────────────────────────────────
  describe('lock stitch structure', () => {
    it('each lock adds exactly 4 stitches (2 forward + 2 back)', () => {
      // Minimal run: anchor + one stitch = a lock on each end = 2 locks × 4 = 8 extra
      const events = [stitch(0, 0), stitch(0, 10)];
      const { events: out, locks } = applyLocks(events, 0.7);
      const extraStitches = out.filter((e) => e.t === 'stitch').length - 2;
      expect(extraStitches).toBe(locks * 4);
    });

    it('lock stitches stay within L mm of the run endpoint', () => {
      // 2mm segment, 0.7 lock → lock stitches should lie within 0.7mm of
      // the first or last stitch (they go toward the neighboring stitch)
      const events = [stitch(0, 0), stitch(0, 2)];
      const { events: out } = applyLocks(events, 0.7);
      // All output stitches must be within 0.7mm of either (0,0) or (0,2)
      for (const e of out) {
        if (e.t !== 'stitch') continue;
        const nearStart = Math.hypot(e.x - 0, e.y - 0) <= 0.7 + 1e-9;
        const nearEnd = Math.hypot(e.x - 0, e.y - 2) <= 0.7 + 1e-9;
        const isOriginal = (e.x === 0 && e.y === 0) || (e.x === 0 && e.y === 2);
        expect(nearStart || nearEnd || isOriginal).toBe(true);
      }
    });
  });

  // ── gap detection ──────────────────────────────────────────────────────────
  describe('gap detection — cuts at jumps ≥ 4 mm', () => {
    it('short jump (< 4 mm) does not trigger a new lock pair', () => {
      const events = [
        stitch(0, 0),
        stitch(0, 2),
        jump(0, 5), // 3 mm jump — below threshold
        stitch(0, 5),
        stitch(0, 8),
      ];
      const { locks } = applyLocks(events, 0.7);
      // Only start + end lock (2), no extra in-between
      expect(locks).toBe(2);
    });

    it('long jump (≥ 4 mm) triggers extra lock pair', () => {
      const events = [
        stitch(0, 0),
        stitch(0, 2),
        jump(0, 10), // 8 mm jump — above threshold
        stitch(0, 10),
        stitch(0, 15),
      ];
      const { locks } = applyLocks(events, 0.7);
      expect(locks).toBeGreaterThan(2);
    });
  });

  // ── color change / trim ────────────────────────────────────────────────────
  describe('color change and trim trigger locks', () => {
    it('a color event between two runs causes locks on both sides', () => {
      const events = [stitch(0, 0), stitch(0, 5), color(0, 5), stitch(0, 5), stitch(0, 10)];
      const { locks } = applyLocks(events, 0.7);
      expect(locks).toBeGreaterThan(2);
    });

    it('a trim event between two runs causes locks', () => {
      const events = [stitch(0, 0), stitch(0, 5), trim(0, 5), stitch(0, 5), stitch(0, 10)];
      const { locks } = applyLocks(events, 0.7);
      expect(locks).toBeGreaterThan(2);
    });
  });

  // ── passthrough ───────────────────────────────────────────────────────────
  describe('passthrough — non-stitch events preserved', () => {
    it('color events are preserved in the output stream', () => {
      const events = [stitch(0, 0), stitch(0, 5), color(0, 5), stitch(0, 5), stitch(0, 10)];
      const { events: out } = applyLocks(events, 0.7);
      expect(out.some((e) => e.t === 'color')).toBe(true);
    });

    it('jump events are preserved', () => {
      const events = [stitch(0, 0), stitch(0, 2), jump(0, 8), stitch(0, 8)];
      const { events: out } = applyLocks(events, 0.7);
      expect(out.some((e) => e.t === 'jump')).toBe(true);
    });

    it('empty input returns empty output', () => {
      const { events: out, locks } = applyLocks([], 0.7);
      expect(out).toEqual([]);
      expect(locks).toBe(0);
    });

    it('jump-only input returns same events unchanged', () => {
      const events = [jump(0, 5), jump(0, 10)];
      const { events: out } = applyLocks(events, 0.7);
      expect(out).toEqual(events);
    });
  });
});
