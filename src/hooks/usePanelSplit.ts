import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Manages the horizontal editor/stage panel split.
 *
 * Tracks the left pane's pixel width (default ≈ 44 % of the viewport),
 * detects the mobile breakpoint (≤ 880 px) where CSS Grid takes over from
 * JS-driven widths, and exposes drag / double-click-to-reset handlers.
 */
export function usePanelSplit() {
  const [leftWidth, setLeftWidth] = useState<number>(() =>
    Math.max(330, Math.round(window.innerWidth * 0.44)),
  );

  // On small screens CSS Grid owns sizing; skip inline-width entirely.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 880px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const mainRef = useRef<HTMLDivElement>(null);

  const handleHorizDrag = useCallback((delta: number) => {
    const total = mainRef.current?.offsetWidth ?? window.innerWidth;
    setLeftWidth((w) => Math.max(240, Math.min(w + delta, total - 240)));
  }, []);

  const handleHorizReset = useCallback(() => {
    const total = mainRef.current?.offsetWidth ?? window.innerWidth;
    setLeftWidth(Math.max(330, Math.round(total * 0.44)));
  }, []);

  return { leftWidth, isMobile, mainRef, handleHorizDrag, handleHorizReset };
}
