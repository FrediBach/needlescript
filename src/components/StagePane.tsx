import type { DesignState, LineSegment } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';

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
        <button
          type="button"
          className={`${styles.densityBtn}${showDensity ? ' ' + styles.densityOn : ''}`}
          onClick={onToggleDensity}
          title="Toggle the stitch-density heatmap"
          aria-pressed={showDensity}
        >
          density
        </button>
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
