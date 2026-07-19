import { describe, expect, it } from 'vitest';
import { MACHINE_PROFILE_LIMITS, resolveMachineProfile, run, toDST, toSVG } from '../engine.ts';
import type { MachineProfile, StitchEvent } from '../engine.ts';

const IDENTITY_PROFILE: MachineProfile = { name: 'Studio identity' };

const movements = (events: readonly StitchEvent[]): number[] => {
  const lengths: number[] = [];
  let previous = { x: 0, y: 0 };
  for (const event of events) {
    if (event.t !== 'stitch' && event.t !== 'jump') continue;
    lengths.push(Math.hypot(event.x - previous.x, event.y - previous.y));
    previous = event;
  }
  return lengths;
};

describe('local machine profiles', () => {
  it('resolves no profile to the identity correction and current defaults', () => {
    const baseline = run('lock 0 stitchlen 5 fd 10');
    const explicitIdentity = run('lock 0 stitchlen 5 fd 10', {
      machineProfile: IDENTITY_PROFILE,
    });

    expect(baseline.events).toEqual(explicitIdentity.events);
    expect(baseline.machineProfile).toEqual(resolveMachineProfile(3.5));
    expect(baseline.machineProfile).toMatchObject({
      source: 'default',
      name: 'NeedleScript default',
      calibration: {
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        offsetXMM: 0,
        offsetYMM: 0,
      },
    });
    expect(explicitIdentity.machineProfile).toMatchObject({
      source: 'run-options',
      name: IDENTITY_PROFILE.name,
    });
  });

  it('applies the bounded affine correction to completed event coordinates', () => {
    const source = 'lock 0 stitchlen 5 rt 90 fd 10';
    const authored = run(source);
    const corrected = run(source, {
      machineProfile: {
        name: 'Measured frame A',
        calibration: {
          scaleX: 1.02,
          scaleY: 0.98,
          skewX: 0.01,
          skewY: -0.02,
          offsetXMM: 0.4,
          offsetYMM: -0.3,
        },
      },
    });

    expect(corrected.events).toHaveLength(authored.events.length);
    corrected.events.forEach((event, index) => {
      const original = authored.events[index];
      expect(event.x).toBeCloseTo(1.02 * original.x + 0.01 * original.y + 0.4, 10);
      expect(event.y).toBeCloseTo(-0.02 * original.x + 0.98 * original.y - 0.3, 10);
    });
    expect(corrected.machineProfile.calibration).toEqual({
      scaleX: 1.02,
      scaleY: 0.98,
      skewX: 0.01,
      skewY: -0.02,
      offsetXMM: 0.4,
      offsetYMM: -0.3,
    });
  });

  it('rejects absurd scale, skew, offset, and diagnostic limits', () => {
    expect(() =>
      run('fd 1', {
        machineProfile: { name: 'bad', calibration: { scaleX: 2 } },
      }),
    ).toThrow(/calibration\.scaleX/);
    expect(() =>
      run('fd 1', {
        machineProfile: { name: 'bad', calibration: { skewY: 0.5 } },
      }),
    ).toThrow(/calibration\.skewY/);
    expect(() =>
      run('fd 1', {
        machineProfile: { name: 'bad', calibration: { offsetXMM: 20 } },
      }),
    ).toThrow(/calibration\.offsetXMM/);
    expect(() =>
      run('fd 1', {
        machineProfile: {
          name: 'bad',
          maximumPreferredStitchMM: MACHINE_PROFILE_LIMITS.maximumPreferredStitchMM.max + 1,
        },
      }),
    ).toThrow(/maximumPreferredStitchMM/);
    expect(() => run('fd 1', { machineProfile: { name: '' } })).toThrow(/name must contain/);
  });

  it('rejects non-serializable profile shapes at the runtime boundary', () => {
    expect(() => run('fd 1', { machineProfile: null as unknown as MachineProfile })).toThrow(
      /machineProfile must be a serializable object/,
    );
    expect(() =>
      run('fd 1', { machineProfile: { name: 42 } as unknown as MachineProfile }),
    ).toThrow(/machineProfile\.name must be a string/);
    expect(() =>
      run('fd 1', {
        machineProfile: {
          name: 'bad calibration',
          calibration: [] as unknown as MachineProfile['calibration'],
        },
      }),
    ).toThrow(/machineProfile\.calibration must be a serializable object/);
  });

  it('checks the corrected coordinates during final hoop validation', () => {
    const result = run('hoop 100\nlock 0\nup setxy 46 0 down fd 0.5', {
      machineProfile: { name: 'Wide X', calibration: { scaleX: 1.1 } },
    });

    expect(result.preflight?.issues).toContainEqual(
      expect.objectContaining({ code: 'hoop.unreachable', severity: 'error' }),
    );
    expect(
      result.warningLocations?.find(({ kind }) => kind === 'overflow')?.points[0].x,
    ).toBeCloseTo(50.6);
  });

  it('uses local preferred lengths in opt-in preflight without rewriting the correction', () => {
    const result = run("preflight 'warn'\nlock 0 stitchlen 7 fd 7", {
      machineProfile: {
        name: 'Short-stitch machine',
        maximumPreferredStitchMM: 6,
        maximumPreferredJumpMM: 9,
        minimumReliableMovementMM: 0.5,
      },
    });

    expect(result.preflight?.issues).toContainEqual(
      expect.objectContaining({ code: 'stitch.long-sewn-float' }),
    );
    expect(result.preflight?.profile).toMatchObject({
      maximumPreferredSewnStitchMM: 6,
      maximumPreferredSatinStitchMM: 6,
      maximumPreferredJumpMM: 9,
      minimumReliableMovementMM: 0.5,
    });
  });

  it('surfaces local operation capabilities without changing events', () => {
    const source = "preflight 'warn'\nlock 0 fd 2 trim color 1 fd 2";
    const automatic = run(source);
    const manual = run(source, {
      machineProfile: {
        name: 'Manual operations',
        trimCapability: 'manual',
        colorChangeCapability: 'manual',
      },
    });

    expect(manual.events).toEqual(automatic.events);
    expect(manual.preflight?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'machine.trim-manual', severity: 'info' }),
        expect.objectContaining({ code: 'machine.color-change-manual', severity: 'info' }),
      ]),
    );
    expect(() =>
      run("preflight 'strict'\nlock 0 fd 2 trim", {
        machineProfile: { name: 'No cutter', trimCapability: 'none' },
      }),
    ).toThrow(/preflight strict failed \[machine\.trim-unsupported\]/);
  });

  it('re-splits calibrated movements that exceed the hard stitch ceiling', () => {
    const result = run('lock 0 stitchlen 12 rt 90 fd 24', {
      machineProfile: { name: 'Scale X', calibration: { scaleX: 1.1 } },
    });

    expect(Math.max(...movements(result.events))).toBeLessThanOrEqual(
      result.machineProfile.maximumStitchMM + 1e-9,
    );
  });

  it('is JSON-serializable and appears in supported export metadata', () => {
    const result = run('lock 0 fd 2', {
      machineProfile: {
        name: 'Studio A / calibrated',
        speedClass: 'slow',
        calibration: { scaleX: 1.01 },
      },
    });
    const metadata = { machineProfile: result.machineProfile };
    const roundTrip = JSON.parse(JSON.stringify(result.machineProfile));
    const dstHeader = new TextDecoder().decode(
      toDST(result.events, 'profile', metadata).slice(0, 512),
    );
    const svg = toSVG(result.events, 'profile', [], '#fff', metadata);

    expect(roundTrip).toEqual(result.machineProfile);
    expect(dstHeader).toContain('NS:STUDIO A _ CALIBRATED');
    expect(svg).toContain('id="needlescript-metadata"');
    expect(svg).toContain('Studio A / calibrated');
  });
});
