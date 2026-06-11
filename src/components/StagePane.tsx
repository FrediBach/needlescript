import type { DesignState } from '../App.tsx';
import StageCanvas from './StageCanvas.tsx';
import PlaybackBar from './PlaybackBar.tsx';
import StatsChips from './StatsChips.tsx';
import styles from './StagePane.module.css';

interface Props {
  design: DesignState;
  scrubPos: number;
  onScrubChange: (v: number) => void;
}

export default function StagePane({ design, scrubPos, onScrubChange }: Props) {
  return (
    <section className={styles.pane}>
      <div className={styles.fabric}>
        <StageCanvas design={design} scrubPos={scrubPos} />
        <StatsChips design={design} />
      </div>
      <PlaybackBar
        total={design.pts.length}
        scrubPos={scrubPos}
        onScrubChange={onScrubChange}
      />
    </section>
  );
}
