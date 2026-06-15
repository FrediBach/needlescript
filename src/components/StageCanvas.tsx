import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesignState } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import { THREADS } from '../data.ts';

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  showDensity: boolean;
}

/** Viewport in mm-space. When null the view auto-fits the hoop. */
type Viewport = {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
};

/** Cached rendering transform so pointer handlers can convert CSS px → mm. */
type RenderTransform = {
  scale: number;  // physical px per mm (current, possibly zoomed)
  cx: number;     // canvas center x in physical px
  cy: number;     // canvas center y in physical px
  viewCX: number; // viewport center x in mm
  viewCY: number; // viewport center y in mm
};

type DragState = {
  startX: number;   // CSS px, relative to canvas top-left
  startY: number;
  currentX: number;
  currentY: number;
};

export default function StageCanvas({ design, hoop, scrubPos, showDensity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<RenderTransform | null>(null);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // ── draw on prop / viewport change ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.round(box.width  * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    transformRef.current = draw(canvas, design, hoop, scrubPos, dpr, showDensity, viewport);
  }, [design, hoop, scrubPos, showDensity, viewport]);

  // ── redraw on container resize ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const container = canvas.parentElement;
      if (!container) return;
      const box = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.max(1, Math.round(box.width  * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
      transformRef.current = draw(canvas, design, hoop, scrubPos, dpr, showDensity, viewport);
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [design, hoop, scrubPos, showDensity, viewport]);

  // ── pointer handlers ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragState({ startX: x, startY: y, currentX: x, currentY: y });
    canvas.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragState(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  }, [dragState]);

  const handlePointerUp = useCallback((_e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;

    const { startX, startY, currentX, currentY } = dragState;
    setDragState(null);

    const dx = currentX - startX;
    const dy = currentY - startY;

    // Ignore tiny drags (accidental clicks, double-click pair)
    if (Math.abs(dx) < 10 || Math.abs(dy) < 10) return;

    const t = transformRef.current;
    if (!t) return;

    const dpr = window.devicePixelRatio || 1;
    const { scale, cx, cy, viewCX, viewCY } = t;

    // CSS pixels → mm using current (possibly zoomed) transform
    const cssToMmX = (cssX: number) => viewCX + (cssX * dpr - cx) / scale;
    const cssToMmY = (cssY: number) => viewCY - (cssY * dpr - cy) / scale;

    const mmX1 = cssToMmX(startX);
    const mmY1 = cssToMmY(startY);
    const mmX2 = cssToMmX(currentX);
    const mmY2 = cssToMmY(currentY);

    const halfW = Math.abs(mmX2 - mmX1) / 2;
    const halfH = Math.abs(mmY2 - mmY1) / 2;
    if (halfW < 0.01 || halfH < 0.01) return;

    setViewport({
      centerX: (mmX1 + mmX2) / 2,
      centerY: (mmY1 + mmY2) / 2,
      halfW,
      halfH,
    });
  }, [dragState]);

  const handleDoubleClick = useCallback(() => {
    // Only reset if currently zoomed in; no-op when already at default view
    if (viewport !== null) {
      setViewport(null);
    }
  }, [viewport]);

  // ── derive zoom level for indicator ─────────────────────────────────────
  // Computed directly from canvasRef + viewport during render so the badge
  // always reflects the new viewport in the same render pass that sets it
  // (no stale-ref lag).
  const zoomLevel = (() => {
    if (!viewport) return null;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const autoFit = computeAutoFitScale(canvas.width, canvas.height, design, hoop);
    if (autoFit === 0) return null;
    const zoomed = Math.min(
      canvas.width  / (2 * viewport.halfW),
      canvas.height / (2 * viewport.halfH),
    );
    return zoomed / autoFit;
  })();

  // Drag rectangle in CSS px
  const dragRect = dragState && (
    Math.abs(dragState.currentX - dragState.startX) > 2 ||
    Math.abs(dragState.currentY - dragState.startY) > 2
  ) ? dragState : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          display: 'block', cursor: 'crosshair',
        }}
      />

      {/* Drag-to-zoom selection rectangle */}
      {dragRect && (
        <div
          style={{
            position: 'absolute',
            left:   Math.min(dragRect.startX,   dragRect.currentX),
            top:    Math.min(dragRect.startY,   dragRect.currentY),
            width:  Math.abs(dragRect.currentX - dragRect.startX),
            height: Math.abs(dragRect.currentY - dragRect.startY),
            border: '1.5px solid rgba(255, 255, 255, 0.80)',
            background: 'rgba(255, 255, 255, 0.07)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Zoom level indicator — lower-right corner, only when zoomed in */}
      {zoomLevel !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            padding: '2px 7px',
            borderRadius: 4,
            background: 'rgba(20, 15, 10, 0.55)',
            color: 'rgba(255, 245, 230, 0.90)',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {zoomLevel.toFixed(1)}×
        </div>
      )}
    </>
  );
}

// ── rendering ────────────────────────────────────────────────────────────────

function draw(
  canvas: HTMLCanvasElement,
  design: DesignState,
  hoop: HoopConfig,
  scrubPos: number,
  dpr: number,
  showDensity: boolean,
  viewport: Viewport | null,
): RenderTransform {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { scale: 1, cx: 0, cy: 0, viewCX: 0, viewCY: 0 };
  const w = canvas.width, h = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Auto-fit scale (shared logic with computeAutoFitScale helper)
  const autoFitScale = computeAutoFitScale(w, h, design, hoop);

  // Active scale and viewport center
  let scale: number;
  let viewCX: number;
  let viewCY: number;

  if (viewport) {
    scale  = Math.min(w / (2 * viewport.halfW), h / (2 * viewport.halfH));
    viewCX = viewport.centerX;
    viewCY = viewport.centerY;
  } else {
    scale  = autoFitScale;
    viewCX = 0;
    viewCY = 0;
  }

  const cx = w / 2, cy = h / 2;
  const X = (mx: number) => cx + (mx - viewCX) * scale;
  const Y = (my: number) => cy - (my - viewCY) * scale; // y-up in mm

  drawHoop(ctx, hoop, scale, cx, cy, viewCX, viewCY, w, h);

  const pts = design.pts;
  const upto = Math.min(pts.length, scrubPos || 0);
  if (pts.length === 0) return { scale, cx, cy, viewCX, viewCY };

  // Jumps (under the thread)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.strokeStyle = 'rgba(90,80,60,0.5)';
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  for (let i = 1; i < upto; i++) {
    if (pts[i].t === 'jump') {
      ctx.moveTo(X(pts[i - 1].x), Y(pts[i - 1].y));
      ctx.lineTo(X(pts[i].x),     Y(pts[i].y));
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Thread, batched per colour/underlay run
  const tw = Math.max(1.1 * dpr, Math.min(0.45 * scale, 4.5 * dpr));
  let runColor: number | null = null;
  let runU = false;
  ctx.beginPath();
  for (let j = 1; j < upto; j++) {
    const p = pts[j], q = pts[j - 1];
    if (p.t !== 'stitch') continue;
    const pu = p.u === 1;
    if (p.c !== runColor || pu !== runU) {
      if (runColor !== null) ctx.stroke();
      runColor = p.c;
      runU = pu;
      ctx.strokeStyle = THREADS[runColor % THREADS.length];
      ctx.lineWidth = pu ? Math.max(0.8 * dpr, tw * 0.5) : tw;
      ctx.globalAlpha = pu ? 0.4 : 1;
      ctx.beginPath();
    }
    ctx.moveTo(X(q.x), Y(q.y));
    ctx.lineTo(X(p.x), Y(p.y));
  }
  if (runColor !== null) ctx.stroke();
  ctx.globalAlpha = 1;

  // Needle penetration points (visible when zoomed enough)
  if (scale > 2.4 * dpr) {
    ctx.fillStyle = 'rgba(40,30,20,0.45)';
    const r = Math.max(0.8 * dpr, 0.09 * scale);
    for (let k = 0; k < upto; k++) {
      if (pts[k].t !== 'stitch') continue;
      ctx.beginPath();
      ctx.arc(X(pts[k].x), Y(pts[k].y), r, 0, 6.2832);
      ctx.fill();
    }
  }

  // Density heatmap overlay
  if (showDensity && design.density) {
    const { cellMM, cells } = design.density;
    for (const c of cells) {
      if (c.layers < 1.2) continue;
      const hot = Math.min(1, c.layers / 4);
      ctx.fillStyle = c.layers >= 3
        ? `rgba(200, 38, 24, ${0.18 + hot * 0.42})`
        : `rgba(228, 138, 32, ${0.10 + hot * 0.30})`;
      const x0 = X(c.ix * cellMM);
      const y0 = Y((c.iy + 1) * cellMM);
      ctx.fillRect(x0, y0, cellMM * scale + 0.5, cellMM * scale + 0.5);
    }
  }

  // Needle marker while scrubbed back
  if (upto > 0 && upto < pts.length) {
    const n = pts[upto - 1];
    ctx.strokeStyle = '#1B2030';
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(X(n.x), Y(n.y), 4.5 * dpr, 0, 6.2832);
    ctx.stroke();
  }

  // Debug pins from the `mark` command
  const visibleMarks = design.marks.filter(mk => mk.at <= upto);
  if (visibleMarks.length) {
    const r = 6 * dpr;
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    visibleMarks.forEach((mk, i) => {
      const mx = X(mk.x), my = Y(mk.y);
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, 6.2832);
      ctx.fillStyle = 'rgba(255, 253, 247, 0.92)';
      ctx.fill();
      ctx.strokeStyle = '#C8472F';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
      ctx.fillStyle = '#C8472F';
      ctx.fillText(String(i + 1), mx, my + 0.5 * dpr);
    });
  }

  return { scale, cx, cy, viewCX, viewCY };
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Auto-fit scale in physical px/mm — used by draw() and the render-time zoom
 *  level indicator so both always agree without a stale-ref round-trip. */
function computeAutoFitScale(w: number, h: number, design: DesignState, hoop: HoopConfig): number {
  const hoopHalfW = hoop.widthMM / 2;
  const hoopHalfH = hoop.heightMM / 2;
  let extX = hoopHalfW + 6;
  let extY = hoopHalfH + 6;
  if (design.stats) {
    const neededX = Math.max(Math.abs(design.stats.minX), Math.abs(design.stats.maxX));
    const neededY = Math.max(Math.abs(design.stats.minY), Math.abs(design.stats.maxY));
    extX = Math.max(extX, neededX + 6);
    extY = Math.max(extY, neededY + 6);
  }
  return Math.min(w / (2 * extX), h / (2 * extY));
}

// ── hoop rendering ───────────────────────────────────────────────────────────

function drawHoop(
  ctx: CanvasRenderingContext2D,
  hoop: HoopConfig,
  scale: number,
  cx: number,
  cy: number,
  viewCX: number,
  viewCY: number,
  canvasW: number,
  canvasH: number,
) {
  const rx = (hoop.widthMM  / 2) * scale;
  const ry = (hoop.heightMM / 2) * scale;

  // Hoop center in canvas-pixel space (may be off-center when zoomed)
  const hcx = cx + (0 - viewCX) * scale;
  const hcy = cy - (0 - viewCY) * scale;

  // Dark overlay outside the hoop (even-odd fill)
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 4, 0.1)';
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  addHoopPath(ctx, hoop, rx, ry, hcx, hcy, scale);
  ctx.fill('evenodd');
  ctx.restore();

  // Hoop boundary line
  ctx.save();
  ctx.beginPath();
  addHoopPath(ctx, hoop, rx, ry, hcx, hcy, scale);
  ctx.strokeStyle = 'rgba(90, 75, 55, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function addHoopPath(
  ctx: CanvasRenderingContext2D,
  hoop: HoopConfig,
  rx: number,
  ry: number,
  cx: number,
  cy: number,
  scale: number,
) {
  if (hoop.shape === 'circle') {
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  } else if (hoop.shape === 'oval') {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    const r = Math.min(5 * scale, rx * 0.12, ry * 0.12);
    const x = cx - rx, y = cy - ry, w = rx * 2, h = ry * 2;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,       x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h,   x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h,   x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,       x + r, y,          r);
    ctx.closePath();
  }
}
