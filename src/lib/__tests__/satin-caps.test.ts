import { describe, expect, it } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../types.ts';

const straight = (settings = '') =>
  run(`lock 0 underlay 'off' density 0.5 satin 4 ${settings} fd 12 satin 0`);

const stitches = (events: readonly StitchEvent[]) => events.filter((event) => event.t === 'stitch');

describe('satin cap strategies', () => {
  it('keeps the default and explicit legacy path byte-identical', () => {
    const source = `lock 0 underlay 'edge' density 0.5 satin 4 fd 12 satin 0`;
    expect(run(`satincap 'legacy' ${source}`)).toEqual(run(source));
  });

  it('constructs butt, taper, point, and round tips with distinct profiles', () => {
    const butt = stitches(straight("satincap 'butt'").events);
    const taper = stitches(straight("satincap 'taper' satincaplen 2").events);
    const point = stitches(straight("satincap 'point' satincaplen 2").events);
    const round = stitches(straight("satincap 'round' satincaplen 2").events);

    const nearStart = (events: StitchEvent[]) => events.find((event) => event.y > 0.4)!;
    expect(Math.abs(nearStart(butt).x)).toBeCloseTo(2);
    expect(Math.abs(nearStart(taper).x)).toBeLessThan(2);
    expect(Math.abs(nearStart(point).x)).toBeLessThan(Math.abs(nearStart(taper).x));
    expect(Math.abs(nearStart(round).x)).toBeGreaterThan(Math.abs(nearStart(point).x));

    expect(Math.abs(butt.at(-1)!.x)).toBeCloseTo(2);
    expect(Math.abs(taper.at(-1)!.x)).toBeCloseTo(0.5);
    expect(point.at(-1)).toMatchObject({ x: 0, y: 12 });
    expect(round.at(-1)).toMatchObject({ x: 0, y: 12 });
  });

  it('merges coincident tip penetrations instead of emitting zero-length stitches', () => {
    for (const mode of ['point', 'round'] as const) {
      const result = straight(`satincap '${mode}' satincaplen 2`);
      const sewn = stitches(result.events);
      for (let index = 1; index < sewn.length; index++)
        expect(
          Math.hypot(sewn[index].x - sewn[index - 1].x, sewn[index].y - sewn[index - 1].y),
        ).toBeGreaterThan(0);
    }
  });

  it('shortens underlay beneath a narrowing cap', () => {
    const result = run(`
      lock 0 underlaypasses ['edge'] underlaylen 1
      satincap 'point' satincaplen 2 density 0.5 satin 4 fd 12 satin 0
    `);
    const underlay = result.events.filter((event) => event.t === 'stitch' && event.u === 1);
    expect(underlay.length).toBeGreaterThan(0);
    for (const event of underlay) {
      const tipDistance = Math.min(event.y, 12 - event.y);
      const progress = Math.min(Math.max(tipDistance / 2, 0), 1);
      const envelope = 2 * progress * progress * (3 - 2 * progress);
      expect(Math.abs(event.x)).toBeLessThanOrEqual(envelope + 1e-9);
    }
  });

  it('applies caps to rail-pair satin in physical hoop space', () => {
    const result = run(`
      lock 0 underlay 'off' density 0.5 satincap 'point' satincaplen 2
      satinbetween([[-2, 0], [-2, 12]], [[2, 0], [2, 12]])
    `);
    const sewn = stitches(result.events);
    expect(sewn[0]).toMatchObject({ x: 0, y: 0 });
    expect(sewn.at(-1)).toMatchObject({ x: 0, y: 12 });
    expect(
      Math.max(...sewn.filter((event) => event.y < 2).map((event) => Math.abs(event.x))),
    ).toBeLessThan(2);
  });

  it('shares physical cap geometry with transformed and programmable spines', () => {
    const direct = straight("satincap 'point' satincaplen 2");
    const transformed = run(`
      lock 0 underlay 'off' density 0.5 satincap 'point' satincaplen 2
      scale 2 [ satin 2 fd 6 satin 0 ]
    `);
    const geometry = (events: readonly StitchEvent[]) =>
      events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }));
    expect(geometry(transformed.events)).toEqual(geometry(direct.events));

    const programmable = run(`
      def shape(t, s, i, u) [ return satinpair(0.5, 2) ]
      lock 0 underlay 'off' satincap 'point' satincaplen 2 satin @shape fd 12 satin 0
    `);
    expect(stitches(programmable.events).at(-1)).toMatchObject({ x: 0, y: 12 });
  });

  it('falls back from round to point when a true semicircle cannot fit', () => {
    const result = run(
      `lock 0 underlay 'off' satincap 'round' satincaplen 2 satin 6 fd 12 satin 0`,
    );
    expect(result.warnings).toContainEqual(expect.stringMatching(/round start cap.*using point/));
    expect(result.warnings).toContainEqual(expect.stringMatching(/round end cap.*using point/));
    expect(stitches(result.events).at(-1)).toMatchObject({ x: 0, y: 12 });
  });

  it('leaves closed columns unchanged and restores cap settings through stitchscope', () => {
    const closed = `lock 0 underlay 'off' density 0.5 satin 4 arc 360 10 satin 0`;
    expect(run(`satincap 'point' ${closed}`)).toEqual(run(closed));

    const scoped = run(`
      lock 0 underlay 'off' density 0.5 satincap 'butt' satincaplen 3
      stitchscope [ satincap 'point' satincaplen 1 satin 4 fd 6 satin 0 ]
      up setxy 10 0 down satin 4 fd 6 satin 0
    `);
    const secondEnd = stitches(scoped.events)
      .filter((event) => event.x > 8)
      .at(-1)!;
    expect(Math.abs(secondEnd.x - 10)).toBeCloseTo(2);
  });

  it('validates the shared mode registry and physical cap-length range', () => {
    expect(() => run("satincap 'TAPER'")).not.toThrow();
    expect(() => run("satincap 'tapre'")).toThrow(/did you mean "taper"/);
    expect(() => run('satincaplen 0.3')).toThrow(/between 0.4 and 20 mm/);
    expect(() => run('satincaplen 21')).toThrow(/between 0.4 and 20 mm/);
  });
});
