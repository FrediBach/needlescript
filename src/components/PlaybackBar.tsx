import { useState, useRef, useCallback, useEffect } from 'react';
import type { LineSegment } from '../App.tsx';
import styles from './PlaybackBar.module.css';
import { Button } from '@/components/ui/button.tsx';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select.tsx';
import { cn } from '@/lib/utils.ts';

const SPEEDS = [
  { value: 0.125, label: '⅛×' },
  { value: 0.25, label: '¼×' },
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

interface Props {
  total: number;
  scrubPos: number;
  onScrubChange: (v: number) => void;
  activeLine: number | null;
  lineSegments: LineSegment[];
  highlightLines: number[];
}

export default function PlaybackBar({
  total,
  scrubPos,
  onScrubChange,
  activeLine,
  lineSegments,
  highlightLines,
}: Props) {
  const [playingForTotal, setPlayingForTotal] = useState<number | null>(null);
  const playing = playingForTotal === total;
  const playReqRef = useRef<number | null>(null);

  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const stopPlay = useCallback(() => {
    setPlayingForTotal(null);
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  const cancelFrame = useCallback(() => {
    if (playReqRef.current !== null) {
      cancelAnimationFrame(playReqRef.current);
      playReqRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cancelFrame;
  }, [total, cancelFrame]);

  const startPlay = useCallback(() => {
    if (total === 0) return;
    let pos = scrubPos >= total ? 0 : scrubPos;
    setPlayingForTotal(total);
    function step() {
      const perFrame = Math.max(1, Math.round((total / 420) * speedRef.current));
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

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      stopPlay();
      onScrubChange(Number(e.target.value));
    },
    [stopPlay, onScrubChange],
  );

  const handleSpeedChange = useCallback((value: string | null) => {
    if (value) setSpeed(Number(value));
  }, []);

  let activeSegIdx = -1;
  if (scrubPos > 0 && total > 0) {
    for (let i = lineSegments.length - 1; i >= 0; i--) {
      if (lineSegments[i].start < scrubPos) {
        activeSegIdx = i;
        break;
      }
    }
  }

  const hi = highlightLines.length ? new Set(highlightLines) : null;

  const totalStr = total.toLocaleString();
  const paddedPos = scrubPos.toLocaleString().padStart(totalStr.length, '\u2007');
  const paddedLine = (activeLine ?? 0).toString().padStart(4, '\u2007');

  return (
    <div className={styles.playbar}>
      {/* Play / Pause */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={handlePlayClick}
        aria-label={playing ? 'Pause stitch sequence' : 'Play stitch sequence'}
        className={cn(
          'w-[34px] h-[30px] font-mono text-body',
          'bg-canvas border-[var(--on-canvas-45)] text-on-canvas',
          'hover:bg-canvas-hover hover:text-on-canvas',
        )}
      >
        {playing ? '❚❚' : '▶'}
      </Button>

      {/* Speed selector */}
      <Select value={String(speed)} onValueChange={handleSpeedChange}>
        <SelectTrigger
          aria-label="Playback speed"
          title="Playback speed"
          className={cn(
            'h-[30px] w-auto font-mono text-sub px-1.5',
            'bg-canvas border-[var(--on-canvas-45)] text-on-canvas',
            'hover:bg-canvas-hover',
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="font-mono text-[11px] min-w-[60px]">
          {SPEEDS.map((s) => (
            <SelectItem key={s.value} value={String(s.value)}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Scrub range + code timeline (unchanged — custom unit) */}
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
                    ? 'var(--gold-55)'
                    : i % 2 === 0
                      ? 'var(--on-canvas-10)'
                      : 'var(--on-canvas-22)'
                }
              />
            );
          })}
          {/* Warning highlight overlay — marks the parts where the hovered
              hotspot warning was stitched. Drawn above the base strip. */}
          {hi &&
            lineSegments.map((seg, i) => {
              if (!hi.has(seg.line)) return null;
              const nextStart = lineSegments[i + 1]?.start ?? total;
              return (
                <rect
                  key={`hl-${i}`}
                  x={seg.start}
                  y={0}
                  width={nextStart - seg.start}
                  height={1}
                  fill="rgba(200,38,24,0.78)"
                />
              );
            })}
        </svg>
      </div>

      <span className={styles.counter}>
        {paddedPos} / {totalStr} stitches
        <span
          className={styles.lineInfo}
          style={activeLine === null ? { visibility: 'hidden' } : undefined}
        >
          {' · line '}
          {paddedLine}
        </span>
      </span>
    </div>
  );
}
