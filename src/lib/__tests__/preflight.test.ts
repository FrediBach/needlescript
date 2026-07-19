import { describe, expect, it } from 'vitest';
import { run } from '../engine.ts';

function issueCodes(source: string): string[] {
  return run(source).preflight?.issues.map((issue) => issue.code) ?? [];
}

describe('structured preflight result', () => {
  it('is additive and present even when a design has no issues', () => {
    const result = run('lock 0 fd 10');

    expect(result.warnings).toEqual([]);
    expect(result.preflight).toEqual({
      issues: [],
      profile: {
        name: 'NeedleScript default',
        minimumReliableMovementMM: 0.4,
        maximumStitchMM: 12,
        maximumPreferredSatinStitchMM: 8,
        maximumDensityLayers: 3.5,
        sameHolePenetrationLimit: 5,
      },
      summary: { total: 0, info: 0, warning: 0, error: 0 },
    });
  });

  it('structures density and same-hole stack warnings with stable codes', () => {
    const result = run('lock 0\nrepeat 12 [ fd 0.4 bk 0.4 ]');
    const issues = result.preflight?.issues ?? [];

    expect(issues.some((issue) => issue.code === 'coverage.density-hotspot')).toBe(true);
    expect(issues.some((issue) => issue.code === 'penetration.same-hole-stack')).toBe(true);
    for (const issue of issues) {
      expect(result.warnings).toContain(issue.message);
      expect(issue.lines).toEqual([...new Set(issue.lines)]);
    }
  });

  it('structures merged tiny movements with all recorded deterministic points', () => {
    const result = run('lock 0\nfd 0.1\nfd 0.1');
    const issue = result.preflight?.issues.find(
      ({ code }) => code === 'stitch.below-reliable-movement',
    );

    expect(issue).toMatchObject({
      severity: 'warning',
      lines: [2, 3],
      points: [
        { x: 0, y: 0.1 },
        { x: 0, y: 0.2 },
      ],
    });
  });

  it('distinguishes sewable-field overflow from physically unreachable stitches', () => {
    const field = run("hoop '5x7'\nmoveto 64 0\nfd 1");
    const unreachable = run("hoop '5x7'\nmoveto 70 0\nfd 1");

    expect(issueCodes("hoop '5x7'\nmoveto 64 0\nfd 1")).toContain('hoop.field-overflow');
    expect(
      field.preflight?.issues.find(({ code }) => code === 'hoop.field-overflow'),
    ).toMatchObject({ severity: 'warning' });
    expect(
      unreachable.preflight?.issues.find(({ code }) => code === 'hoop.unreachable'),
    ).toMatchObject({ severity: 'error' });
  });

  it('structures configured and realized satin snag diagnostics', () => {
    const configured = run('satin 11\nfd 5');
    const realized = run(`def c(t,s,i,u) [ return [0.4, 3, 3, -5, 5] ]
lock 0 satin @c
fd 30`);
    const configuredIssue = configured.preflight?.issues.find(
      ({ code }) => code === 'satin.snag-risk',
    );
    const realizedIssue = realized.preflight?.issues.find(({ code }) => code === 'satin.snag-risk');

    expect(configuredIssue).toMatchObject({ lines: [1], points: [] });
    expect(realizedIssue?.points).toHaveLength(2);
    expect(realizedIssue?.lines).toEqual([3]);
  });

  it('keeps issue ordering and coordinates deterministic across runs', () => {
    const source = `lock 0
fd 0.1
moveto 60 0
repeat 4 [ fd 0.4 bk 0.4 ]`;

    expect(run(source).preflight).toEqual(run(source).preflight);
  });
});
