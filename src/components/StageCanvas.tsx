import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { projectPoint } from '../lib/parse-parameters.ts';
import type { PointParamDef } from '../lib/parse-parameters.ts';
import { CanvasHud } from './stage-canvas/CanvasHud.tsx';
import { computeAutoFitScale, draw } from './stage-canvas/CanvasRenderer.ts';
import { formatPointLiteral } from './stage-canvas/sample-point.ts';
import type {
  DragState,
  HandleDragState,
  RenderTransform,
  SampleContextMenu,
  StageCanvasProps as Props,
  Viewport,
} from './stage-canvas/types.ts';

export type { CanvasOverlay } from './stage-canvas/types.ts';

export default function StageCanvas({
  design,
  hoop,
  activeHoop,
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
  const [sampleContextMenu, setSampleContextMenu] = useState<SampleContextMenu | null>(null);

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
      activeHoop,
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
    activeHoop,
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
        activeHoop,
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
    activeHoop,
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

  // ── sampled-coordinate context menu ─────────────────────────────────────
  useEffect(() => {
    if (!sampleContextMenu) return;
    const close = () => setSampleContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sampleContextMenu]);

  // ── pointer handlers ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
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

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const t = transformRef.current;
    if (!canvas || !t) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    setSampleContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      mmX: t.viewCX + (cssX * dpr - t.cx) / t.scale,
      mmY: t.viewCY - (cssY * dpr - t.cy) / t.scale,
    });
  }, []);

  const handleCopySample = useCallback(async () => {
    if (!sampleContextMenu) return;
    const point = formatPointLiteral(sampleContextMenu.mmX, sampleContextMenu.mmY);
    try {
      await copyText(point);
    } catch {
      // The menu remains open so the user can retry if their browser blocks clipboard access.
      return;
    }
    setSampleContextMenu(null);
  }, [sampleContextMenu]);

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
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor,
        }}
      />

      <CanvasHud
        dragRect={dragRect}
        zoomLevel={zoomLevel}
        sampleContextMenu={sampleContextMenu}
        onCopySample={handleCopySample}
      />
    </>
  );
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Unable to copy sampled position');
}
