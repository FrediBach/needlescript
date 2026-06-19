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
}

export default function StagePane({ design, hoop, scrubPos, onScrubChange, activeLine, lineSegments, showDensity, onToggleDensity }: Props) {
  return (
    <section className={styles.pane}>
      <div className={styles.fabric}>
        <StageCanvas design={design} hoop={hoop} scrubPos={scrubPos} showDensity={showDensity} />
        <StatsChips design={design} />
        <Toggle
          pressed={showDensity}
          onPressedChange={onToggleDensity}
          aria-label="Toggle the stitch-density heatmap"
          title="Toggle the stitch-density heatmap"
          className={cn(
            "absolute top-[10px] right-[10px] h-auto py-[5px] px-[9px]",
            "font-mono text-[10px] tracking-[0.12em] uppercase",
            "bg-[rgba(255,253,247,0.85)] border border-[rgba(125,100,60,0.45)] text-[#4A3F2C]",
            "hover:bg-[rgba(255,253,247,0.95)] hover:text-[#4A3F2C]",
            "rounded-md",
            // Pressed (density on) state
            "aria-pressed:bg-[#C8472F] aria-pressed:border-[#A23722] aria-pressed:text-[#FFFDF7]",
            "aria-pressed:hover:bg-[#D55036] aria-pressed:hover:text-[#FFFDF7]",
          )}
        >
          density
        </Toggle>
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
