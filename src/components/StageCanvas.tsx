import { useEffect, useRef } from 'react';
import type { DesignState } from '../App.tsx';
import { THREADS, HOOP_R } from '../data.ts';

interface Props {
  design: DesignState;
  scrubPos: number;
}

export default function StageCanvas({ design, scrubPos }: Props) {
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

    draw(canvas, design, scrubPos, dpr);
  }, [design, scrubPos]);

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
      draw(canvas, design, scrubPos, dpr);
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [design, scrubPos]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function draw(canvas: HTMLCanvasElement, design: DesignState, scrubPos: number, dpr: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Fit hoop + design
  let ext = HOOP_R + 6;
  if (design.stats) {
    ext = Math.max(
      ext,
      Math.abs(design.stats.minX), Math.abs(design.stats.maxX),
      Math.abs(design.stats.minY), Math.abs(design.stats.maxY),
    );
    ext += 6;
  }
  const scale = Math.min(w, h) / (2 * ext);
  const cx = w / 2, cy = h / 2;
  const X = (mx: number) => cx + mx * scale;
  const Y = (my: number) => cy - my * scale; // y-up in mm

  drawHoop(ctx, scale, cx, cy, dpr);

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

  // Thread, batched per colour run
  const tw = Math.max(1.1 * dpr, Math.min(0.45 * scale, 4.5 * dpr));
  ctx.lineWidth = tw;
  let runColor: number | null = null;
  ctx.beginPath();
  for (let j = 1; j < upto; j++) {
    const p = pts[j], q = pts[j - 1];
    if (p.t !== 'stitch') continue;
    if (p.c !== runColor) {
      if (runColor !== null) ctx.stroke();
      runColor = p.c;
      ctx.strokeStyle = THREADS[runColor % THREADS.length];
      ctx.beginPath();
    }
    ctx.moveTo(X(q.x), Y(q.y));
    ctx.lineTo(X(p.x), Y(p.y));
  }
  if (runColor !== null) ctx.stroke();

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

  // Needle marker while scrubbed back
  if (upto > 0 && upto < pts.length) {
    const n = pts[upto - 1];
    ctx.strokeStyle = '#1B2030';
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(X(n.x), Y(n.y), 4.5 * dpr, 0, 6.2832);
    ctx.stroke();
  }
}

function drawHoop(
  ctx: CanvasRenderingContext2D,
  scale: number,
  cx: number,
  cy: number,
  dpr: number,
) {
  const rIn = HOOP_R * scale, rOut = (HOOP_R + 4.5) * scale;
  const g = ctx.createRadialGradient(cx, cy, rIn, cx, cy, rOut);
  g.addColorStop(0, '#C99A5C');
  g.addColorStop(0.5, '#B98B4E');
  g.addColorStop(1, '#8F6A38');
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, 0, 6.2832);
  ctx.arc(cx, cy, rIn, 0, 6.2832, true);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, rIn, 0, 6.2832);
  ctx.strokeStyle = 'rgba(90,70,40,0.35)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();
  // Screw at top
  const sw = 9 * dpr, sh = 14 * dpr;
  ctx.fillStyle = '#7E5C2E';
  ctx.fillRect(cx - sw / 2, cy - rOut - sh * 0.55, sw, sh * 0.8);
  ctx.beginPath();
  ctx.arc(cx, cy - rOut - sh * 0.55, sw * 0.62, 0, 6.2832);
  ctx.fillStyle = '#6B4D25';
  ctx.fill();
}
