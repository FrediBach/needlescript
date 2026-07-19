import { describe, expect, it } from 'vitest';
import { run, satinSplitCount, satinSplitSeamFraction } from '../engine.ts';
import type { StitchEvent } from '../types.ts';

const clean = (events: readonly StitchEvent[]) =>
  events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));

const splitSettings = `
  lock 0 underlay 'off' density 0.5
  satinwide 'split' satinmaxwidth 6 satinsplitoverlap 0.5
`;

describe('wide satin-column splitting', () => {
  it('keeps warn mode on the byte-identical compatibility path', () => {
    const source = `lock 0 underlay 'edge' density 0.5 satin 10 fd 12 satin 0`;
    expect(run(`satinwide 'warn' satinmaxwidth 4 satinsplitoverlap 0 ${source}`)).toEqual(
      run(source),
    );
  });

  it('splits a straight wide spine into safe interlocking columns', () => {
    const result = run(`${splitSettings} satin 10 fd 12 satin 0`);
    expect(result.warnings).toContain(
      'note: satin split into 2 interlocking columns at a 6.0 mm ceiling',
    );
    const jumps = result.events.filter((event) => event.t === 'jump');
    expect(jumps.length).toBe(1);

    let longest = 0;
    let previous: StitchEvent | undefined;
    for (const event of result.events) {
      if (event.t === 'jump') {
        previous = undefined;
        continue;
      }
      if (event.t !== 'stitch') continue;
      if (previous)
        longest = Math.max(longest, Math.hypot(event.x - previous.x, event.y - previous.y));
      previous = event;
    }
    expect(longest).toBeLessThanOrEqual(6.01);

    const seam = result.events
      .filter((event) => event.t === 'stitch' && event.u !== 1 && Math.abs(event.x) < 1)
      .map((event) => Math.sign(event.x));
    expect(seam).toContain(-1);
    expect(seam).toContain(1);
  });

  it('pins the small split-column construction order', () => {
    const result = run(`
      lock 0 underlay 'off' density 1
      satinwide 'split' satinmaxwidth 6 satinsplitoverlap 0.5
      satin 10 fd 4 satin 0
    `);
    expect(result.events.map(({ t, x, y }) => ({ t, x, y }))).toEqual([
      { t: 'stitch', x: -2.375, y: 0 },
      { t: 'stitch', x: -5, y: 1 },
      { t: 'stitch', x: 0.25, y: 2 },
      { t: 'stitch', x: -5, y: 3 },
      { t: 'stitch', x: 0.25, y: 4 },
      { t: 'jump', x: 2.625, y: 4 },
      { t: 'stitch', x: -0.25, y: 3 },
      { t: 'stitch', x: 5, y: 2 },
      { t: 'stitch', x: -0.25, y: 1 },
      { t: 'stitch', x: 5, y: 0 },
    ]);
  });

  it('keeps every split construction underlay-before-topping', () => {
    const result = run(`
      lock 0 density 0.5 underlaypasses ['center'] underlaylen 1
      satinwide 'split' satinmaxwidth 6 satinsplitoverlap 0.5
      satin 10 fd 12 satin 0
    `);
    const groups: StitchEvent[][] = [[]];
    for (const event of result.events) {
      if (event.t === 'jump') groups.push([]);
      else if (event.t === 'stitch') groups.at(-1)!.push(event);
    }
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      const firstTopping = group.findIndex((event) => event.u !== 1);
      const lastUnderlay = group.findLastIndex((event) => event.u === 1);
      expect(lastUnderlay).toBeGreaterThan(0);
      expect(lastUnderlay).toBeLessThan(firstTopping === 0 ? group.length : firstTopping);
      expect(group.slice(lastUnderlay + 1).some((event) => event.u === 1)).toBe(false);
    }
  });

  it('does not turn the interlock band into a fixed density hotspot', () => {
    const result = run(`
      lock 0 underlay 'off' density 0.5 maxdensity 1.5
      satinwide 'split' satinmaxwidth 6 satinsplitoverlap 0.5
      satin 10 fd 12 satin 0
    `);
    expect(result.density.peak).toBeLessThan(1.2);
    expect(result.warnings.some((warning) => warning.includes('coverage hotspot'))).toBe(false);
  });

  it('preserves cap narrowing and replaces the stale warning-only path', () => {
    const result = run(`
      ${splitSettings}
      satincap 'point' satincaplen 2 satin 11 fd 12 satin 0
    `);
    expect(result.warnings.some((warning) => warning.includes('consider splitting'))).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringMatching(/satin split into 2/));
    const first = result.events.find((event) => event.t === 'stitch');
    expect(first).toMatchObject({ x: 0, y: 0 });
  });

  it('splits gentle transformed curves and varying-width rail pairs in hoop space', () => {
    const curved = run(`
      ${splitSettings}
      scale 1.5 [ satin 5 fd 8 rt 20 fd 8 satin 0 ]
    `);
    expect(curved.warnings).toContainEqual(expect.stringMatching(/transformed satin split into 2/));

    const tapered = run(`
      ${splitSettings}
      satinbetween([[-1, 0], [-5, 12]], [[1, 0], [5, 12]])
    `);
    expect(tapered.warnings).toContainEqual(expect.stringMatching(/satinbetween split into 2/));
    expect(
      tapered.events.every((event) => Number.isFinite(event.x) && Number.isFinite(event.y)),
    ).toBe(true);
  });

  it.each([
    {
      label: 'closed columns',
      source: `satin 10 arc 360 10 satin 0`,
      reason: /closed columns do not have an unambiguous split seam/,
    },
    {
      label: 'sharp corners',
      source: `satin 10 fd 8 rt 90 fd 8 satin 0`,
      reason: /spine has a sharp corner/,
    },
    {
      label: 'crossed rails',
      source: `satinbetween([[-5, 0], [5, 10]], [[5, 0], [-5, 10]])`,
      reason: /rail orientation reverses|rails cross/,
    },
  ])('refuses $label precisely and retains the unsplit geometry', ({ source, reason }) => {
    const split = run(`${splitSettings} ${source}`);
    const legacy = run(`lock 0 underlay 'off' density 0.5 ${source}`);
    expect(split.warnings).toContainEqual(expect.stringMatching(reason));
    expect(clean(split.events)).toEqual(clean(legacy.events));
  });

  it('refuses reporter-defined topology instead of improvising', () => {
    const result = run(`
      def shape(t, s, i, u) [ return satinrake(0.5, 5, 1) ]
      ${splitSettings}
      satin @shape fd 12 satin 0
    `);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/reporter-defined width and rake make the split topology ambiguous/),
    );
  });

  it('validates modes and physical ranges and restores all settings through stitchscope', () => {
    expect(() => run("satinwide 'SPLIT'")).not.toThrow();
    expect(() => run("satinwide 'slpit'")).toThrow(/did you mean "split"/);
    expect(() => run('satinmaxwidth 1.9')).toThrow(/between 2 and 12 mm/);
    expect(() => run('satinsplitoverlap 1.1')).toThrow(/between 0 and 1 mm/);

    const scoped = run(`
      ${splitSettings}
      stitchscope [ satinwide 'warn' satinmaxwidth 12 satinsplitoverlap 0 satin 10 fd 6 satin 0 ]
      up setxy 20 0 down satin 10 fd 6 satin 0
    `);
    expect(scoped.warnings.filter((warning) => warning.includes('split into 2'))).toHaveLength(1);
  });

  it('calculates bounded, alternating shared seams without RNG', () => {
    expect(satinSplitCount(10, 6, 0.5)).toBe(2);
    expect(satinSplitCount(18, 6, 0.5)).toBe(4);
    expect(satinSplitSeamFraction(1, 2, 0, 10, 0.5)).toBeCloseTo(0.525);
    expect(satinSplitSeamFraction(1, 2, 1, 10, 0.5)).toBeCloseTo(0.475);
  });
});
