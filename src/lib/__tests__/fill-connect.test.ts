import { describe, expect, it } from 'vitest';
import { mScale } from '../geometry/affine.ts';
import { run } from '../runtime/index.ts';
import { Machine } from '../embroidery/machine/index.ts';
import {
  generateFill,
  segmentInsideCompoundRegion,
  type GeneratedFillConnector,
} from '../embroidery/machine/fill.ts';

const outer: [number, number][] = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];
const hole: [number, number][] = [
  [8, 8],
  [12, 8],
  [12, 12],
  [8, 12],
];

class InspectableMachine extends Machine {
  connectorRecords() {
    return this.fillConnectorRecords;
  }
}

const customPaths = (policy: string, autoTrim = 0, plan = '') => `
  lock 0 maxdensity 0 autotrim ${autoTrim} fillunderlay 'off'
  ${plan} fillconnect '${policy}'
  fill paths [[[2, 10], [6, 10]], [[14, 10], [18, 10]]]
  beginfill
    setxy 0 20 setxy 20 20 setxy 20 0 setxy 0 0
    up setxy 8 8 down setxy 12 8 setxy 12 12 setxy 8 12
  endfill
`;

describe('fill connector policies', () => {
  it('tests complete segments against holes, concavity, and the edge margin', () => {
    expect(segmentInsideCompoundRegion([outer, hole], [2, 10], [18, 10])).toBe(false);
    expect(segmentInsideCompoundRegion([outer, hole], [2, 6], [18, 6])).toBe(true);
    expect(segmentInsideCompoundRegion([outer], [0, 2], [20, 2])).toBe(true);
    expect(segmentInsideCompoundRegion([outer], [0, 2], [0, 18])).toBe(false);

    const concave: [number, number][] = [
      [0, 0],
      [12, 0],
      [12, 12],
      [8, 12],
      [8, 4],
      [4, 4],
      [4, 12],
      [0, 12],
    ];
    expect(segmentInsideCompoundRegion([concave], [2, 10], [10, 10])).toBe(false);
    expect(segmentInsideCompoundRegion([concave], [1, 2], [11, 2])).toBe(true);
  });

  it('keeps legacy output exact and jump/trim row penetrations identical', () => {
    const rings = [outer];
    const settings = { angle: 0, spacing: 2, stitchLen: 3 } as const;
    expect(generateFill(rings, { ...settings, connectorPolicy: 'legacy' })).toEqual(
      generateFill(rings, settings),
    );

    const jump = generateFill(rings, { ...settings, connectorPolicy: 'jump' });
    const trim = generateFill(rings, {
      ...settings,
      connectorPolicy: 'trim',
      connectorTrimThresholdMM: 0.5,
    });
    expect(trim.map(({ x, y, jump }) => ({ x, y, jump }))).toEqual(jump);
    expect(trim.some((point) => point.trim)).toBe(true);

    const customLegacy = customPaths('legacy');
    expect(run(customLegacy)).toEqual(run(customLegacy.replace("fillconnect 'legacy'", '')));
    const programmable = `
      lock 0 autotrim 0 maxdensity 0 fillunderlay 'off' fillspacing 2 filllen 3
      def bend(p) [ return p[0] ]
      fill dir @bend
      beginfill setxy 0 12 setxy 12 12 setxy 12 0 setxy 0 0 endfill
    `;
    expect(run(`fillconnect 'legacy' ${programmable}`)).toEqual(run(programmable));
  });

  it('jumps across a custom-path hole and does not count the travel as topping coverage', () => {
    const inside = run(customPaths('inside'));
    const jump = run(customPaths('jump'));
    const crossing = (result: ReturnType<typeof run>) =>
      result.events.find((event) => event.x === 14 && event.y === 10);

    expect(crossing(inside)?.t).toBe('jump');
    expect(crossing(jump)?.t).toBe('jump');
    expect(jump.density).toEqual(run(customPaths('trim')).density);
  });

  it('records physical hoop-space custom-path classifications without reordering paths', () => {
    const machine = new InspectableMachine();
    machine.fillConnect = 'jump';
    machine.fillUnderlayMode = 'off';
    machine.fillArmed = true;
    machine.fillPathsStatic = [
      [
        [1, 1],
        [9, 1],
      ],
      [
        [9, 9],
        [1, 9],
      ],
    ];
    machine.pushTransform(mScale(2));
    machine.beginFill();
    machine.setXY(0, 10);
    machine.setXY(10, 10);
    machine.setXY(10, 0);
    machine.setXY(0, 0);
    machine.endFill();

    expect(machine.connectorRecords()).toHaveLength(1);
    expect(machine.connectorRecords()[0]).toMatchObject({
      policy: 'jump',
      action: 'jump',
      from: [18, 2],
      to: [18, 18],
      distanceMM: 16,
    } satisfies Partial<GeneratedFillConnector>);
    const connectorIndex = machine.events.findIndex(
      (event) => event.t === 'jump' && event.x === 18 && event.y === 18,
    );
    expect(machine.events[connectorIndex - 1]).toMatchObject({ t: 'stitch', x: 18, y: 2 });
  });

  it('makes trim boundaries explicit and leaves planner/auto-trim run detection intact', () => {
    const explicit = run(customPaths('trim'));
    const targetIndex = explicit.events.findIndex(
      (event) => event.t === 'jump' && event.x === 14 && event.y === 10,
    );
    expect(explicit.events[targetIndex - 1]?.t).toBe('trim');

    const automatic = run(customPaths('jump', 5, "plan 'nearest'"));
    const plannedTarget = automatic.events.findIndex(
      (event) => event.t === 'jump' && event.x === 14 && event.y === 10,
    );
    expect(automatic.events[plannedTarget - 1]?.t).toBe('trim');
    expect(automatic.plan?.runs).toBeGreaterThanOrEqual(2);
  });

  it('validates and scopes the shared connector mode registry', () => {
    expect(() => run("fillconnect 'InSiDe'")).not.toThrow();
    expect(() => run("fillconnect 'insde'")).toThrow(/did you mean "inside"/);
    expect(() => run('fillconnect 1')).toThrow(/expects a string mode/);

    const scoped = run(
      customPaths('jump').replace(
        "fillconnect 'jump'",
        "fillconnect 'jump' stitchscope [ fillconnect 'legacy' ]",
      ),
    );
    expect(
      scoped.events.some((event) => event.t === 'jump' && event.x === 14 && event.y === 10),
    ).toBe(true);
  });
});
