import type { DesignState, LineSegment, LineStitchBounds } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import type { WarningLocation } from '../lib/engine.ts';
import type { PointParamDef } from '../lib/parse-parameters.ts';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';
import { cn } from '@/lib/utils.ts';

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  lineSegments: LineSegment[];
  warningLoc: WarningLocation | null;
  hoveredLineBounds: LineStitchBounds | null;
  showDensity: boolean;
  onToggleDensity: () => void;
  hideJumps: boolean;
  onToggleHideJumps: () => void;
  // ── XY handle props ───────────────────────────────────────────────────────
  pointParams?: PointParamDef[];
  showHandles?: boolean;
  onToggleHandles?: () => void;
  highlightedHandle?: string | null;
  lockedHandles?: Set<string>;
  onHandleDrag?: (name: string, line: number, x: number, y: number) => void;
  onHandleCommit?: (name: string, line: number, x: number, y: number) => void;
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
    <label className="flex items-center gap-[5px] cursor-pointer select-none" title={title}>
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
    </label>
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
  hoveredLineBounds,
  showDensity,
  onToggleDensity,
  hideJumps,
  onToggleHideJumps,
  pointParams,
  showHandles = true,
  onToggleHandles,
  highlightedHandle,
  lockedHandles,
  onHandleDrag,
  onHandleCommit,
}: Props) {
  // Only show the handles toggle when there are point params to show
  const hasHandles = (pointParams?.length ?? 0) > 0;

  return (
    <section className={styles.pane}>
      <div className={styles.fabric}>
        <StageCanvas
          design={design}
          hoop={hoop}
          activeHoop={design.activeHoop}
          scrubPos={scrubPos}
          showDensity={showDensity}
          hideJumps={hideJumps}
          warningLoc={warningLoc}
          hoveredLineBounds={hoveredLineBounds}
          pointParams={pointParams}
          showHandles={showHandles}
          highlightedHandle={highlightedHandle}
          lockedHandles={lockedHandles}
          onHandleDrag={onHandleDrag}
          onHandleCommit={onHandleCommit}
        />
        <StatsChips design={design} />
        <div className="absolute top-[10px] right-[10px] flex items-center gap-[10px]">
          <CanvasSwitch
            checked={!hideJumps}
            onCheckedChange={() => onToggleHideJumps()}
            label="jumps"
            title="Hide jump threads for a cleaner preview"
          />
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
      />
    </section>
  );
}
