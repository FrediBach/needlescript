import { describe, expect, it } from 'vitest';
import { mTranslate } from '../affine.ts';
import { Machine } from '../machine.ts';

describe('machine construction configuration snapshots', () => {
  it('restores the complete construction-state inventory', () => {
    const machine = new Machine();
    const stitchReporter = () => 1.5;
    const satinReporter = (): [number, number, number, number, number] => [2, 0.4, 0, 1, 0];
    const fillLenReporter = () => 2.25;
    const fillDirReporter = () => 30;
    const fillShapeReporter = (): [number, number, number] => [0.5, 2.5, 0.25];
    const fillPathsReporter = (rings: [number, number][][]) => rings;

    machine.stitchLen = 1.5;
    machine.stitchLenList = [1.25, 2.75];
    machine.stitchLenListPhase = 1;
    machine.stitchLenStretchIndex = 7;
    machine.stitchLenStretchStart = false;
    machine.stitchLenReporter = stitchReporter;
    machine.mode = 'satin';
    machine.beanRepeats = 5;
    machine.eWidth = 2.5;
    machine.satinWidth = 4.5;
    machine.satinSpacing = 0.55;
    machine.satinSide = -1;
    machine.satinReporter = satinReporter;
    machine.satinJoin = 'fan';
    machine.satinCornerAngle = 35;
    machine.satinWide = 'split';
    machine.satinMaxWidth = 6;
    machine.satinSplitOverlap = 0.35;
    machine.fillAngle = 37;
    machine.fillSpacing = 0.65;
    machine.fillInset = 0.75;
    machine.fillEdgeRun = 0.9;
    machine.fillEdgeShort = 0.7;
    machine.fillStagger = 'progressive';
    machine.fillStaggerAmount = 0.7;
    machine.fillConnect = 'inside';
    machine.fillLen = 3;
    machine.fillLenList = [2, 3.5];
    machine.fillLenListPhase = 1;
    machine.fillLenReporter = fillLenReporter;
    machine.lockLen = 0.9;
    machine.pullComp = 0.45;
    machine.pullCompExplicit = true;
    machine.compensationMode = 'directional';
    machine.underlayMode = 'edge';
    machine.satinUnderlayCustomization = {
      passKinds: ['center', 'edge'],
      runningStitchLengthMM: 2.8,
      edgeInsetMM: 0.6,
      zigzagSpacingMM: 1.8,
    };
    machine.fillUnderlayMode = 'tatami';
    machine.fillUnderlayCustomization = {
      passKinds: ['edge', 'tatami'],
      stitchLengthMM: 3,
      insetMM: 0.8,
      rowSpacingMM: 2.2,
      relativeAngleDegrees: 90,
    };
    machine.doubleUnderlay = true;
    machine.shortStitch = false;
    machine.autoTrim = 12;
    machine.maxDensity = 2.75;
    machine.fillArmed = true;
    machine.fillDirReporter = fillDirReporter;
    machine.fillShapeReporter = fillShapeReporter;
    machine.fillPathsReporter = fillPathsReporter;
    machine.fillPathsStatic = [
      [
        [0, 0],
        [4, 0],
      ],
    ];
    machine.fillArmLine = 42;
    machine.fillPathsName = '@rows';

    const snapshot = machine.snapshotConstructionConfig();

    machine.stitchLen = 6;
    machine.stitchLenList = null;
    machine.stitchLenListPhase = 0;
    machine.stitchLenStretchIndex = 0;
    machine.stitchLenStretchStart = true;
    machine.stitchLenReporter = null;
    machine.mode = 'run';
    machine.beanRepeats = 1;
    machine.eWidth = 0;
    machine.satinWidth = 0;
    machine.satinSpacing = 1;
    machine.satinSide = 1;
    machine.satinReporter = null;
    machine.satinJoin = 'legacy';
    machine.satinCornerAngle = 60;
    machine.satinWide = 'warn';
    machine.satinMaxWidth = 7.5;
    machine.satinSplitOverlap = 0.5;
    machine.fillAngle = 0;
    machine.fillSpacing = 1;
    machine.fillInset = 0;
    machine.fillEdgeRun = 0;
    machine.fillEdgeShort = 0;
    machine.fillStagger = 'legacy';
    machine.fillStaggerAmount = 0.65;
    machine.fillConnect = 'legacy';
    machine.fillLen = null;
    machine.fillLenList = null;
    machine.fillLenListPhase = 0;
    machine.fillLenReporter = null;
    machine.lockLen = 0;
    machine.pullComp = 0;
    machine.pullCompExplicit = false;
    machine.compensationMode = 'legacy';
    machine.underlayMode = 'off';
    machine.satinUnderlayCustomization = null;
    machine.fillUnderlayMode = 'off';
    machine.fillUnderlayCustomization = null;
    machine.doubleUnderlay = false;
    machine.shortStitch = true;
    machine.autoTrim = 0;
    machine.maxDensity = 0;
    machine.fillArmed = false;
    machine.fillDirReporter = null;
    machine.fillShapeReporter = null;
    machine.fillPathsReporter = null;
    machine.fillPathsStatic = null;
    machine.fillArmLine = undefined;
    machine.fillPathsName = null;

    machine.restoreConstructionConfig(snapshot);

    expect(machine).toMatchObject({
      stitchLen: 1.5,
      stitchLenList: [1.25, 2.75],
      stitchLenListPhase: 1,
      stitchLenStretchIndex: 7,
      stitchLenStretchStart: false,
      mode: 'satin',
      beanRepeats: 5,
      eWidth: 2.5,
      satinWidth: 4.5,
      satinSpacing: 0.55,
      satinSide: -1,
      satinJoin: 'fan',
      satinCornerAngle: 35,
      satinWide: 'split',
      satinMaxWidth: 6,
      satinSplitOverlap: 0.35,
      fillAngle: 37,
      fillSpacing: 0.65,
      fillInset: 0.75,
      fillEdgeRun: 0.9,
      fillEdgeShort: 0.7,
      fillStagger: 'progressive',
      fillStaggerAmount: 0.7,
      fillConnect: 'inside',
      fillLen: 3,
      fillLenList: [2, 3.5],
      fillLenListPhase: 1,
      lockLen: 0.9,
      pullComp: 0.45,
      pullCompExplicit: true,
      compensationMode: 'directional',
      underlayMode: 'edge',
      satinUnderlayCustomization: {
        passKinds: ['center', 'edge'],
        runningStitchLengthMM: 2.8,
        edgeInsetMM: 0.6,
        zigzagSpacingMM: 1.8,
      },
      fillUnderlayMode: 'tatami',
      fillUnderlayCustomization: {
        passKinds: ['edge', 'tatami'],
        stitchLengthMM: 3,
        insetMM: 0.8,
        rowSpacingMM: 2.2,
        relativeAngleDegrees: 90,
      },
      doubleUnderlay: true,
      shortStitch: false,
      autoTrim: 12,
      maxDensity: 2.75,
      fillArmed: true,
      fillPathsStatic: [
        [
          [0, 0],
          [4, 0],
        ],
      ],
      fillArmLine: 42,
      fillPathsName: '@rows',
    });
    expect(machine.stitchLenReporter).toBe(stitchReporter);
    expect(machine.satinReporter).toBe(satinReporter);
    expect(machine.fillLenReporter).toBe(fillLenReporter);
    expect(machine.fillDirReporter).toBe(fillDirReporter);
    expect(machine.fillShapeReporter).toBe(fillShapeReporter);
    expect(machine.fillPathsReporter).toBe(fillPathsReporter);
  });

  it('copies mutable length patterns and static fill paths in both directions', () => {
    const machine = new Machine();
    const stitchPattern = [1, 2];
    const fillPattern = [3, 4];
    const underlayPasses = ['center', 'edge'] as const;
    const fillUnderlayPasses: ('edge' | 'tatami')[] = ['edge', 'tatami'];
    const staticPaths: [number, number][][] = [
      [
        [0, 0],
        [5, 0],
      ],
    ];
    machine.stitchLenList = stitchPattern;
    machine.fillLenList = fillPattern;
    machine.satinUnderlayCustomization = { passKinds: underlayPasses };
    machine.fillUnderlayCustomization = { passKinds: fillUnderlayPasses };
    machine.fillPathsStatic = staticPaths;

    const snapshot = machine.snapshotConstructionConfig();
    expect(snapshot.stitchLenList).not.toBe(stitchPattern);
    expect(snapshot.fillLenList).not.toBe(fillPattern);
    expect(snapshot.satinUnderlayCustomization?.passKinds).not.toBe(underlayPasses);
    expect(snapshot.fillUnderlayCustomization?.passKinds).not.toBe(fillUnderlayPasses);
    expect(snapshot.fillPathsStatic).not.toBe(staticPaths);
    expect(snapshot.fillPathsStatic?.[0]).not.toBe(staticPaths[0]);
    expect(snapshot.fillPathsStatic?.[0][0]).not.toBe(staticPaths[0][0]);

    stitchPattern[0] = 8;
    fillPattern[0] = 9;
    fillUnderlayPasses[0] = 'tatami';
    staticPaths[0][0][0] = 10;
    machine.restoreConstructionConfig(snapshot);
    expect(machine.stitchLenList).toEqual([1, 2]);
    expect(machine.fillLenList).toEqual([3, 4]);
    expect(machine.fillUnderlayCustomization?.passKinds).toEqual(['edge', 'tatami']);
    expect(machine.fillPathsStatic).toEqual([
      [
        [0, 0],
        [5, 0],
      ],
    ]);

    machine.stitchLenList![0] = 6;
    machine.fillLenList![0] = 7;
    (machine.fillUnderlayCustomization!.passKinds as ('edge' | 'tatami')[])[0] = 'tatami';
    machine.fillPathsStatic![0][0][0] = 11;
    machine.restoreConstructionConfig(snapshot);
    expect(machine.stitchLenList).toEqual([1, 2]);
    expect(machine.fillLenList).toEqual([3, 4]);
    expect(machine.fillUnderlayCustomization?.passKinds).toEqual(['edge', 'tatami']);
    expect(machine.fillPathsStatic![0][0]).toEqual([0, 0]);
  });

  it('does not restore turtle, output, warning, color, transform, or directive state', () => {
    const machine = new Machine();
    const snapshot = machine.snapshotConstructionConfig();
    const density = machine.density;

    machine.x = 12;
    machine.y = 8;
    machine.heading = 135;
    machine.penDown = false;
    machine.stateStack.push({ x: 1, y: 2, heading: 3, penDown: true });
    machine.events.push({ t: 'mark', x: 12, y: 8, c: 3, label: 'kept' });
    machine.warnings.push('kept warning');
    machine.colorIdx = 3;
    machine.started = true;
    machine.lastEmit = { x: 12, y: 8 };
    machine.satinDensityNoted = true;
    machine.pushTransform(mTranslate(5, 6));
    machine.hoopSet = true;
    machine.effectiveLimits.maxStitches = 1234;

    machine.restoreConstructionConfig(snapshot);

    expect(machine).toMatchObject({
      x: 12,
      y: 8,
      heading: 135,
      penDown: false,
      colorIdx: 3,
      started: true,
      lastEmit: { x: 12, y: 8 },
      satinDensityNoted: true,
      hoopSet: true,
    });
    expect(machine.stateStack).toHaveLength(1);
    expect(machine.events).toEqual([{ t: 'mark', x: 12, y: 8, c: 3, label: 'kept' }]);
    expect(machine.warnings).toEqual(['kept warning']);
    expect(machine.density).toBe(density);
    expect(machine.ctm).toEqual(mTranslate(5, 6));
    expect(machine.effectiveLimits.maxStitches).toBe(1234);
  });

  it('does not emit or reset list phase when no buffered construction exists', () => {
    const machine = new Machine();
    machine.stitchLenList = [1, 2, 3];
    machine.stitchLenStretchIndex = 4;
    machine.stitchLenStretchStart = false;

    const snapshot = machine.snapshotConstructionConfig();
    expect(machine.events).toEqual([]);
    expect(snapshot.stitchLenStretchIndex).toBe(4);
    expect(snapshot.stitchLenStretchStart).toBe(false);

    machine.stitchLenStretchIndex = 9;
    machine.restoreConstructionConfig(snapshot);
    expect(machine.events).toEqual([]);
    expect(machine.stitchLenStretchIndex).toBe(4);
    expect(machine.stitchLenStretchStart).toBe(false);
  });

  it('flushes buffered running and satin construction at snapshot boundaries', () => {
    const running = new Machine();
    running.stitchLenReporter = () => 1;
    running.forward(5);
    const runningEventsBefore = running.events.length;
    expect(running.runBuffer).not.toBeNull();

    running.snapshotConstructionConfig();
    expect(running.runBuffer).toBeNull();
    expect(running.events.length).toBeGreaterThan(runningEventsBefore);

    const satin = new Machine();
    satin.mode = 'satin';
    satin.satinWidth = 3;
    satin.forward(5);
    expect(satin.events).toEqual([]);
    expect(satin.satinPath).not.toBeNull();

    satin.snapshotConstructionConfig();
    expect(satin.satinPath).toBeNull();
    expect(satin.events.length).toBeGreaterThan(0);
  });

  it('flushes inner buffered construction before restoring outer settings', () => {
    const machine = new Machine();
    const outer = machine.snapshotConstructionConfig();
    machine.stitchLenReporter = () => 1;
    machine.forward(5);
    const beforeRestore = machine.events.length;

    machine.restoreConstructionConfig(outer);

    expect(machine.events.length).toBeGreaterThan(beforeRestore);
    expect(machine.stitchLenReporter).toBeNull();
    expect(machine.x).toBe(0);
    expect(machine.y).toBe(5);
  });

  it('rejects snapshot and restore boundaries during active fill recording', () => {
    const snapshotMachine = new Machine();
    snapshotMachine.beginFill();
    expect(() => snapshotMachine.snapshotConstructionConfig()).toThrow(/active fill/);
    expect(snapshotMachine.recording).toBe(true);

    const restoreMachine = new Machine();
    const snapshot = restoreMachine.snapshotConstructionConfig();
    restoreMachine.beginFill();
    expect(() => restoreMachine.restoreConstructionConfig(snapshot)).toThrow(/active fill/);
    expect(restoreMachine.recording).toBe(true);
  });

  it('preserves an unused armed fill without adding warnings', () => {
    const machine = new Machine();
    const outerDirection = () => 45;
    machine.fillArmed = true;
    machine.fillDirReporter = outerDirection;
    machine.fillArmLine = 12;
    const snapshot = machine.snapshotConstructionConfig();

    machine.fillDirReporter = () => 90;
    machine.fillArmLine = 20;
    machine.restoreConstructionConfig(snapshot);

    expect(machine.fillArmed).toBe(true);
    expect(machine.fillDirReporter).toBe(outerDirection);
    expect(machine.fillArmLine).toBe(12);
    expect(machine.warnings).toEqual([]);
  });
});
