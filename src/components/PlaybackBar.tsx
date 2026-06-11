import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './PlaybackBar.module.css';

interface Props {
  total: number;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
}

export default function PlaybackBar({ total, scrubPos, onScrubChange, activeLine }: Props) {
  // Store *which* total value started playback rather than a plain boolean.
  // When `total` changes (new design loaded), `playing` becomes false automatically
  // during render — no useEffect needed to call setPlaying(false).
  const [playingForTotal, setPlayingForTotal] = useState<number | null>(null);
  const playing = playingForTotal === total;
  const playReqRef = useRef<number | null>(null);

  const stopPlay = useCallback(() => {
    setPlayingForTotal(null);
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  // Stable cleanup: cancels any in-flight rAF without touching state.
  // playing is already derived from playingForTotal === total, so it
  // auto-corrects to false during the render that sees the new total.
  const cancelFrame = useCallback(() => {
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  // When total changes (new design), cancel any in-flight animation frame.
  // No state setter in the effect body — playing is derived, not reset here.
  useEffect(() => {
    return cancelFrame;
  }, [total, cancelFrame]);

  const startPlay = useCallback(() => {
    if (total === 0) return;
    let pos = scrubPos >= total ? 0 : scrubPos;
    const perFrame = Math.max(1, Math.round(total / 420)); // ~7 s at 60 fps
    setPlayingForTotal(total);
    function step() {
      pos += perFrame;
      if (pos >= total) {
        onScrubChange(total);
        setPlayingForTotal(null);
        playReqRef.current = null;
        return;
      }
      onScrubChange(pos);
      playReqRef.current = requestAnimationFrame(step);
    }
    playReqRef.current = requestAnimationFrame(step);
  }, [total, scrubPos, onScrubChange]);

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
        type="button"
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
        {activeLine !== null && <span className={styles.lineInfo}> · line {activeLine}</span>}
      </span>
    </div>
  );
}
