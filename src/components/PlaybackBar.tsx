import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './PlaybackBar.module.css';

interface Props {
  total: number;
  scrubPos: number;
  onScrubChange: (v: number) => void;
}

export default function PlaybackBar({ total, scrubPos, onScrubChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const playReqRef = useRef<number | null>(null);

  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  const startPlay = useCallback(() => {
    if (total === 0) return;
    let pos = scrubPos >= total ? 0 : scrubPos;
    const perFrame = Math.max(1, Math.round(total / 420)); // ~7 s at 60 fps
    setPlaying(true);
    function step() {
      pos += perFrame;
      if (pos >= total) {
        onScrubChange(total);
        setPlaying(false);
        playReqRef.current = null;
        return;
      }
      onScrubChange(pos);
      playReqRef.current = requestAnimationFrame(step);
    }
    playReqRef.current = requestAnimationFrame(step);
  }, [total, scrubPos, onScrubChange]);

  // Stop playback if total changes (new design)
  useEffect(() => {
    stopPlay();
  }, [total, stopPlay]);

  const handlePlayClick = useCallback(() => {
    if (playing) stopPlay();
    else startPlay();
  }, [playing, stopPlay, startPlay]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    stopPlay();
    onScrubChange(Number(e.target.value));
  }, [stopPlay, onScrubChange]);

  return (
    <div className={styles.playbar}>
      <button
        className={styles.playBtn}
        onClick={handlePlayClick}
        aria-label={playing ? 'Pause stitch sequence' : 'Play stitch sequence'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        className={styles.scrub}
        min={0}
        max={total}
        value={scrubPos}
        onChange={handleScrub}
        aria-label="Stitch playback position"
      />
      <span className={styles.counter}>
        {scrubPos.toLocaleString()} / {total.toLocaleString()} stitches
      </span>
    </div>
  );
}
