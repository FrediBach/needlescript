import { describe, expect, it } from 'vitest';
import {
  compensateOpenPathEnds,
  compensationForHeading,
  compensationTensor,
} from '../embroidery/directional-compensation.ts';
import { run } from '../engine.ts';
import type { RunResult, StitchEvent } from '../engine.ts';

const SETTINGS =
  "compensation 'directional' fabric 'woven' fabricstretch 0 1 fillunderlay 'off' lock 0 autotrim 0 maxdensity 0 fillspacing 2 filllen 2";
const SQUARE = 'beginfill repeat 4 [ fd 20 rt 90 ] endfill';

function topping(result: RunResult): StitchEvent[] {
  return result.events.filter((event) => event.t === 'stitch' && event.u !== 1);
}

function span(result: RunResult, axis: 'x' | 'y'): number {
  const values = topping(result).map((event) => event[axis]);
  return Math.max(...values) - Math.min(...values);
}

describe('opt-in directional fill compensation', () => {
  it('keeps the legacy scalar path byte-identical by default and explicitly', () => {
    const source =
      "fabric 'woven' fabricstretch 0 1 fillunderlay 'off' lock 0 fillspacing 2 filllen 2 " +
      SQUARE;

    expect(run(`compensation 'legacy' ${source}`).events).toEqual(run(source).events);
  });

  it('projects pull along each physical fixed-tatami row heading', () => {
    const horizontal = run(`${SETTINGS} fillangle 0 ${SQUARE}`);
    const vertical = run(`${SETTINGS} fillangle 90 ${SQUARE}`);

    expect(span(horizontal, 'x')).toBeCloseTo(20 + 8 / 15, 10);
    expect(span(vertical, 'y')).toBeCloseTo(20 + 4 / 15, 10);
    expect(horizontal.compensation.appliedMode).toBe('directional-satin');
    expect(horizontal.compensation.fillEndpointMode).toBe('directional-open-path');
  });

  it('uses each endpoint tangent for curved open paths', () => {
    const tensor = compensationTensor(0, 2 / 15, 4 / 15);
    const path: [number, number][] = [
      [0, 2],
      [6, 2],
      [6, 10],
    ];
    const compensated = compensateOpenPathEnds(path, tensor);

    expect(compensated[0]).toEqual([-4 / 15, 2]);
    expect(compensated[1]).toEqual(path[1]);
    expect(compensated[2][0]).toBe(6);
    expect(compensated[2][1]).toBeCloseTo(10 + 2 / 15, 12);
    expect(compensationForHeading(tensor, 90).alongStitchMM).toBeCloseTo(4 / 15, 12);
    expect(compensationForHeading(tensor, 0).alongStitchMM).toBeCloseTo(2 / 15, 12);

    const withDuplicateEnds = compensateOpenPathEnds(
      [path[0], path[0], path[1], path[2], path[2]],
      tensor,
    );
    expect(withDuplicateEnds[0]).toEqual(compensated[0]);
    expect(withDuplicateEnds[withDuplicateEnds.length - 1]).toEqual(compensated[2]);
  });

  it('uses those local tangents when sewing a curved custom fill path', () => {
    const body = `fill paths [[[0,2],[6,2],[6,10]]] ${SQUARE}`;
    const result = topping(run(`${SETTINGS} ${body}`));
    const baseline = topping(run(`${SETTINGS} pullcomp 0 ${body}`));

    expect(
      Math.min(...baseline.map(({ x }) => x)) - Math.min(...result.map(({ x }) => x)),
    ).toBeCloseTo(4 / 15, 10);
    expect(
      Math.max(...result.map(({ y }) => y)) - Math.max(...baseline.map(({ y }) => y)),
    ).toBeCloseTo(2 / 15, 10);
  });

  it('applies custom-path compensation after non-uniform transforms', () => {
    const body = `scalexy 2 3 [
         fill paths [[[0, 2], [10, 2]]]
         beginfill repeat 4 [ fd 10 rt 90 ] endfill
       ]`;
    const result = run(`${SETTINGS} ${body}`);
    const baseline = run(`${SETTINGS} pullcomp 0 ${body}`);
    const points = topping(result);
    const baselinePoints = topping(baseline);

    expect(
      Math.min(...baselinePoints.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)),
    ).toBeCloseTo(4 / 15, 10);
    expect(
      Math.max(...points.map(({ x }) => x)) - Math.max(...baselinePoints.map(({ x }) => x)),
    ).toBeCloseTo(4 / 15, 10);
  });

  it('leaves closed contour paths unchanged and explains the limitation', () => {
    const path = 'fill paths [[[2,2],[8,2],[8,8],[2,8],[2,2]]] ' + SQUARE;
    const directional = run(`${SETTINGS} ${path}`);
    const zero = run(`${SETTINGS} pullcomp 0 ${path}`);

    expect(directional.events).toEqual(zero.events);
    expect(directional.warnings).toContainEqual(
      expect.stringMatching(/directional compensation does not widen closed contour rings/),
    );
  });

  it('warns spatially on unreserved field or hole crossings and honors fillinset', () => {
    const crossing = run(`${SETTINGS} ${SQUARE}`);
    const reserved = run(`${SETTINGS} fillinset 0.5 ${SQUARE}`);

    expect(crossing.warnings).toContainEqual(
      expect.stringMatching(/directional fill compensation extends .*authored fill boundary/),
    );
    expect(crossing.warningLocations).toContainEqual(expect.objectContaining({ kind: 'fill' }));
    expect(reserved.warnings).not.toContainEqual(
      expect.stringMatching(/directional fill compensation extends/),
    );

    const holed = `fill paths [[[2,10],[18,10]]]
      beginfill
        repeat 4 [ fd 20 rt 90 ]
        up setxy 8 8 down repeat 4 [ fd 4 rt 90 ]
      endfill`;
    const holeCrossing = run(`${SETTINGS} ${holed}`);
    const holeReserved = run(`${SETTINGS} fillinset 0.5 ${holed}`);
    expect(holeCrossing.warnings).toContainEqual(
      expect.stringMatching(/directional fill compensation extends .*authored fill boundary/),
    );
    expect(holeReserved.warnings).not.toContainEqual(
      expect.stringMatching(/directional fill compensation extends/),
    );
  });
});
