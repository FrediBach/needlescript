import { useState, useRef, useCallback, useEffect } from 'react';
import type { LineSegment } from '../App.tsx';
import styles from './PlaybackBar.module.css';

const SPEEDS = [
  { value: 0.125, label: '⅛×' },
  { value: 0.25, label: '¼×' },
  { value: 0.5, label: '½×' },
  { value: 1,   label: '1×' },
  { value: 2,   label: '2×' },
  { value: 4,   label: '4×' },
];

interface Props {
  total: number;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  lineSegments: LineSegment[];
}

export default function PlaybackBar({ total, scrubPos, onScrubChange, activeLine, lineSegments }: Props) {
  // Store *which* total value started playback rather than a plain boolean.
  // When `total` changes (new design loaded), `playing` becomes false automatically
  // during render — no useEffect needed to call setPlaying(false).
  const [playingForTotal, setPlayingForTotal] = useState<number | null>(null);
  const playing = playingForTotal === total;
  const playReqRef = useRef<number | null>(null);

  const [speed, setSpeed] = useState(1);
  // Keep a ref so the rAF step closure always reads the latest speed without
  // being a dependency of startPlay (which would restart the loop on change).
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const stopPlay = useCallback(() => {
    setPlayingForTotal(null);
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  // Stable cleanup: cancels any in-flight rAF without touching state.
  const cancelFrame = useCallback(() => {
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  // When total changes (new design), cancel any in-flight animation frame.
  useEffect(() => {
    return cancelFrame;
  }, [total, cancelFrame]);

  const startPlay = useCallback(() => {
    if (total === 0) return;
    let pos = scrubPos >= total ? 0 : scrubPos;
    setPlayingForTotal(total);
    function step() {
      // Recompute perFrame each step so a mid-playback speed change takes effect
      // immediately, without restarting the loop or adding speed to deps.
      const perFrame = Math.max(1, Math.round(total / 420 * speedRef.current));
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
  }, [total, scrubPos, onScrubChange]); // speedRef is a ref, not a reactive dep

  const handlePlayClick = useCallback(() => {
    if (playing) stopPlay();
    else startPlay();
  }, [playing, stopPlay, startPlay]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    stopPlay();
    onScrubChange(Number(e.target.value));
  }, [stopPlay, onScrubChange]);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSpeed(Number(e.target.value));
  }, []);

  // Find which segment scrubPos falls in (O(n), n is small).
  let activeSegIdx = -1;
  if (scrubPos > 0 && total > 0) {
    for (let i = lineSegments.length - 1; i >= 0; i--) {
      if (lineSegments[i].start < scrubPos) {
        activeSegIdx = i;
        break;
      }
    }
  }

  // Stable-width counter text.
  // Pad scrubPos with figure spaces (U+2007 — same width as a digit in
  // proportional fonts, same as any char in monospace) so the counter
  // never changes width as playback advances from "0" toward totalStr.
  const totalStr = total.toLocaleString();
  const paddedPos = scrubPos.toLocaleString().padStart(totalStr.length, '\u2007');
  // Pad the line number to 4 digits so lines 1–9999 never shift the width.
  const paddedLine = (activeLine ?? 0).toString().padStart(4, '\u2007');

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

      <select
        className={styles.speedSelect}
        value={speed}
        onChange={handleSpeedChange}
        aria-label="Playback speed"
        title="Playback speed"
      >
        {SPEEDS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <div className={styles.scrubArea}>
        <input
          type="range"
          className={styles.scrub}
          min={0}
          max={total}
          value={scrubPos}
          onChange={handleScrub}
          aria-label="Stitch playback position"
        />
        {/* Code timeline: one proportional rect per consecutive source-line run */}
        <svg
          viewBox={`0 0 ${total || 1} 1`}
          preserveAspectRatio="none"
          className={styles.lineMap}
          aria-hidden="true"
        >
          {lineSegments.map((seg, i) => {
            const nextStart = lineSegments[i + 1]?.start ?? total;
            const isActive = i === activeSegIdx;
            return (
              <rect
                key={i}
                x={seg.start}
                y={0}
                width={nextStart - seg.start}
                height={1}
                fill={
                  isActive
                    ? 'rgba(217,164,65,0.55)'
                    : i % 2 === 0
                      ? 'rgba(125,100,60,0.10)'
                      : 'rgba(125,100,60,0.22)'
                }
              />
            );
          })}
        </svg>
      </div>

      <span className={styles.counter}>
        {paddedPos} / {totalStr} stitches
        {/* Always rendered so its width is always reserved; hidden when no active line. */}
        <span
          className={styles.lineInfo}
          style={activeLine === null ? { visibility: 'hidden' } : undefined}
        >
          {' · line '}{paddedLine}
        </span>
      </span>
    </div>
  );
}
