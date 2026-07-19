import { describe, expect, it } from 'vitest';
import { fillStaggerOffset } from '../embroidery/fill-profile.ts';
import { run } from '../runtime/index.ts';
import { generateFill } from '../embroidery/machine/fill.ts';
import type { StitchEvent } from '../core/types.ts';
import { expectPositionalEvents } from './helpers/positional-events.ts';

const square = (size = 16) => `beginfill repeat 4 [ fd ${size} rt 90 ] endfill`;
const settings = "lock 0 autotrim 0 maxdensity 0 fillunderlay 'off' fillspacing 1 filllen 2 ";

function assertNoSubMinimumStitches(events: StitchEvent[]) {
  let previous: StitchEvent | null = null;
  for (const event of events) {
    if (event.t !== 'stitch') {
      if (event.t === 'jump' || event.t === 'color' || event.t === 'trim') previous = null;
      continue;
    }
    if (previous) {
      expect(Math.hypot(event.x - previous.x, event.y - previous.y)).toBeGreaterThanOrEqual(0.399);
    }
    previous = event;
  }
}

describe('fill stagger policies', () => {
  it('keeps explicit legacy byte-identical for fixed and programmable fills', () => {
    const fixed = `${settings}${square()}`;
    const programmable = `${settings}def bend(p) [ return p[0] ] fill dir @bend ${square()}`;

    expect(run(`fillstagger 'legacy' ${fixed}`)).toEqual(run(fixed));
    expect(run(`fillstagger 'legacy' ${programmable}`)).toEqual(run(programmable));
  });

  it('defines brick and a four-row progressive cycle as wrapped phase fractions', () => {
    const phases = (mode: 'brick' | 'progressive', rows: number[]) =>
      rows.map((row) => Number(fillStaggerOffset(mode, row, 0.65).toFixed(6)));
    expect(phases('brick', [0, 1, 2, 3])).toEqual([0, 0.65, 0, 0.65]);
    expect(phases('progressive', [0, 1, 2, 3, 4])).toEqual([0, 0.65, 0.95, 0.3, 0]);
  });

  it('applies the selected phase to fixed tatami rows', () => {
    const rings: [number, number][][] = [
      [
        [0, 0],
        [0, 10],
        [12, 10],
        [12, 0],
      ],
    ];
    const brick = generateFill(rings, {
      angle: 0,
      spacing: 1,
      stitchLen: 2,
      stagger: 'brick',
      staggerAmount: 0.5,
    });
    const progressive = generateFill(rings, {
      angle: 0,
      spacing: 1,
      stitchLen: 2,
      stagger: 'progressive',
      staggerAmount: 0.2,
    });

    expect(brick).not.toEqual(progressive);
    expect(
      new Set(progressive.filter((point) => !point.jump).map(({ x }) => x.toFixed(3))).size,
    ).toBeGreaterThan(6);
  });

  it('hashes random phases from row geometry without consuming seeded RNG', () => {
    const program = (firstSize: number) => `${settings}seed 42 fillstagger 'random'
${square(firstSize)}
up setxy 40 0 down
${square(16)}
print random(100)`;
    const a = run(program(8));
    const b = run(program(12));
    const second = (events: StitchEvent[]) => events.filter((event) => event.x >= 39);

    expect(second(a.events)).toEqual(second(b.events));
    expect(a.printed).toEqual(b.printed);
    expect(run(program(8)).events).toEqual(a.events);
  });

  it('adds policy phase to programmable reporter phase and supports length forms', () => {
    const shape = `def texture(p, row, v) [ return [1, 2, 0.25] ]
      def zero_phase(p, row, v) [ return [1, 2, 0] ]
      def rowlen(t, s, i, p) [ return 1 + i % 3 ]`;
    const base = run(
      `${settings}${shape} fillstagger 'brick' fillstaggeramount 0 fill shape @texture ${square()}`,
    );
    const offset = run(
      `${settings}${shape} fillstagger 'brick' fillstaggeramount 0.6 fill shape @texture ${square()}`,
    );
    const zeroPhase = run(
      `${settings}${shape} fillstagger 'brick' fillstaggeramount 0 fill shape @zero_phase ${square()}`,
    );
    const list = run(`${settings}fillstagger 'progressive' filllen [1, 2, 3] ${square()}`);
    const reporter = run(`${settings}${shape} fillstagger 'random' filllen @rowlen ${square()}`);

    expect(offset.events).not.toEqual(base.events);
    expect(base.events).not.toEqual(zeroPhase.events);
    assertNoSubMinimumStitches(list.events);
    assertNoSubMinimumStitches(reporter.events);
  });

  it('merges and spatially attributes policy-created short edge fragments', () => {
    const result = run(
      `lock 0 autotrim 0 maxdensity 0 fillunderlay 'off'
       fillspacing 1 filllen 1 fillstagger 'brick' fillstaggeramount 0.35
       ${square(4)}`,
    );

    expect(result.warnings).toContainEqual(
      expect.stringMatching(/fillstagger 'brick'.*edge fragment/),
    );
    expect(result.warningLocations).toContainEqual(
      expect.objectContaining({ kind: 'fill', lines: [3] }),
    );
    assertNoSubMinimumStitches(result.events);
  });

  it('validates modes and amount and restores both settings after stitchscope', () => {
    expect(() => run("fillstagger 'BrIcK'")).not.toThrow();
    expect(() => run("fillstagger 'progresive'")).toThrow(/did you mean "progressive"/);
    expect(() => run('fillstaggeramount -0.1')).toThrow(/between 0 and 1/);
    expect(() => run('fillstaggeramount 1.1')).toThrow(/between 0 and 1/);

    const scoped = run(
      `${settings}fillstagger 'brick' fillstaggeramount 0.7
       stitchscope [ fillstagger 'legacy' fillstaggeramount 0 ${square(8)} ]
       up setxy 20 0 down ${square(8)}`,
    );
    const manual = run(
      `${settings}fillstagger 'legacy' fillstaggeramount 0 ${square(8)}
       fillstagger 'brick' fillstaggeramount 0.7 up setxy 20 0 down ${square(8)}`,
    );

    expectPositionalEvents(scoped.events, manual.events);
  });

  it('leaves fill underlay on its resolved legacy phase path', () => {
    const source = `lock 0 autotrim 0 maxdensity 0 fillunderlaypasses ['tatami']
      fillunderlaylen 2 fillunderlayspacing 2 ${square()}`;
    const legacy = run(`fillstagger 'legacy' ${source}`);
    const random = run(`fillstagger 'random' ${source}`);
    const underlay = (events: StitchEvent[]) => events.filter((event) => event.u === 1);
    const topping = (events: StitchEvent[]) =>
      events.filter((event) => event.t === 'stitch' && event.u !== 1);

    expect(underlay(random.events)).toEqual(underlay(legacy.events));
    expect(topping(random.events)).not.toEqual(topping(legacy.events));
  });
});
