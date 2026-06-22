import type { DesignState, LineSegment } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';
import { Toggle } from '@/components/ui/toggle.tsx';
import { cn } from '@/lib/utils.ts';

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  lineSegments: LineSegment[];
  showDensity: boolean;
  onToggleDensity: () => void;
  hideJumps: boolean;
  onToggleHideJumps: () => void;
}

export default function StagePane({ design, hoop, scrubPos, onScrubChange, activeLine, lineSegments, showDensity, onToggleDensity, hideJumps, onToggleHideJumps }: Props) {
  return (
    <section className={styles.pane}>
      <div className={styles.fabric}>
        <StageCanvas design={design} hoop={hoop} scrubPos={scrubPos} showDensity={showDensity} hideJumps={hideJumps} />
        <StatsChips design={design} />
        <div className="absolute top-[10px] right-[10px] flex items-center gap-[6px]">
          <Toggle
            pressed={hideJumps}
            onPressedChange={onToggleHideJumps}
            aria-label="Hide jump threads for a cleaner preview"
            title="Hide jump threads for a cleaner preview"
            className={cn(
              "h-auto py-[5px] px-[9px]",
              "font-mono text-[10px] tracking-[0.12em] uppercase",
              "bg-[rgba(255,253,247,0.85)] border border-[var(--on-canvas-45)] text-on-canvas",
              "hover:bg-[rgba(255,253,247,0.95)] hover:text-on-canvas",
              "rounded-md",
              "aria-pressed:bg-run aria-pressed:border-run-dark aria-pressed:text-on-run",
              "aria-pressed:hover:bg-run-hi aria-pressed:hover:text-on-run",
            )}
          >
            jumps
          </Toggle>
          <Toggle
            pressed={showDensity}
            onPressedChange={onToggleDensity}
            aria-label="Toggle the stitch-density heatmap"
            title="Toggle the stitch-density heatmap"
            className={cn(
              "h-auto py-[5px] px-[9px]",
              "font-mono text-[10px] tracking-[0.12em] uppercase",
              "bg-[rgba(255,253,247,0.85)] border border-[var(--on-canvas-45)] text-on-canvas",
              "hover:bg-[rgba(255,253,247,0.95)] hover:text-on-canvas",
              "rounded-md",
              "aria-pressed:bg-run aria-pressed:border-run-dark aria-pressed:text-on-run",
              "aria-pressed:hover:bg-run-hi aria-pressed:hover:text-on-run",
            )}
          >
            density
          </Toggle>
        </div>
      </div>
      <PlaybackBar
        total={design.pts.length}
        scrubPos={scrubPos}
        onScrubChange={onScrubChange}
        activeLine={activeLine}
        lineSegments={lineSegments}
      />
    </section>
  );
}
