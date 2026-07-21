import type { DesignState, LineSegment, LineStitchBounds } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import type { MachinePreset } from '../data.ts';
import type { WarningLocation } from '../lib/engine.ts';
import type { PhysicsDiagnostic } from '../lib/engine.ts';
import type { PathParamDef, PointParamDef } from '../lib/editor/parameters.ts';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';
import { cn } from '@/utils.ts';
import { colorDist } from '../lib/core/colormath.ts';
import { useState, type CSSProperties } from 'react';

const EMPTY_PHYSICS_DIAGNOSTICS: PhysicsDiagnostic[] = [];

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  lineSegments: LineSegment[];
  warningLoc: WarningLocation | null;
  physicsDiagnostics?: PhysicsDiagnostic[];
  selectedDiagnosticId?: string | null;
  hoveredDiagnosticId?: string | null;
  onDiagnosticHover?: (diagnostic: PhysicsDiagnostic | null) => void;
  onDiagnosticSelect?: (diagnostic: PhysicsDiagnostic) => void;
  hoveredLineBounds: LineStitchBounds | null;
  showDensity: boolean;
  onToggleDensity: () => void;
  chalkControl: { visible: boolean; toggle: () => void };
  hideJumps: boolean;
  onToggleHideJumps: () => void;
  hoveredDataVar?: string | null;
  pinnedDataVars?: Set<string>;
  // ── XY handle props ───────────────────────────────────────────────────────
  pointParams?: PointParamDef[];
  pathParams?: PathParamDef[];
  showHandles?: boolean;
  onToggleHandles?: () => void;
  highlightedHandle?: string | null;
  lockedHandles?: Set<string>;
  onHandleDrag?: (
    name: string,
    line: number,
    x: number,
    y: number,
    options?: { breakPair: boolean },
  ) => void;
  onHandleCommit?: (
    name: string,
    line: number,
    x: number,
    y: number,
    options?: { breakPair: boolean },
  ) => void;
  onPathInsert?: (name: string, segment: number, t: number) => void;
  onPathDelete?: (name: string, anchor: number) => void;
  onCurveToggleSmooth?: (name: string, anchor: number) => void;
  onPathTranslate?: (name: string, dx: number, dy: number, commit: boolean) => void;
  onMachineContextMenu?: (x: number, y: number) => void;
  machine?: MachinePreset | null;
}

// ── Small pill switch sized for the canvas toolbar ────────────────────────────
function CanvasSwitch({
  checked,
  onCheckedChange,
  label,
  title,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <div className="flex items-center gap-[5px] cursor-pointer select-none" title={title}>
      <span
        className={cn(
          'font-mono text-[10px] tracking-[0.12em] uppercase transition-colors',
          checked ? 'text-on-canvas' : 'text-on-canvas/55',
        )}
      >
        {label}
      </span>
      {/* Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-[14px] w-[26px] shrink-0 rounded-full border transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-run/60',
          checked
            ? 'bg-run border-run-dark'
            : 'bg-[rgba(120,100,70,0.18)] border-[rgba(120,100,70,0.40)]',
        )}
      >
        {/* Thumb */}
        <span
          className={cn(
            'absolute top-[1px] h-[10px] w-[10px] rounded-full bg-[#FFFDF7] shadow-sm transition-transform duration-150',
            checked ? 'translate-x-[13px]' : 'translate-x-[1px]',
          )}
        />
      </button>
    </div>
  );
}

export default function StagePane({
  design,
  hoop,
  scrubPos,
  onScrubChange,
  activeLine,
  lineSegments,
  warningLoc,
  physicsDiagnostics = EMPTY_PHYSICS_DIAGNOSTICS,
  selectedDiagnosticId = null,
  hoveredDiagnosticId = null,
  onDiagnosticHover,
  onDiagnosticSelect,
  hoveredLineBounds,
  showDensity,
  onToggleDensity,
  chalkControl,
  hideJumps,
  onToggleHideJumps,
  hoveredDataVar,
  pinnedDataVars,
  pointParams,
  pathParams,
  showHandles = true,
  onToggleHandles,
  highlightedHandle,
  lockedHandles,
  onHandleDrag,
  onHandleCommit,
  onPathInsert,
  onPathDelete,
  onCurveToggleSmooth,
  onPathTranslate,
  onMachineContextMenu,
  machine,
}: Props) {
  // Only show the handles toggle when there are point params to show
  const hasHandles = (pointParams?.length ?? 0) > 0;
  const darkGround = colorDist(design.background, '#000000') < 0.5;
  const selectedDiagnostic =
    physicsDiagnostics.find(({ id }) => id === selectedDiagnosticId) ?? null;
  const [storedDiagnosticView, setStoredDiagnosticView] = useState({
    diagnosticId: null as string | null,
    visible: true,
    dimmed: false,
    inspecting: false,
  });
  const diagnosticView =
    storedDiagnosticView.diagnosticId === selectedDiagnosticId
      ? storedDiagnosticView
      : {
          diagnosticId: selectedDiagnosticId,
          visible: true,
          dimmed: false,
          inspecting: false,
        };

  const firstPlaybackIndex = selectedDiagnostic?.playbackRanges.reduce(
    (first, range) => Math.min(first, range.start, range.end),
    Infinity,
  );

  return (
    <section className={styles.pane}>
      <div
        className={styles.fabric}
        style={
          {
            backgroundColor: design.background,
            '--color-on-canvas': darkGround ? '#fffdf7' : '#302b25',
          } as CSSProperties
        }
      >
        <StageCanvas
          design={design}
          hoop={hoop}
          activeHoop={design.activeHoop}
          scrubPos={scrubPos}
          showDensity={showDensity}
          hideJumps={hideJumps}
          showChalk={chalkControl.visible}
          hoveredDataVar={hoveredDataVar}
          pinnedDataVars={pinnedDataVars}
          warningLoc={warningLoc}
          physicsDiagnostics={physicsDiagnostics}
          selectedDiagnosticId={selectedDiagnosticId}
          hoveredDiagnosticId={hoveredDiagnosticId}
          showSelectedDiagnostic={diagnosticView.visible}
          dimBaseForDiagnostic={diagnosticView.dimmed}
          onDiagnosticHover={onDiagnosticHover}
          onDiagnosticSelect={onDiagnosticSelect}
          hoveredLineBounds={hoveredLineBounds}
          pointParams={pointParams}
          pathParams={pathParams}
          showHandles={showHandles}
          highlightedHandle={highlightedHandle}
          lockedHandles={lockedHandles}
          onHandleDrag={onHandleDrag}
          onHandleCommit={onHandleCommit}
          onPathInsert={onPathInsert}
          onPathDelete={onPathDelete}
          onCurveToggleSmooth={onCurveToggleSmooth}
          onPathTranslate={onPathTranslate}
          onMachineContextMenu={onMachineContextMenu}
        />
        <StatsChips design={design} machine={machine} />
        {selectedDiagnostic && (
          <div className={styles.diagnosticControls} aria-label="Selected Physics overlay controls">
            <span className={styles.diagnosticTitle}>{selectedDiagnostic.title}</span>
            <button
              type="button"
              className={styles.diagnosticAction}
              aria-pressed={!diagnosticView.visible}
              onClick={() =>
                setStoredDiagnosticView({ ...diagnosticView, visible: !diagnosticView.visible })
              }
            >
              {diagnosticView.visible ? 'Hide overlay' : 'Reveal overlay'}
            </button>
            <button
              type="button"
              className={styles.diagnosticAction}
              aria-pressed={diagnosticView.dimmed}
              onClick={() =>
                setStoredDiagnosticView({ ...diagnosticView, dimmed: !diagnosticView.dimmed })
              }
              disabled={!diagnosticView.visible}
            >
              {diagnosticView.dimmed ? 'Restore stitches' : 'Dim stitches'}
            </button>
            {Number.isFinite(firstPlaybackIndex) && !diagnosticView.inspecting && (
              <button
                type="button"
                className={styles.diagnosticAction}
                onClick={() => {
                  onScrubChange(Math.min(design.pts.length, (firstPlaybackIndex ?? 0) + 1));
                  setStoredDiagnosticView({ ...diagnosticView, inspecting: true });
                }}
              >
                Inspect sew order
              </button>
            )}
            {diagnosticView.inspecting && (
              <button
                type="button"
                className={styles.diagnosticAction}
                onClick={() => {
                  onScrubChange(design.pts.length);
                  setStoredDiagnosticView({ ...diagnosticView, inspecting: false });
                }}
              >
                Return to full design
              </button>
            )}
          </div>
        )}
        <div className={styles.canvasControls}>
          <CanvasSwitch
            checked={!hideJumps}
            onCheckedChange={() => onToggleHideJumps()}
            label="jumps"
            title="Hide jump threads for a cleaner preview"
          />
          {(design.chalk.length > 0 || design.dataVars.length > 0) && (
            <CanvasSwitch
              checked={chalkControl.visible}
              onCheckedChange={chalkControl.toggle}
              label={`chalk · ${design.chalk.length}`}
              title="Toggle removable chalk guides"
            />
          )}
          <CanvasSwitch
            checked={showDensity}
            onCheckedChange={onToggleDensity}
            label="density"
            title="Toggle the stitch-density heatmap"
          />
          {hasHandles && (
            <CanvasSwitch
              checked={showHandles}
              onCheckedChange={() => onToggleHandles?.()}
              label="handles"
              title="Toggle draggable point handles"
            />
          )}
        </div>
      </div>
      <PlaybackBar
        total={design.pts.length}
        scrubPos={scrubPos}
        onScrubChange={onScrubChange}
        activeLine={activeLine}
        lineSegments={lineSegments}
        highlightLines={warningLoc?.lines ?? []}
        physicsDiagnostics={physicsDiagnostics}
        selectedDiagnosticId={selectedDiagnosticId}
      />
    </section>
  );
}
