import { describe, expect, it } from 'vitest';
import {
  analyzeEventStreamPreflight,
  EVENT_STREAM_PREFLIGHT_THRESHOLDS,
  resolveMachineProfile,
  run,
} from '../engine.ts';
import type { ResolvedMachineProfile, StitchEvent } from '../engine.ts';

function issueCodes(source: string): string[] {
  return run(source).preflight?.issues.map((issue) => issue.code) ?? [];
}

describe('structured preflight result', () => {
  it('is additive and present even when a design has no issues', () => {
    const result = run('lock 0 fd 10');

    expect(result.warnings).toEqual([]);
    expect(result.preflight).toEqual({
      mode: 'off',
      issues: [],
      profile: {
        source: 'default',
        name: 'NeedleScript default',
        minimumReliableMovementMM: 0.4,
        maximumStitchMM: 12,
        maximumPreferredSewnStitchMM: 8,
        maximumPreferredSatinStitchMM: 8,
        maximumPreferredJumpMM: 12,
        maximumConsecutiveStitches: 20_000,
        maximumDensityLayers: 3.5,
        sameHolePenetrationLimit: 5,
        trimCapability: 'automatic',
        colorChangeCapability: 'automatic',
        speedClass: 'standard',
        calibration: {
          scaleX: 1,
          scaleY: 1,
          skewX: 0,
          skewY: 0,
          offsetXMM: 0,
          offsetYMM: 0,
        },
      },
      summary: { total: 0, info: 0, warning: 0, error: 0 },
    });
  });

  it('structures density and same-hole stack warnings with stable codes', () => {
    const result = run('lock 0\nrepeat 12 [ fd 0.4 bk 0.4 ]');
    const issues = result.preflight?.issues ?? [];

    expect(issues.some((issue) => issue.code === 'coverage.density-hotspot')).toBe(true);
    expect(issues.some((issue) => issue.code === 'penetration.same-hole-stack')).toBe(true);
    for (const issue of issues.filter(({ code }) =>
      ['coverage.density-hotspot', 'penetration.same-hole-stack'].includes(code),
    )) {
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
    expect(
      run(`def c(t,s,i,u) [ return [0.4, 3, 3, 0, 0] ]
lock 0 satin @c
fd 30`).preflight?.issues.some(({ code }) => code === 'satin.snag-risk'),
    ).toBe(false);
  });

  it('keeps issue ordering and coordinates deterministic across runs', () => {
    const source = `lock 0
fd 0.1
moveto 60 0
repeat 4 [ fd 0.4 bk 0.4 ]`;

    expect(run(source).preflight).toEqual(run(source).preflight);
  });

  it('keeps extended checks opt-in while preserving legacy always-on diagnostics', () => {
    const source = 'lock 0 stitchlen 0.5 fd 4.5';
    const defaultResult = run(source);
    const off = run(`preflight 'off'\n${source}`);
    const warn = run(`preflight 'warn'\n${source}`);

    expect(defaultResult.preflight?.mode).toBe('off');
    expect(off.preflight?.issues).toEqual(defaultResult.preflight?.issues);
    expect(off.preflight?.issues.some(({ code }) => code === 'stitch.short-cluster')).toBe(false);
    expect(warn.preflight?.issues.some(({ code }) => code === 'stitch.short-cluster')).toBe(true);
    expect(warn.events).toEqual(off.events);
    expect(warn.warnings).toEqual(off.warnings);
  });

  it('strict fails only error-severity issues and leaves recommendations non-fatal', () => {
    const recommendation = run("preflight 'strict'\nlock 0 stitchlen 0.5 fd 4.5");

    expect(recommendation.preflight?.issues).toContainEqual(
      expect.objectContaining({ code: 'stitch.short-cluster', severity: 'warning' }),
    );
    expect(() => run("preflight 'strict'\nhoop '5x7'\nmoveto 70 0\nfd 1")).toThrow(
      /preflight strict failed \[hoop\.unreachable\]/,
    );
  });

  it('validates preflight mode and directive placement', () => {
    expect(() => run("preflight 'warning'\nfd 1")).toThrow(/Unknown preflight 'warning'/);
    expect(() => run("preflight 'warn'\npreflight 'off'\nfd 1")).toThrow(
      /preflight already set on line 1/,
    );
    expect(() => run("fd 1\npreflight 'warn'")).toThrow(
      /preflight must run before the first stitch/,
    );
    expect(() => run("repeat 1 [ preflight 'warn' ]")).toThrow(
      /preflight must be at the top level/,
    );
  });
});

const stitch = (x: number, y: number, line = 1): StitchEvent => ({
  t: 'stitch',
  x,
  y,
  c: 0,
  line,
});

const jump = (x: number, y: number, line = 1): StitchEvent => ({
  t: 'jump',
  x,
  y,
  c: 0,
  line,
});

const DEFAULT_PROFILE = resolveMachineProfile(3.5);

function streamIssues(events: StitchEvent[], profile: ResolvedMachineProfile = DEFAULT_PROFILE) {
  return analyzeEventStreamPreflight(events, profile);
}

function hasCode(events: StitchEvent[], code: string): boolean {
  return streamIssues(events).some((issue) => issue.code === code);
}

describe('event-stream preflight checks', () => {
  it('detects a cluster of short stitches and accepts the neighboring safe count', () => {
    const trigger = Array.from({ length: 9 }, (_, index) => stitch(index * 0.5, 0, 7));
    const safe = trigger.slice(0, 8);
    const issue = streamIssues(trigger).find(({ code }) => code === 'stitch.short-cluster');

    expect(issue).toMatchObject({ severity: 'warning', lines: [7] });
    expect(issue?.points).toHaveLength(9);
    expect(hasCode(safe, 'stitch.short-cluster')).toBe(false);
  });

  it('detects repeated reversals in a small radius and accepts one fewer reversal', () => {
    const trigger = Array.from({ length: 6 }, (_, index) => stitch(index % 2 ? 0.8 : 0, 0, 8));
    const safe = trigger.slice(0, 5);

    expect(hasCode(trigger, 'path.reversal-cluster')).toBe(true);
    expect(hasCode(safe, 'path.reversal-cluster')).toBe(false);
  });

  it('detects near-hole penetrations over a moving window and accepts one fewer penetration', () => {
    const limit = EVENT_STREAM_PREFLIGHT_THRESHOLDS.nearHolePenetrationLimit;
    const trigger = Array.from({ length: limit }, (_, index) =>
      stitch((index % 2) * 0.1, Math.floor(index / 2) * 0.02, 9),
    );
    const safe = trigger.slice(0, -1);
    const issue = streamIssues(trigger).find(
      ({ code }) => code === 'penetration.near-hole-cluster',
    );

    expect(issue).toMatchObject({ lines: [9] });
    expect(issue?.points).toHaveLength(limit);
    expect(hasCode(safe, 'penetration.near-hole-cluster')).toBe(false);
  });

  it('detects long sewn floats and accepts the preferred maximum', () => {
    expect(hasCode([stitch(0, 0), stitch(9, 0)], 'stitch.long-sewn-float')).toBe(true);
    expect(hasCode([stitch(0, 0), stitch(8, 0)], 'stitch.long-sewn-float')).toBe(false);
  });

  it('detects long untrimmed jump chains and accepts a trimmed or threshold-length chain', () => {
    const trigger = [stitch(0, 0), stitch(1, 0), jump(14, 0)];
    const safeLength = [stitch(0, 0), stitch(1, 0), jump(13, 0)];
    const trimmed: StitchEvent[] = [
      stitch(0, 0),
      stitch(1, 0),
      { t: 'trim', x: 1, y: 0, c: 0, line: 2 },
      jump(14, 0),
    ];

    expect(hasCode(trigger, 'travel.long-untrimmed-jump')).toBe(true);
    expect(hasCode(safeLength, 'travel.long-untrimmed-jump')).toBe(false);
    expect(hasCode(trimmed, 'travel.long-untrimmed-jump')).toBe(false);
  });

  it('detects profile-limited continuous stitch runs and accepts the exact ceiling', () => {
    const profile = { ...DEFAULT_PROFILE, maximumConsecutiveStitches: 4 };
    const trigger = Array.from({ length: 5 }, (_, index) => stitch(index, 0, 10));
    const safe = trigger.slice(0, 4);
    const issue = streamIssues(trigger, profile).find(
      ({ code }) => code === 'machine.continuous-stitch-run',
    );

    expect(issue).toMatchObject({ severity: 'info', lines: [10] });
    expect(streamIssues(safe, profile).some(({ code }) => code === issue?.code)).toBe(false);
  });

  it('detects dense sharp direction changes and accepts one fewer turn', () => {
    const coordinates = [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [0, 0.5],
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [0, 0.5],
    ] as const;
    const trigger = coordinates.map(([x, y]) => stitch(x, y, 11));
    const safe = trigger.slice(0, -1);

    expect(hasCode(trigger, 'path.direction-change-cluster')).toBe(true);
    expect(hasCode(safe, 'path.direction-change-cluster')).toBe(false);
  });

  it('integrates new issues without adding legacy warning strings or lock false positives', () => {
    const result = run("preflight 'warn'\nlock 0 autotrim 0\nfd 1\nup fd 20\ndown fd 1");
    const locked = run('fd 10');

    expect(result.preflight?.issues.some(({ code }) => code === 'travel.long-untrimmed-jump')).toBe(
      true,
    );
    expect(result.warnings.some((warning) => warning.includes('jump chain'))).toBe(false);
    expect(locked.preflight?.issues.some(({ code }) => code === 'stitch.short-cluster')).toBe(
      false,
    );
  });
});
