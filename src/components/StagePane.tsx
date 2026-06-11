import type { DesignState } from '../App.tsx';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';

interface Props {
  design: DesignState;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  showDensity: boolean;
  onToggleDensity: () => void;
}

export default function StagePane({ design, scrubPos, onScrubChange, activeLine, showDensity, onToggleDensity }: Props) {
  return (
    <section className={styles.pane}>
      <div className={styles.fabric}>
        <StageCanvas design={design} scrubPos={scrubPos} showDensity={showDensity} />
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
      />
    </section>
  );
}
