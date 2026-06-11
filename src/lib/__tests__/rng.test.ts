import { describe, it, expect } from 'vitest';
import { makeRNG } from '../engine.ts';

describe('makeRNG', () => {
  it('returns a function', () => {
    expect(typeof makeRNG(1)).toBe('function');
  });

  it('produces values in [0, 1)', () => {
    const rng = makeRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed produces identical sequences', () => {
    const a = makeRNG(99);
    const b = makeRNG(99);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = makeRNG(1);
    const b = makeRNG(2);
    const as = Array.from({ length: 10 }, () => a());
    const bs = Array.from({ length: 10 }, () => b());
    expect(as).not.toEqual(bs);
  });

  it('seed 0 works without crashing', () => {
    const rng = makeRNG(0);
    expect(() => rng()).not.toThrow();
  });

  it('large seed works', () => {
    const rng = makeRNG(0xffffffff);
    expect(() => rng()).not.toThrow();
  });

  it('produces a well-distributed sequence (no obvious bias)', () => {
    const rng = makeRNG(123);
    let above = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) if (rng() >= 0.5) above++;
    // Should be roughly 50% ± 2%
    expect(above / N).toBeGreaterThan(0.48);
    expect(above / N).toBeLessThan(0.52);
  });
});
