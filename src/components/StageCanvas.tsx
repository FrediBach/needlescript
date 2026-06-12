import { useEffect, useRef } from 'react';
import type { DesignState } from '../App.tsx';
import type { HoopConfig } from '../data.ts';
import { THREADS } from '../data.ts';

interface Props {
  design: DesignState;
  hoop: HoopConfig;
  scrubPos: number;
  showDensity: boolean;
}

export default function StageCanvas({ design, hoop, scrubPos, showDensity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas to match physical pixel size
    const container = canvas.parentElement;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));

    draw(canvas, design, hoop, scrubPos, dpr, showDensity);
  }, [design, hoop, scrubPos, showDensity]);

  // Also redraw on resize
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
      draw(canvas, design, hoop, scrubPos, dpr, showDensity);
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [design, hoop, scrubPos, showDensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function draw(
  canvas: HTMLCanvasElement,
  design: DesignState,
  hoop: HoopConfig,
  scrubPos: number,
  dpr: number,
  showDensity: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Fit hoop + design — maintain separate per-axis extents for non-square hoops
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
  const scale = Math.min(w / (2 * extX), h / (2 * extY));
  const cx = w / 2, cy = h / 2;
  const X = (mx: number) => cx + mx * scale;
  const Y = (my: number) => cy - my * scale; // y-up in mm

  drawHoop(ctx, hoop, scale, cx, cy, w, h);

  const pts = design.pts;
  const upto = Math.min(pts.length, scrubPos || 0);
  if (pts.length === 0) return;

  // Jumps (under the thread)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.strokeStyle = 'rgba(90,80,60,0.5)';
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

  // Thread, batched per colour/underlay run. Underlay (u) is drawn thinner
  // and lighter so the construction shows through the topping.
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

  // Needle penetration points when zoomed in
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

  // Density heatmap overlay (thread coverage in layers)
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

  // Debug pins from the `mark` command (render-only, never exported)
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
}

// Draws the hoop as a flat, minimalistic overlay:
//   – outside the hoop: slight dark tint so the embroiderable area reads clearly
//   – hoop edge: thin warm border line
function drawHoop(
  ctx: CanvasRenderingContext2D,
  hoop: HoopConfig,
  scale: number,
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number,
) {
  const rx = (hoop.widthMM / 2) * scale;
  const ry = (hoop.heightMM / 2) * scale;

  // --- dark overlay outside the hoop using even-odd fill ---
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 4, 0.1)';
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);          // outer rectangle (whole canvas)
  addHoopPath(ctx, hoop, rx, ry, cx, cy, scale);  // inner hoop shape (creates the hole)
  ctx.fill('evenodd');
  ctx.restore();

  // --- hoop boundary line ---
  ctx.save();
  ctx.beginPath();
  addHoopPath(ctx, hoop, rx, ry, cx, cy, scale);
  ctx.strokeStyle = 'rgba(90, 75, 55, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Adds the hoop shape as a canvas sub-path (no stroke/fill — caller decides).
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
    // Rectangle with gently rounded corners proportional to the hoop size
    const r = Math.min(5 * scale, rx * 0.12, ry * 0.12);
    const x = cx - rx, y = cy - ry, w = rx * 2, h = ry * 2;
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
