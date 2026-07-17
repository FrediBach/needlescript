import type { DesignState, LineStitchBounds } from '../../App.tsx';
import type { HoopConfig } from '../../data.ts';
import type { ChalkStroke, HoopInfo, WarningLocation } from '../../lib/engine.ts';
import type { PointParamDef, XYRegion } from '../../lib/parse-parameters.ts';
import {
  canvasJumpThread,
  canvasNeedlePoint,
  canvasHoopOverlay,
  canvasHoopBoundary,
  canvasGridCm,
  canvasNeedleMarker,
  canvasDebugPinFill,
  canvasDebugPinStroke,
  canvasAnnotationText,
  canvasDensityHot,
  canvasDensityWarm,
  canvasWarnMarkerFill,
  canvasWarnMarkerStroke,
  canvasWarnMarkerCore,
  fontMono,
  fsBase,
  gold,
  goldHi,
} from '../../theme.ts';
import type { CanvasOverlay, RenderTransform, Viewport } from './types.ts';
import { colorDist, defaultSlotColor } from '../../lib/colormath.ts';

// ── rendering ────────────────────────────────────────────────────────────────

export function draw(
  canvas: HTMLCanvasElement,
  design: DesignState,
  hoop: HoopConfig,
  activeHoop: HoopInfo | undefined,
  scrubPos: number,
  dpr: number,
  showDensity: boolean,
  hideJumps: boolean,
  showChalk: boolean,
  hoveredDataVar: string | null,
  pinnedDataVars: Set<string>,
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
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, w, h);
  const darkGround = colorDist(design.background, '#000000') < 0.5;

  // Auto-fit scale (shared logic with computeAutoFitScale helper)
  const autoFitScale = computeAutoFitScale(w, h, design, hoop, activeHoop);

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

  drawGrid(ctx, scale, cx, cy, viewCX, viewCY, w, h, dpr, darkGround);
  drawHoop(ctx, hoop, activeHoop, scale, cx, cy, viewCX, viewCY, w, h);

  drawOverlays(ctx, overlays, X, Y, dpr);

  const pts = design.pts;
  const upto = Math.min(pts.length, scrubPos || 0);
  if (pts.length === 0) {
    drawChalkLayer(
      ctx,
      design,
      upto,
      showChalk,
      hoveredDataVar,
      pinnedDataVars,
      X,
      Y,
      dpr,
      darkGround,
    );
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

  drawStitches(ctx, design, pts, upto, X, Y, scale, dpr, hideJumps, darkGround);

  drawDensity(ctx, design, X, Y, scale, showDensity);
  drawChalkLayer(
    ctx,
    design,
    upto,
    showChalk,
    hoveredDataVar,
    pinnedDataVars,
    X,
    Y,
    dpr,
    darkGround,
  );
  drawScrubNeedle(ctx, pts, upto, X, Y, dpr, darkGround);
  drawDebugMarks(ctx, design, upto, X, Y, dpr, darkGround);
  drawHoveredLineBounds(ctx, hoveredLineBounds, X, Y, scale, dpr);
  drawWarningMarkers(ctx, warningLoc, X, Y, dpr);

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

const CHALK_PALETTE = ['#333333', '#30443f', '#49363e', '#354052', '#4b3c31', '#3e4631'];
const CHALK_VERTEX_CAP = 5000;

function drawChalkLayer(
  ctx: CanvasRenderingContext2D,
  design: DesignState,
  upto: number,
  showChalk: boolean,
  hoveredDataVar: string | null,
  pinnedDataVars: Set<string>,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
  darkGround: boolean,
) {
  if (!showChalk) return;

  const codeGuides: Array<{
    strokes: ChalkStroke[];
    style: 'auto' | 'dots' | 'line';
    label?: string;
    seed: number;
    emphasis: boolean;
  }> = [];
  for (const event of design.chalk) {
    if (event.stitchIndexAtEmit > upto) continue;
    codeGuides.push({
      strokes: event.strokes,
      style: event.style,
      label: event.label,
      seed: event.sourceLine * 37,
      emphasis: false,
    });
  }
  const dataGuides: typeof codeGuides = [];
  for (const value of design.dataVars) {
    if (value.name !== hoveredDataVar && !pinnedDataVars.has(value.name)) continue;
    dataGuides.push({
      strokes: value.strokes,
      style: 'auto' as const,
      label: value.name,
      seed: (value.declarationLine ?? value.name.length) * 53,
      emphasis: value.name === hoveredDataVar,
    });
  }

  for (const guide of [...codeGuides, ...dataGuides]) {
    const color = darkGround
      ? ['#f7f0df', '#d8f3ea', '#f5ddea', '#dce8ff', '#f5e2cf', '#ebf3d1'][
          Math.abs(guide.seed) % CHALK_PALETTE.length
        ]
      : CHALK_PALETTE[Math.abs(guide.seed) % CHALK_PALETTE.length];
    drawChalkGuide(
      ctx,
      guide.strokes,
      guide.style,
      guide.label,
      guide.seed,
      color,
      guide.emphasis,
      X,
      Y,
      dpr,
    );
  }
}

function drawChalkGuide(
  ctx: CanvasRenderingContext2D,
  strokes: ChalkStroke[],
  style: 'auto' | 'dots' | 'line',
  label: string | undefined,
  seed: number,
  color: string,
  emphasis: boolean,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
) {
  const totalVertices = strokes.reduce((sum, stroke) => sum + stroke.vertices.length, 0);
  const stride = Math.max(1, Math.ceil(totalVertices / CHALK_VERTEX_CAP));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = emphasis ? 0.92 : 0.48;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([5 * dpr, 3.2 * dpr, 1.2 * dpr, 2.6 * dpr]);

  strokes.forEach((stroke, strokeIndex) => {
    const vertices = stroke.vertices.filter(
      (_, vertexIndex) => vertexIndex % stride === 0 || vertexIndex === stroke.vertices.length - 1,
    );
    if (vertices.length === 0) return;
    const connect = style !== 'dots' && stroke.kind === 'path' && vertices.length > 1;
    const dots = style !== 'line' || stroke.kind === 'point';
    if (connect) {
      // Two slightly misregistered passes mimic a dry, uneven tailor's-chalk edge.
      for (let pass = 0; pass < 2; pass++) {
        const phase = seed * 0.73 + strokeIndex * 2.1 + pass * 1.7;
        const ox = Math.sin(phase) * 0.55 * dpr;
        const oy = Math.cos(phase * 1.31) * 0.45 * dpr;
        ctx.beginPath();
        ctx.moveTo(X(vertices[0][0]) + ox, Y(vertices[0][1]) + oy);
        for (let i = 1; i < vertices.length; i++)
          ctx.lineTo(X(vertices[i][0]) + ox, Y(vertices[i][1]) + oy);
        ctx.lineWidth = (pass === 0 ? 1.15 : 0.55) * dpr;
        ctx.globalAlpha = (emphasis ? 0.92 : 0.48) * (pass === 0 ? 0.72 : 0.42);
        ctx.stroke();
      }
      drawChalkDirection(ctx, vertices, color, emphasis, X, Y, dpr);
    }
    if (dots) {
      ctx.globalAlpha = emphasis ? 0.88 : 0.55;
      for (let i = 0; i < vertices.length; i++) {
        const radius = (i === 0 ? 2.2 : 1.35) * dpr;
        const phase = seed + strokeIndex * 11 + i * 0.91;
        ctx.beginPath();
        ctx.ellipse(
          X(vertices[i][0]) + Math.sin(phase) * 0.35 * dpr,
          Y(vertices[i][1]) + Math.cos(phase * 1.7) * 0.3 * dpr,
          radius,
          radius * 0.72,
          phase,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  });

  const first = strokes[0]?.vertices[0];
  if (label && first) {
    ctx.setLineDash([]);
    ctx.globalAlpha = emphasis ? 0.9 : 0.64;
    ctx.font = `${10 * dpr}px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, X(first[0]) + 6 * dpr, Y(first[1]) - 5 * dpr);
  }
  ctx.restore();
}

function drawChalkDirection(
  ctx: CanvasRenderingContext2D,
  vertices: [number, number][],
  color: string,
  emphasis: boolean,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
) {
  const index = Math.max(1, Math.floor(vertices.length / 2));
  const before = vertices[index - 1];
  const at = vertices[index];
  const dx = X(at[0]) - X(before[0]);
  const dy = Y(at[1]) - Y(before[1]);
  const length = Math.hypot(dx, dy);
  if (length < 5 * dpr) return;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const x = X(at[0]);
  const y = Y(at[1]);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.globalAlpha = emphasis ? 0.85 : 0.5;
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(x - ux * 5 * dpr + px * 3 * dpr, y - uy * 5 * dpr + py * 3 * dpr);
  ctx.lineTo(x, y);
  ctx.lineTo(x - ux * 5 * dpr - px * 3 * dpr, y - uy * 5 * dpr - py * 3 * dpr);
  ctx.stroke();
  ctx.restore();
}

/** Draw jumps, thread runs, and penetration points in their layering order. */
function drawStitches(
  ctx: CanvasRenderingContext2D,
  design: DesignState,
  pts: DesignState['pts'],
  upto: number,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  scale: number,
  dpr: number,
  hideJumps: boolean,
  darkGround: boolean,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!hideJumps) {
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = darkGround ? 'rgba(255,255,255,0.48)' : canvasJumpThread;
    ctx.lineWidth = dpr;
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

  const threadWidth = Math.max(1.1 * dpr, Math.min(0.45 * scale, 4.5 * dpr));
  let runColor: number | null = null;
  let runUnderlay = false;
  ctx.beginPath();
  for (let i = 1; i < upto; i++) {
    const point = pts[i];
    const previous = pts[i - 1];
    if (point.t !== 'stitch') continue;
    const isUnderlay = point.u === 1;
    if (hideJumps && (isUnderlay || previous.u === 1)) continue;
    if (point.c !== runColor || isUnderlay !== runUnderlay) {
      if (runColor !== null) ctx.stroke();
      runColor = point.c;
      runUnderlay = isUnderlay;
      ctx.strokeStyle = design.colorTable[runColor]?.hex ?? defaultSlotColor(runColor);
      ctx.lineWidth = isUnderlay ? Math.max(0.8 * dpr, threadWidth * 0.5) : threadWidth;
      ctx.globalAlpha = isUnderlay ? 0.4 : 1;
      ctx.beginPath();
    }
    ctx.moveTo(X(previous.x), Y(previous.y));
    ctx.lineTo(X(point.x), Y(point.y));
  }
  if (runColor !== null) ctx.stroke();
  ctx.globalAlpha = 1;

  if (scale <= 2.4 * dpr) return;
  ctx.fillStyle = darkGround ? 'rgba(255,255,255,0.72)' : canvasNeedlePoint;
  const radius = Math.max(0.8 * dpr, 0.09 * scale);
  for (let i = 0; i < upto; i++) {
    if (pts[i].t !== 'stitch' || (hideJumps && pts[i].u === 1)) continue;
    ctx.beginPath();
    ctx.arc(X(pts[i].x), Y(pts[i].y), radius, 0, 6.2832);
    ctx.fill();
  }
}

function drawDensity(
  ctx: CanvasRenderingContext2D,
  design: DesignState,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  scale: number,
  showDensity: boolean,
) {
  if (!showDensity || !design.density) return;
  const { cellMM, cells } = design.density;
  for (const cell of cells) {
    if (cell.layers < 1.2) continue;
    const hot = Math.min(1, cell.layers / 4);
    ctx.fillStyle =
      cell.layers >= 3 ? canvasDensityHot(0.18 + hot * 0.42) : canvasDensityWarm(0.1 + hot * 0.3);
    ctx.fillRect(
      X(cell.ix * cellMM),
      Y((cell.iy + 1) * cellMM),
      cellMM * scale + 0.5,
      cellMM * scale + 0.5,
    );
  }
}

function drawScrubNeedle(
  ctx: CanvasRenderingContext2D,
  pts: DesignState['pts'],
  upto: number,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
  darkGround: boolean,
) {
  if (upto === 0 || upto === pts.length) return;
  const needle = pts[upto - 1];
  ctx.strokeStyle = darkGround ? '#ffffff' : canvasNeedleMarker;
  ctx.lineWidth = 1.4 * dpr;
  ctx.beginPath();
  ctx.arc(X(needle.x), Y(needle.y), 4.5 * dpr, 0, 6.2832);
  ctx.stroke();
}

function drawDebugMarks(
  ctx: CanvasRenderingContext2D,
  design: DesignState,
  upto: number,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
  darkGround: boolean,
) {
  const marks = design.marks.filter((mark) => mark.at <= upto);
  if (!marks.length) return;
  const radius = 6 * dpr;
  ctx.font = `${Math.round(fsBase * 0.7) * dpr}px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  marks.forEach((mark, index) => {
    const x = X(mark.x);
    const y = Y(mark.y);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 6.2832);
    ctx.fillStyle = darkGround ? '#f7f0df' : canvasDebugPinFill;
    ctx.fill();
    ctx.strokeStyle = darkGround ? '#241f18' : canvasDebugPinStroke;
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    ctx.fillStyle = darkGround ? '#241f18' : canvasAnnotationText;
    ctx.fillText(String(index + 1), x, y + 0.5 * dpr);
  });
}

function drawHoveredLineBounds(
  ctx: CanvasRenderingContext2D,
  bounds: LineStitchBounds | null,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  scale: number,
  dpr: number,
) {
  if (!bounds) return;
  const padding = 1.5;
  const minimumHalfSize = 1;
  const x = X(bounds.minX - padding);
  const y = Y(bounds.maxY + padding);
  const width = Math.max(2 * minimumHalfSize, bounds.maxX - bounds.minX + 2 * padding) * scale;
  const height = Math.max(2 * minimumHalfSize, bounds.maxY - bounds.minY + 2 * padding) * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(203, 161, 109, 0.05)';
  ctx.strokeStyle = 'rgba(203, 161, 109, 0.8)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawWarningMarkers(
  ctx: CanvasRenderingContext2D,
  warningLoc: WarningLocation | null,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  dpr: number,
) {
  if (!warningLoc?.points.length) return;
  const drawMarker = warningLoc.points.length <= 4 ? drawWarnCrosshair : drawWarnDot;
  for (const point of warningLoc.points) drawMarker(ctx, X(point.x), Y(point.y), dpr);
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
    ctx.fillStyle = canvasAnnotationText;
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

/** Draw staging overlays (excluded outlines, source artwork, selection highlight). */
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
    if (ov.kind === 'excluded') {
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
export function computeAutoFitScale(
  w: number,
  h: number,
  design: DesignState,
  hoop: HoopConfig,
  activeHoop?: HoopInfo,
): number {
  const hoopHalfW = (activeHoop ? activeHoop.widthMM : hoop.widthMM) / 2;
  const hoopHalfH = (activeHoop ? activeHoop.heightMM : hoop.heightMM) / 2;
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
  darkGround: boolean,
) {
  const CELL = 10; // mm — 1 cm
  if (CELL * scale < 8) return;

  const minMmX = viewCX - cx / scale;
  const maxMmX = viewCX + cx / scale;
  const minMmY = viewCY - cy / scale;
  const maxMmY = viewCY + cy / scale;

  ctx.save();
  ctx.strokeStyle = darkGround ? 'rgba(255,255,255,0.12)' : canvasGridCm;
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
  activeHoop: HoopInfo | undefined,
  scale: number,
  cx: number,
  cy: number,
  viewCX: number,
  viewCY: number,
  canvasW: number,
  canvasH: number,
) {
  // Use activeHoop dimensions if a `hoop` directive is in effect.
  const hoopW = activeHoop ? activeHoop.widthMM : hoop.widthMM;
  const hoopH = activeHoop ? activeHoop.heightMM : hoop.heightMM;
  const hoopShape: 'circle' | 'rectangle' = activeHoop
    ? activeHoop.shape
    : hoop.shape === 'oval'
      ? 'circle'
      : hoop.shape;

  const rx = (hoopW / 2) * scale;
  const ry = (hoopH / 2) * scale;

  const hcx = cx + (0 - viewCX) * scale;
  const hcy = cy - (0 - viewCY) * scale;

  // Even-odd overlay: fill everything outside the hoop.
  ctx.save();
  ctx.fillStyle = canvasHoopOverlay;
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  addHoopPathFromDims(ctx, hoopShape, rx, ry, hcx, hcy, scale);
  ctx.fill('evenodd');
  ctx.restore();

  // Outer hoop boundary (solid).
  ctx.save();
  ctx.beginPath();
  addHoopPathFromDims(ctx, hoopShape, rx, ry, hcx, hcy, scale);
  ctx.strokeStyle = canvasHoopBoundary;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Field boundary (dashed, 3 mm inset each side) — only when field differs from hoop.
  if (activeHoop) {
    const frx = (activeHoop.fieldWidthMM / 2) * scale;
    const fry = (activeHoop.fieldHeightMM / 2) * scale;
    ctx.save();
    ctx.beginPath();
    addHoopPathFromDims(ctx, activeHoop.shape, frx, fry, hcx, hcy, scale);
    ctx.strokeStyle = canvasHoopBoundary;
    ctx.lineWidth = 1;
    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw a hoop path from shape + half-dimensions (for activeHoop support). */
function addHoopPathFromDims(
  ctx: CanvasRenderingContext2D,
  shape: 'circle' | 'rectangle',
  rx: number,
  ry: number,
  cx: number,
  cy: number,
  scale: number,
) {
  if (shape === 'circle') {
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
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
