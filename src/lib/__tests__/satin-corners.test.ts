import { describe, expect, it } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../types.ts';

const MODES = ['continuous', 'fan', 'miter', 'split'] as const;
const ANGLES = [45, 90, 135] as const;

const corner = (mode: (typeof MODES)[number] | 'legacy', angle: number, extra = '') =>
  run(`
    lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin '${mode}'
    ${extra} satin 4 fd 10 rt ${angle} fd 10 satin 0
  `);

const stitches = (events: readonly StitchEvent[]) => events.filter((event) => event.t === 'stitch');

const cornerSignature = (events: readonly StitchEvent[]) =>
  stitches(events)
    .filter((event) => Math.hypot(event.x, event.y - 10) <= 4)
    .map((event) => [Number(event.x.toFixed(3)), Number(event.y.toFixed(3))]);

describe('satin corner strategies', () => {
  it('keeps the default and explicit legacy path byte-identical', () => {
    const source = `lock 0 underlay 'edge' density 0.5 satin 4 fd 10 rt 90 fd 10 satin 0`;
    expect(run(`satinjoin 'legacy' satincorner 35 ${source}`)).toEqual(run(source));
  });

  it.each(ANGLES)('has stable, distinct event patterns at a %s-degree turn', (angle) => {
    const signatures = MODES.map((mode) => {
      const first = corner(mode, angle);
      const second = corner(mode, angle);
      expect(first).toEqual(second);
      expect(first.warnings).toEqual([]);
      return JSON.stringify(cornerSignature(first.events));
    });
    expect(new Set(signatures).size).toBe(MODES.length);
  });

  it('uses satincorner as the physical sharp-turn threshold', () => {
    const legacy = corner('legacy', 45);
    const smooth = run(`
      lock 0 underlay 'off' density 0.5 satinjoin 'continuous' satincorner 60
      satin 4 fd 10 rt 45 fd 10 satin 0
    `);
    const sharp = corner('continuous', 45);
    expect(smooth.events).toEqual(legacy.events);
    expect(sharp.events).not.toEqual(legacy.events);
  });

  it('bounds fan penetrations and stays below the configured density limit at defaults', () => {
    for (const angle of ANGLES) {
      const fan = corner('fan', angle);
      const nearCorner = stitches(fan.events).filter(
        (event) => Math.hypot(event.x, event.y - 10) <= 2.05,
      );
      expect(nearCorner.length).toBeLessThanOrEqual(10);

      for (const mode of MODES) {
        const result = corner(mode, angle);
        expect(result.density.peak).toBeLessThanOrEqual(3.5);
        expect(result.warnings.some((warning) => warning.includes('same hole'))).toBe(false);
      }
    }
  });

  it('keeps underlay continuous and never inserts an implicit trim or color change', () => {
    for (const mode of ['miter', 'split'] as const) {
      const result = run(`
        lock 0 autotrim 3 underlaypasses ['center'] underlaylen 1
        density 0.5 satincorner 35 satinjoin '${mode}'
        satin 4 fd 10 rt 90 fd 10 satin 0
      `);
      expect(result.events.some((event) => event.t === 'trim' || event.t === 'color')).toBe(false);
      const underlay = result.events.filter((event) => event.t === 'stitch' && event.u === 1);
      expect(underlay.some((event) => event.y < 9)).toBe(true);
      expect(underlay.some((event) => event.x > 1)).toBe(true);
    }
  });

  it('falls back with a source warning when a corner has too little support', () => {
    for (const mode of ['fan', 'miter', 'split'] as const) {
      const result = run(`
        lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin '${mode}'
        satin 4 fd 0.5 rt 90 fd 0.5 satin 0
      `);
      expect(result.warnings).toContainEqual(
        expect.stringMatching(
          new RegExp(`${mode} join cannot be constructed safely.*using continuous`),
        ),
      );
    }
  });

  it('retains rail-pair checkpoint correspondence while applying a join', () => {
    const railA = `[[-2, 0], [-2, 12], [18, 12]]`;
    const railB = `[[2, 0], [2, 8], [12, 8]]`;
    const checkpoint = `[[[-2, 12], [2, 8]]]`;
    const withCheckpoint = run(`
      lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin 'fan'
      satinbetween(${railA}, ${railB}, ${checkpoint})
    `);
    const withoutCheckpoint = run(`
      lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin 'fan'
      satinbetween(${railA}, ${railB})
    `);
    expect(withCheckpoint.warnings.some((warning) => warning.includes('using continuous'))).toBe(
      false,
    );
    expect(withCheckpoint.events).toEqual(
      run(`
        lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin 'fan'
        satinbetween(${railA}, ${railB}, ${checkpoint})
      `).events,
    );
    expect(withCheckpoint.events).not.toEqual(withoutCheckpoint.events);
  });

  it('shares physical corner construction with transformed and programmable spines', () => {
    const direct = corner('fan', 90);
    const transformed = run(`
      lock 0 underlay 'off' density 0.5 satincorner 35 satinjoin 'fan'
      scale 2 [ satin 2 fd 5 rt 90 fd 5 satin 0 ]
    `);
    const programmable = run(`
      def shape(t, s, i, u) [ return satinpair(0.5, 2) ]
      lock 0 underlay 'off' satincorner 35 satinjoin 'fan'
      satin @shape fd 10 rt 90 fd 10 satin 0
    `);
    const geometry = (events: readonly StitchEvent[]) =>
      events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));
    expect(geometry(transformed.events)).toEqual(geometry(direct.events));
    expect(geometry(programmable.events)).toEqual(geometry(direct.events));
  });

  it('validates modes, the angle range, and stitchscope restoration', () => {
    expect(() => run("satinjoin 'FAN'")).not.toThrow();
    expect(() => run("satinjoin 'faan'")).toThrow(/did you mean "fan"/);
    expect(() => run('satincorner 4')).toThrow(/between 5 and 175 degrees/);
    expect(() => run('satincorner 176')).toThrow(/between 5 and 175 degrees/);

    const scoped = run(`
      lock 0 underlay 'off' density 0.5 satinjoin 'legacy' satincorner 60
      stitchscope [ satinjoin 'fan' satincorner 35 satin 4 fd 10 rt 45 fd 10 satin 0 ]
      up setxy 20 0 seth 0 down satin 4 fd 10 rt 45 fd 10 satin 0
    `);
    const second = stitches(scoped.events).filter((event) => event.x > 15);
    const legacySecond = stitches(
      run(`
        lock 0 underlay 'off' density 0.5 satinjoin 'legacy' satincorner 60
        up setxy 20 0 seth 0 down satin 4 fd 10 rt 45 fd 10 satin 0
      `).events,
    ).filter((event) => event.x > 15);
    const geometry = (events: readonly StitchEvent[]) => events.map(({ x, y, u }) => ({ x, y, u }));
    expect(geometry(second)).toEqual(geometry(legacySecond).slice(1));
  });
});
