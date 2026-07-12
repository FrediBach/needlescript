import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DesignState, LineStitchBounds } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import type { WarningLocation } from '../lib/engine.ts';
import { THREADS } from '../data.ts';
import { projectPoint } from '../lib/parse-parameters.ts';
import type { PointParamDef, XYRegion } from '../lib/parse-parameters.ts';
import {
  canvasJumpThread,
  canvasNeedlePoint,
  canvasHoopOverlay,
  canvasHoopBoundary,
  canvasGridCm,
  canvasNeedleMarker,
  canvasDebugPinFill,
  canvasDebugPinStroke,
  canvasDragRectBorder,
  canvasDragRectFill,
  canvasZoomBadgeBg,
  canvasZoomBadgeText,
  canvasDensityHot,
  canvasDensityWarm,
  canvasWarnMarkerFill,
  canvasWarnMarkerStroke,
  canvasWarnMarkerCore,
  fontMono,
  fsBase,
  gold,
  goldHi,
} from '../theme.ts';

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  showDensity: boolean;
  hideJumps: boolean;
  warningLoc: WarningLocation | null;
  /** Bounding box of the source line currently hovered in the editor.
   *  When set, a semi-transparent rect is drawn over the affected area. */
  hoveredLineBounds?: LineStitchBounds | null;
  /** SVG-import staging overlays drawn above the stitches (optional). */
  overlays?: CanvasOverlay[];
  /** Click-to-pick handler in mm space, for canvas → row linking (optional). */
  onPick?: (mm: { x: number; y: number }) => void;
  // ── XY handle props ────────────────────────────────────────────────────────
  /** Point parameters to render as draggable handles on the stage. */
  pointParams?: PointParamDef[];
  /** Whether to show handles (can be toggled with the "handles" chip). */
  showHandles?: boolean;
  /** Name of the handle currently highlighted (from panel row hover / Locate). */
  highlightedHandle?: string | null;
  /** Names of locked params — locks render as gold-filled handles. */
  lockedHandles?: Set<string>;
  /** Fired while the user is dragging a handle (throttled by caller). */
  onHandleDrag?: (name: string, line: number, x: number, y: number) => void;
  /** Fired on pointer-up (or Esc-cancel with restored start values). */
  onHandleCommit?: (name: string, line: number, x: number, y: number) => void;
}

/** A set of rings drawn over the stitches for the staging workspace. */
export interface CanvasOverlay {
  rings: [number, number][][];
  /** ghost = faint excluded outline · overlay = source artwork · highlight = selection */
  kind: 'ghost' | 'overlay' | 'highlight';
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
  scale: number; // physical px per mm (current, possibly zoomed)
  cx: number; // canvas center x in physical px
  cy: number; // canvas center y in physical px
  viewCX: number; // viewport center x in mm
  viewCY: number; // viewport center y in mm
};

type DragState = {
  startX: number; // CSS px, relative to canvas top-left
  startY: number;
  currentX: number;
  currentY: number;
};

/** State for an in-progress handle drag. */
type HandleDragState = {
  name: string;
  line: number;
  region: XYRegion;
  snap?: number;
  /** Handle position when drag started — used as baseline for Alt precision mode */
  startMmX: number;
  startMmY: number;
  /** Pointer position (mm) when drag started — used for Alt precision mode */
  startPointerMmX: number;
  startPointerMmY: number;
  /** Current projected position during drag */
  currentMmX: number;
  currentMmY: number;
};

export default function StageCanvas({
  design,
  hoop,
  scrubPos,
  showDensity,
  hideJumps,
  warningLoc,
  hoveredLineBounds,
  overlays,
  onPick,
  pointParams,
  showHandles = true,
  highlightedHandle,
  lockedHandles,
  onHandleDrag,
  onHandleCommit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<RenderTransform | null>(null);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // ── Handle interaction state ─────────────────────────────────────────────
  /** Active handle drag — kept in a ref (not state) to avoid re-render thrash */
  const handleDragRef = useRef<HandleDragState | null>(null);
  /** Which handle name is under the pointer (idle hover — drives cursor + region show) */
  const [hoveredHandleName, setHoveredHandleName] = useState<string | null>(null);
  /** Which handle is being actively dragged (in state so canvas redraws) */
  const [draggingHandleName, setDraggingHandleName] = useState<string | null>(null);
  /** Live drag position in mm — updated per pointer-move, triggers redraw */
  const [dragMm, setDragMm] = useState<{ x: number; y: number } | null>(null);

  // Stable refs so pointer handlers always read the latest props without
  // being re-created (same pattern as lineStitchMapRef in EditorPane).
  const pointParamsRef = useRef(pointParams);
  const showHandlesRef = useRef(showHandles);
  const highlightedHandleRef = useRef(highlightedHandle);
  const lockedHandlesRef = useRef(lockedHandles);
  const onHandleDragRef = useRef(onHandleDrag);
  const onHandleCommitRef = useRef(onHandleCommit);
  useLayoutEffect(() => {
    pointParamsRef.current = pointParams;
    showHandlesRef.current = showHandles;
    highlightedHandleRef.current = highlightedHandle;
    lockedHandlesRef.current = lockedHandles;
    onHandleDragRef.current = onHandleDrag;
    onHandleCommitRef.current = onHandleCommit;
  });

  // ── draw on prop / viewport / handle-state change ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    transformRef.current = draw(
      canvas,
      design,
      hoop,
      scrubPos,
      dpr,
      showDensity,
      hideJumps,
      viewport,
      warningLoc,
      hoveredLineBounds ?? null,
      overlays,
      pointParams ?? [],
      showHandles,
      hoveredHandleName,
      draggingHandleName,
      dragMm,
      highlightedHandle ?? null,
      lockedHandles ?? new Set(),
    );
  }, [
    design,
    hoop,
    scrubPos,
    showDensity,
    hideJumps,
    viewport,
    warningLoc,
    hoveredLineBounds,
    overlays,
    pointParams,
    showHandles,
    hoveredHandleName,
    draggingHandleName,
    dragMm,
    highlightedHandle,
    lockedHandles,
  ]);

  // ── redraw on container resize ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const container = canvas.parentElement;
      if (!container) return;
      const box = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
      transformRef.current = draw(
        canvas,
        design,
        hoop,
        scrubPos,
        dpr,
        showDensity,
        hideJumps,
        viewport,
        warningLoc,
        hoveredLineBounds ?? null,
        overlays,
        pointParamsRef.current ?? [],
        showHandlesRef.current ?? true,
        hoveredHandleName,
        draggingHandleName,
        dragMm,
        highlightedHandleRef.current ?? null,
        lockedHandlesRef.current ?? new Set(),
      );
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [
    design,
    hoop,
    scrubPos,
    showDensity,
    hideJumps,
    viewport,
    warningLoc,
    hoveredLineBounds,
    overlays,
    hoveredHandleName,
    draggingHandleName,
    dragMm,
  ]);

  // ── Esc cancels an in-progress handle drag ───────────────────────────────
  useEffect(() => {
    if (!draggingHandleName) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const drag = handleDragRef.current;
      if (drag) {
        // Restore the drag-start position
        onHandleCommitRef.current?.(drag.name, drag.line, drag.startMmX, drag.startMmY);
        handleDragRef.current = null;
      }
      setDraggingHandleName(null);
      setDragMm(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [draggingHandleName]);

  // ── pointer handlers ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    // Hit-test handles first; they take priority over canvas panning
    const t = transformRef.current;
    if (t && showHandlesRef.current && (pointParamsRef.current?.length ?? 0) > 0) {
      const dpr = window.devicePixelRatio || 1;
      const threshold = e.pointerType === 'touch' ? 24 : 12;
      let bestHandle: PointParamDef | null = null;
      let bestDist = threshold;
      for (const p of pointParamsRef.current ?? []) {
        const hcssX = (t.cx + (p.valueX - t.viewCX) * t.scale) / dpr;
        const hcssY = (t.cy - (p.valueY - t.viewCY) * t.scale) / dpr;
        const dist = Math.sqrt((cssX - hcssX) ** 2 + (cssY - hcssY) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestHandle = p;
        }
      }
      if (bestHandle) {
        canvas.setPointerCapture(e.pointerId);
        const pointerMmX = t.viewCX + (cssX * dpr - t.cx) / t.scale;
        const pointerMmY = t.viewCY - (cssY * dpr - t.cy) / t.scale;
        handleDragRef.current = {
          name: bestHandle.name,
          line: bestHandle.line,
          region: bestHandle.region,
          snap: bestHandle.snap,
          startMmX: bestHandle.valueX,
          startMmY: bestHandle.valueY,
          startPointerMmX: pointerMmX,
          startPointerMmY: pointerMmY,
          currentMmX: bestHandle.valueX,
          currentMmY: bestHandle.valueY,
        };
        setDraggingHandleName(bestHandle.name);
        setDragMm({ x: bestHandle.valueX, y: bestHandle.valueY });
        return; // consumed — skip zoom drag
      }
    }

    // No handle hit — start zoom drag
    setDragState({ startX: cssX, startY: cssY, currentX: cssX, currentY: cssY });
    canvas.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const t = transformRef.current;

      // ── Active handle drag ────────────────────────────────────────────────
      const drag = handleDragRef.current;
      if (drag) {
        if (!t) return;
        const pointerMmX = t.viewCX + (cssX * dpr - t.cx) / t.scale;
        const pointerMmY = t.viewCY - (cssY * dpr - t.cy) / t.scale;

        const precision = e.altKey ? 0.25 : 1.0;
        const rawX = drag.startMmX + (pointerMmX - drag.startPointerMmX) * precision;
        const rawY = drag.startMmY + (pointerMmY - drag.startPointerMmY) * precision;

        // Shift key: disable declared snap if present, or enable 1 mm snap if not
        let effSnap = drag.snap;
        if (drag.snap !== undefined && e.shiftKey) effSnap = undefined;
        else if (drag.snap === undefined && e.shiftKey) effSnap = 1;

        const { x: projX, y: projY } = projectPoint({ x: rawX, y: rawY }, drag.region, effSnap);
        drag.currentMmX = projX;
        drag.currentMmY = projY;

        setDragMm({ x: projX, y: projY });
        onHandleDragRef.current?.(drag.name, drag.line, projX, projY);
        return;
      }

      // ── Zoom drag ─────────────────────────────────────────────────────────
      if (dragState) {
        setDragState((prev) => (prev ? { ...prev, currentX: cssX, currentY: cssY } : null));
        return;
      }

      // ── Idle hover: update hovered handle for cursor + region rendering ───
      if (t && showHandlesRef.current && (pointParamsRef.current?.length ?? 0) > 0) {
        const threshold = e.pointerType === 'touch' ? 24 : 12;
        let found: string | null = null;
        let bestDist = threshold;
        for (const p of pointParamsRef.current ?? []) {
          const hcssX = (t.cx + (p.valueX - t.viewCX) * t.scale) / dpr;
          const hcssY = (t.cy - (p.valueY - t.viewCY) * t.scale) / dpr;
          const dist = Math.sqrt((cssX - hcssX) ** 2 + (cssY - hcssY) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            found = p.name;
          }
        }
        setHoveredHandleName((prev) => (prev === found ? prev : found));
      }
    },
    [dragState],
  );

  const handlePointerUp = useCallback(() => {
    // ── Commit handle drag ────────────────────────────────────────────────
    const drag = handleDragRef.current;
    if (drag) {
      onHandleCommitRef.current?.(drag.name, drag.line, drag.currentMmX, drag.currentMmY);
      handleDragRef.current = null;
      setDraggingHandleName(null);
      setDragMm(null);
      return;
    }

    // ── Zoom drag commit ──────────────────────────────────────────────────
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
    const cssToMmX = (cssXp: number) => viewCX + (cssXp * dpr - cx) / scale;
    const cssToMmY = (cssYp: number) => viewCY - (cssYp * dpr - cy) / scale;

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

  // ── click-to-pick (canvas → row linking) ─────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // If a handle drag just finished, don't fire onPick
      if (draggingHandleName !== null) return;
      if (!onPick) return;
      const canvas = canvasRef.current;
      const t = transformRef.current;
      if (!canvas || !t) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const mmX = t.viewCX + (cssX * dpr - t.cx) / t.scale;
      const mmY = t.viewCY - (cssY * dpr - t.cy) / t.scale;
      onPick({ x: mmX, y: mmY });
    },
    [onPick, draggingHandleName],
  );

  // ── derive zoom level for indicator ─────────────────────────────────────
  const zoomLevel = (() => {
    if (!viewport) return null;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const autoFit = computeAutoFitScale(canvas.width, canvas.height, design, hoop);
    if (autoFit === 0) return null;
    const zoomed = Math.min(
      canvas.width / (2 * viewport.halfW),
      canvas.height / (2 * viewport.halfH),
    );
    return zoomed / autoFit;
  })();

  // Drag rectangle in CSS px
  const dragRect =
    dragState &&
    (Math.abs(dragState.currentX - dragState.startX) > 2 ||
      Math.abs(dragState.currentY - dragState.startY) > 2)
      ? dragState
      : null;

  // Cursor: grab when hovering a handle, grabbing while dragging
  const cursor =
    draggingHandleName !== null
      ? 'grabbing'
      : hoveredHandleName !== null && showHandles
        ? 'grab'
        : 'crosshair';

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor,
        }}
      />

      {/* Drag-to-zoom selection rectangle */}
      {dragRect && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(dragRect.startX, dragRect.currentX),
            top: Math.min(dragRect.startY, dragRect.currentY),
            width: Math.abs(dragRect.currentX - dragRect.startX),
            height: Math.abs(dragRect.currentY - dragRect.startY),
            border: canvasDragRectBorder,
            background: canvasDragRectFill,
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
            background: canvasZoomBadgeBg,
            color: canvasZoomBadgeText,
            fontFamily: fontMono,
            fontSize: fsBase - 2,
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
  hideJumps: boolean,
  viewport: Viewport | null,
  warningLoc: WarningLocation | null,
  hoveredLineBounds: LineStitchBounds | null,
  overlays: CanvasOverlay[] = [],
  pointParams: PointParamDef[] = [],
  showHandles: boolean = true,
  hoveredHandleName: string | null = null,
  draggingHandleName: string | null = null,
  dragMm: { x: number; y: number } | null = null,
  highlightedHandle: string | null = null,
  lockedHandles: Set<string> = new Set(),
): RenderTransform {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { scale: 1, cx: 0, cy: 0, viewCX: 0, viewCY: 0 };
  const w = canvas.width,
    h = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Auto-fit scale (shared logic with computeAutoFitScale helper)
  const autoFitScale = computeAutoFitScale(w, h, design, hoop);

  // Active scale and viewport center
  let scale: number;
  let viewCX: number;
  let viewCY: number;

  if (viewport) {
    scale = Math.min(w / (2 * viewport.halfW), h / (2 * viewport.halfH));
    viewCX = viewport.centerX;
    viewCY = viewport.centerY;
  } else {
    scale = autoFitScale;
    viewCX = 0;
    viewCY = 0;
  }

  const cx = w / 2,
    cy = h / 2;
  const X = (mx: number) => cx + (mx - viewCX) * scale;
  const Y = (my: number) => cy - (my - viewCY) * scale; // y-up in mm

  drawGrid(ctx, scale, cx, cy, viewCX, viewCY, w, h, dpr);
  drawHoop(ctx, hoop, scale, cx, cy, viewCX, viewCY, w, h);

  drawOverlays(ctx, overlays, X, Y, dpr);

  const pts = design.pts;
  const upto = Math.min(pts.length, scrubPos || 0);
  if (pts.length === 0) {
    if (showHandles && pointParams.length > 0) {
      drawHandles(
        ctx,
        pointParams,
        X,
        Y,
        scale,
        dpr,
        hoveredHandleName,
        draggingHandleName,
        dragMm,
        highlightedHandle,
        lockedHandles,
      );
    }
    return { scale, cx, cy, viewCX, viewCY };
  }

  // Jumps (under the thread) — hidden when hideJumps is active
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!hideJumps) {
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = canvasJumpThread;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    for (let i = 1; i < upto; i++) {
      if (pts[i].t === 'jump') {
        ctx.moveTo(X(pts[i - 1].x), Y(pts[i - 1].y));
        ctx.lineTo(X(pts[i].x), Y(pts[i].y));
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Thread, batched per colour/underlay run
  const tw = Math.max(1.1 * dpr, Math.min(0.45 * scale, 4.5 * dpr));
  let runColor: number | null = null;
  let runU = false;
  ctx.beginPath();
  for (let j = 1; j < upto; j++) {
    const p = pts[j],
      q = pts[j - 1];
    if (p.t !== 'stitch') continue;
    const pu = p.u === 1;
    if (hideJumps && pu) continue; // skip underlay stitches
    if (hideJumps && q.u === 1) continue; // don't draw from an underlay position
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
    ctx.fillStyle = canvasNeedlePoint;
    const r = Math.max(0.8 * dpr, 0.09 * scale);
    for (let k = 0; k < upto; k++) {
      if (pts[k].t !== 'stitch') continue;
      if (hideJumps && pts[k].u === 1) continue;
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
      ctx.fillStyle =
        c.layers >= 3 ? canvasDensityHot(0.18 + hot * 0.42) : canvasDensityWarm(0.1 + hot * 0.3);
      const x0 = X(c.ix * cellMM);
      const y0 = Y((c.iy + 1) * cellMM);
      ctx.fillRect(x0, y0, cellMM * scale + 0.5, cellMM * scale + 0.5);
    }
  }

  // Needle marker while scrubbed back
  if (upto > 0 && upto < pts.length) {
    const n = pts[upto - 1];
    ctx.strokeStyle = canvasNeedleMarker;
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(X(n.x), Y(n.y), 4.5 * dpr, 0, 6.2832);
    ctx.stroke();
  }

  // Debug pins from the `mark` command
  const visibleMarks = design.marks.filter((mk) => mk.at <= upto);
  if (visibleMarks.length) {
    const r = 6 * dpr;
    ctx.font = `${Math.round(fsBase * 0.7) * dpr}px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    visibleMarks.forEach((mk, i) => {
      const mx = X(mk.x),
        my = Y(mk.y);
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, 6.2832);
      ctx.fillStyle = canvasDebugPinFill;
      ctx.fill();
      ctx.strokeStyle = canvasDebugPinStroke;
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
      ctx.fillStyle = canvasDebugPinStroke;
      ctx.fillText(String(i + 1), mx, my + 0.5 * dpr);
    });
  }

  // Hovered-line bounding box
  if (hoveredLineBounds) {
    const b = hoveredLineBounds;
    const pad = 1.5;
    const MIN_HALF = 1.0;
    const rx = X(b.minX - pad);
    const ry = Y(b.maxY + pad);
    const rw = Math.max(2 * MIN_HALF, b.maxX - b.minX + 2 * pad) * scale;
    const rh = Math.max(2 * MIN_HALF, b.maxY - b.minY + 2 * pad) * scale;
    ctx.save();
    ctx.fillStyle = 'rgba(203, 161, 109, 0.05)';
    ctx.strokeStyle = 'rgba(203, 161, 109, 0.8)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // Warning location marker
  if (warningLoc && warningLoc.points.length) {
    const wpts = warningLoc.points;
    if (wpts.length <= 4) {
      for (const p of wpts) drawWarnCrosshair(ctx, X(p.x), Y(p.y), dpr);
    } else {
      for (const p of wpts) drawWarnDot(ctx, X(p.x), Y(p.y), dpr);
    }
  }

  // Selection highlight drawn last
  drawOverlays(ctx, overlays, X, Y, dpr, 'highlight');

  // ── XY handles — drawn above everything else ───────────────────────────
  if (showHandles && pointParams.length > 0) {
    drawHandles(
      ctx,
      pointParams,
      X,
      Y,
      scale,
      dpr,
      hoveredHandleName,
      draggingHandleName,
      dragMm,
      highlightedHandle,
      lockedHandles,
    );
  }

  return { scale, cx, cy, viewCX, viewCY };
}

// ── XY handle rendering ───────────────────────────────────────────────────────

const HANDLE_RING_R = 7; // CSS px radius for the handle ring
const HANDLE_DOT_R = 2.5; // CSS px radius for the center dot

function drawHandles(
  ctx: CanvasRenderingContext2D,
  params: PointParamDef[],
  X: (mx: number) => number,
  Y: (my: number) => number,
  scale: number,
  dpr: number,
  hoveredHandleName: string | null,
  draggingHandleName: string | null,
  dragMm: { x: number; y: number } | null,
  highlightedHandle: string | null,
  lockedHandles: Set<string>,
) {
  const ringR = HANDLE_RING_R * dpr;
  const dotR = HANDLE_DOT_R * dpr;

  ctx.save();
  ctx.font = `${Math.round(fsBase * 0.85) * dpr}px ${fontMono}`;
  ctx.textBaseline = 'middle';

  for (const p of params) {
    const isDragging = draggingHandleName === p.name;
    const isHovered = hoveredHandleName === p.name;
    const isHighlighted = highlightedHandle === p.name;
    const isLocked = lockedHandles.has(p.name);
    const isActive = isDragging || isHovered || isHighlighted;

    // Use live drag position while dragging
    const mmX = isDragging && dragMm ? dragMm.x : p.valueX;
    const mmY = isDragging && dragMm ? dragMm.y : p.valueY;
    const px = X(mmX);
    const py = Y(mmY);

    // Draw constraint region when active
    if (isActive) {
      ctx.save();
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = `rgba(203,161,109,0.55)`;
      ctx.fillStyle = `rgba(203,161,109,0.06)`;
      drawRegionShape(ctx, p.region, X, Y, scale, dpr);
      ctx.restore();
    }

    // Draw live coordinate tooltip while dragging
    if (isDragging) {
      ctx.save();
      const label = `${mmX.toFixed(1)}, ${mmY.toFixed(1)}`;
      const labelW = ctx.measureText(label).width;
      const pad = 5 * dpr;
      const lx = px + ringR + 4 * dpr;
      const ly = py - 9 * dpr;
      ctx.fillStyle = 'rgba(20,15,10,0.7)';
      ctx.beginPath();
      ctx.rect(lx - pad * 0.5, ly - 9 * dpr, labelW + pad, 18 * dpr);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,245,230,0.95)';
      ctx.fillText(label, lx, ly + 0.5 * dpr);
      ctx.restore();
    }

    ctx.globalAlpha = isActive || isHighlighted ? 1.0 : 0.6;

    // Ring
    ctx.beginPath();
    ctx.arc(px, py, ringR, 0, Math.PI * 2);
    if (isLocked) {
      // Locked: filled gold ring
      ctx.fillStyle = gold;
      ctx.fill();
      ctx.strokeStyle = goldHi;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    } else if (isHighlighted) {
      ctx.strokeStyle = goldHi;
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
    } else {
      ctx.strokeStyle = isActive ? goldHi : gold;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, Math.PI * 2);
    ctx.fillStyle = isLocked ? goldHi : isActive ? goldHi : gold;
    ctx.fill();

    // Label
    ctx.save();
    ctx.globalAlpha = isActive ? 0.9 : 0.55;
    ctx.fillStyle = 'rgba(255,245,230,0.95)';
    ctx.textAlign = 'left';
    ctx.fillText(p.name, px + ringR + 3 * dpr, py);
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Draw the constraint region (outline + fill) for a handle. */
function drawRegionShape(
  ctx: CanvasRenderingContext2D,
  region: XYRegion,
  X: (mx: number) => number,
  Y: (my: number) => number,
  scale: number,
  dpr: number,
) {
  const HOOP_R = 47;
  switch (region.kind) {
    case 'free': {
      // The hoop itself is the boundary — don't redraw it
      break;
    }
    case 'rect': {
      const rx = X(region.minX);
      const ry = Y(region.maxY); // y-up: maxY maps to lower canvas y
      const rw = (region.maxX - region.minX) * scale;
      const rh = (region.maxY - region.minY) * scale;
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'disc': {
      const px = X(region.cx);
      const py = Y(region.cy);
      const r = region.radius * scale;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'axis': {
      const chordHalf = Math.sqrt(
        Math.max(0, HOOP_R * HOOP_R - region.fixedCoord * region.fixedCoord),
      );
      if (region.axis === 'x') {
        // Horizontal segment: y is fixed, x varies
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        const py = Y(region.fixedCoord);
        ctx.beginPath();
        ctx.moveTo(X(lo), py);
        ctx.lineTo(X(hi), py);
        ctx.stroke();
        // Tick marks at ends
        const tick = 4 * dpr;
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(X(lo), py - tick);
        ctx.lineTo(X(lo), py + tick);
        ctx.moveTo(X(hi), py - tick);
        ctx.lineTo(X(hi), py + tick);
        ctx.stroke();
        ctx.restore();
      } else {
        // Vertical segment: x is fixed, y varies
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        const px = X(region.fixedCoord);
        ctx.beginPath();
        ctx.moveTo(px, Y(lo));
        ctx.lineTo(px, Y(hi));
        ctx.stroke();
        // Tick marks at ends
        const tick = 4 * dpr;
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px - tick, Y(lo));
        ctx.lineTo(px + tick, Y(lo));
        ctx.moveTo(px - tick, Y(hi));
        ctx.lineTo(px + tick, Y(hi));
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
  }
}

/** Draw staging overlays (ghost outlines, source artwork, selection highlight). */
function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: CanvasOverlay[],
  X: (mx: number) => number,
  Y: (my: number) => number,
  dpr: number,
  only?: CanvasOverlay['kind'],
) {
  if (!overlays || !overlays.length) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const ov of overlays) {
    if (only && ov.kind !== only) continue;
    if (ov.kind === 'ghost') {
      ctx.strokeStyle = 'rgba(120,110,90,0.45)';
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.lineWidth = 1 * dpr;
    } else if (ov.kind === 'overlay') {
      ctx.strokeStyle = 'rgba(60,120,200,0.55)';
      ctx.setLineDash([]);
      ctx.lineWidth = 1 * dpr;
    } else {
      // highlight — heavy, non-colour affordance for colour-vision safety
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.setLineDash([]);
      ctx.lineWidth = 3.5 * dpr;
    }
    for (const ring of ov.rings) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(X(ring[0][0]), Y(ring[0][1]));
      for (let i = 1; i < ring.length; i++) ctx.lineTo(X(ring[i][0]), Y(ring[i][1]));
      ctx.stroke();
    }
    if (ov.kind === 'highlight') {
      // inner dark stroke so the halo reads on light fabric too
      ctx.strokeStyle = 'rgba(20,20,20,0.9)';
      ctx.lineWidth = 1.4 * dpr;
      for (const ring of ov.rings) {
        if (ring.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(X(ring[0][0]), Y(ring[0][1]));
        for (let i = 1; i < ring.length; i++) ctx.lineTo(X(ring[i][0]), Y(ring[i][1]));
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Prominent warning marker: halo + white/red rings + crosshair + centre dot. */
function drawWarnCrosshair(ctx: CanvasRenderingContext2D, px: number, py: number, dpr: number) {
  const ring = 9 * dpr;

  // Soft halo
  ctx.beginPath();
  ctx.arc(px, py, ring * 1.8, 0, 6.2832);
  ctx.fillStyle = canvasWarnMarkerFill(0.18);
  ctx.fill();

  // Outer ring (white) + inner ring (warning red) for contrast on any thread
  ctx.beginPath();
  ctx.arc(px, py, ring, 0, 6.2832);
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = canvasWarnMarkerStroke;
  ctx.stroke();
  ctx.lineWidth = 1.6 * dpr;
  ctx.strokeStyle = canvasWarnMarkerCore;
  ctx.stroke();

  // Crosshair through the centre
  ctx.beginPath();
  ctx.moveTo(px - ring * 1.5, py);
  ctx.lineTo(px - ring * 0.5, py);
  ctx.moveTo(px + ring * 0.5, py);
  ctx.lineTo(px + ring * 1.5, py);
  ctx.moveTo(px, py - ring * 1.5);
  ctx.lineTo(px, py - ring * 0.5);
  ctx.moveTo(px, py + ring * 0.5);
  ctx.lineTo(px, py + ring * 1.5);
  ctx.lineWidth = 1.6 * dpr;
  ctx.strokeStyle = canvasWarnMarkerCore;
  ctx.stroke();

  // Centre dot
  ctx.beginPath();
  ctx.arc(px, py, 1.8 * dpr, 0, 6.2832);
  ctx.fillStyle = canvasWarnMarkerCore;
  ctx.fill();
}

/** Light warning marker for clustered spots: a red dot ringed in white. */
function drawWarnDot(ctx: CanvasRenderingContext2D, px: number, py: number, dpr: number) {
  ctx.beginPath();
  ctx.arc(px, py, 3 * dpr, 0, 6.2832);
  ctx.fillStyle = canvasWarnMarkerCore;
  ctx.fill();
  ctx.lineWidth = 1.4 * dpr;
  ctx.strokeStyle = canvasWarnMarkerStroke;
  ctx.stroke();
}

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

// ── 1 cm grid ────────────────────────────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  scale: number,
  cx: number,
  cy: number,
  viewCX: number,
  viewCY: number,
  w: number,
  h: number,
  dpr: number,
) {
  const CELL = 10; // mm — 1 cm
  if (CELL * scale < 8) return;

  const minMmX = viewCX - cx / scale;
  const maxMmX = viewCX + cx / scale;
  const minMmY = viewCY - cy / scale;
  const maxMmY = viewCY + cy / scale;

  ctx.save();
  ctx.strokeStyle = canvasGridCm;
  ctx.lineWidth = dpr;
  ctx.beginPath();

  for (let x = Math.ceil(minMmX / CELL) * CELL; x <= maxMmX; x += CELL) {
    const px = cx + (x - viewCX) * scale;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }

  for (let y = Math.ceil(minMmY / CELL) * CELL; y <= maxMmY; y += CELL) {
    const py = cy - (y - viewCY) * scale;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }

  ctx.stroke();
  ctx.restore();
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
  const rx = (hoop.widthMM / 2) * scale;
  const ry = (hoop.heightMM / 2) * scale;

  const hcx = cx + (0 - viewCX) * scale;
  const hcy = cy - (0 - viewCY) * scale;

  ctx.save();
  ctx.fillStyle = canvasHoopOverlay;
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  addHoopPath(ctx, hoop, rx, ry, hcx, hcy, scale);
  ctx.fill('evenodd');
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  addHoopPath(ctx, hoop, rx, ry, hcx, hcy, scale);
  ctx.strokeStyle = canvasHoopBoundary;
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
    const x = cx - rx,
      y = cy - ry,
      w = rx * 2,
      h = ry * 2;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
