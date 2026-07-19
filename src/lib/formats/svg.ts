// ============================================================
// SVG exporter for NeedleScript
// Converts a stitch event stream to a clean SVG file for
// print and graphic use — raw geometry, no embroidery-specific
// compensations, no machine-specific processing.
// No DOM dependencies.
//
// Units: millimetres. Coordinates are stored as Y-up in events;
// the exporter flips Y so the SVG is Y-down (standard SVG).
// ============================================================

import type { ColorTableEntry, ExportMetadata, StitchEvent } from '../core/types.ts';
import { DEFAULT_BACKGROUND, defaultSlotColor } from '../core/colormath.ts';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Pt = [number, number]; // [x, y] in SVG space (Y-down, origin at bbox top-left)

interface ColorRun {
  color: string;
  segments: Pt[][];
}

/**
 * Converts a NeedleScript stitch event stream to an SVG string.
 *
 * Design decisions:
 * - Coordinates in mm with 3-decimal precision; no 0.1 mm quantisation
 *   (unlike DST/PES/EXP which round to machine units).
 * - Y-axis is flipped: events are Y-up; SVG is Y-down.
 * - viewBox and width/height use the tight bounding box of visible stitches
 *   plus 1 mm of padding. The `width`/`height` attributes carry `mm` units so
 *   design tools (Illustrator, Inkscape, Affinity) import at the correct scale.
 * - Underlay stitches (e.u === 1) are excluded entirely — they exist only to
 *   stabilise fabric during embroidery and are not part of the aesthetic design.
 * - Jump travels are not drawn. The jump landing position starts the next
 *   visible stitch polyline, matching the canvas preview rendering.
 * - Each continuous stitch sequence (broken by jumps, trims, or color changes)
 *   becomes a subpath (M…L…) within a single <path> element per color run.
 * - stroke-width="0.4" reflects typical embroidery thread diameter in mm.
 * - No hoop boundary, density overlay, or debug marks.
 */
export function toSVG(
  events: StitchEvent[],
  name: string,
  threads: readonly string[] | readonly ColorTableEntry[] = [],
  background = DEFAULT_BACKGROUND,
  metadata?: ExportMetadata,
): string {
  const palette = threads.map((entry) => (typeof entry === 'string' ? entry : entry.hex));

  // ── 1. Bounding box from visible (non-underlay) stitches ─────────────────
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const e of events) {
    if (e.t === 'stitch' && e.u !== 1) {
      if (e.x < minX) minX = e.x;
      if (e.x > maxX) maxX = e.x;
      if (e.y < minY) minY = e.y;
      if (e.y > maxY) maxY = e.y;
    }
  }

  if (!isFinite(minX)) {
    // Empty / underlay-only design — return a minimal valid SVG
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10mm" height="10mm">\n' +
      `  <title>${escapeXml(name)}</title>\n` +
      (metadata?.machineProfile?.source === 'run-options'
        ? `  <metadata id="needlescript-metadata">${escapeXml(JSON.stringify({ machineProfile: metadata.machineProfile }))}</metadata>\n`
        : '') +
      '</svg>'
    );
  }

  const PAD = 1; // mm of padding around the design
  minX -= PAD;
  maxX += PAD;
  minY -= PAD;
  maxY += PAD;
  const W = maxX - minX;
  const H = maxY - minY;

  // Coordinate transforms: mm event space (Y-up) → SVG user units (Y-down)
  const toSvgX = (x: number): number => x - minX;
  const toSvgY = (y: number): number => maxY - y; // flip Y

  // ── 2. Walk events and build color runs with stitch segments ─────────────
  const runs: ColorRun[] = [];
  let colorIdx = 0;

  const currentRun = (): ColorRun => runs[runs.length - 1];
  const threadColor = (index: number) => palette[index] ?? defaultSlotColor(index);
  const startRun = () => runs.push({ color: threadColor(colorIdx), segments: [] });
  startRun();

  let currentSeg: Pt[] = [];
  let jumpPos: Pt | null = null; // SVG coords of last jump/underlay landing

  const flushSeg = () => {
    if (currentSeg.length >= 2) {
      currentRun().segments.push(currentSeg);
    }
    currentSeg = [];
  };

  for (const e of events) {
    switch (e.t) {
      case 'mark':
        // Debug pins — never exported
        break;

      case 'color':
        // Thread change: close current segment, start a new color run
        flushSeg();
        colorIdx++;
        startRun();
        jumpPos = null;
        break;

      case 'trim':
        // Thread cut: close current segment; next move will be a jump
        flushSeg();
        jumpPos = null;
        break;

      case 'jump':
        // Needle-up travel: close current segment, remember landing position.
        // The landing position becomes the first point of the next stitch
        // polyline, matching how the canvas preview renders post-jump stitches.
        flushSeg();
        jumpPos = [toSvgX(e.x), toSvgY(e.y)];
        break;

      case 'stitch': {
        if (currentRun().segments.length === 0 && currentSeg.length === 0) {
          colorIdx = e.c;
          currentRun().color = threadColor(colorIdx);
        }
        if (e.u === 1) {
          // Underlay stitch: excluded from SVG output.
          // Treat like a jump so position context is maintained for any
          // visible stitches that follow.
          flushSeg();
          jumpPos = [toSvgX(e.x), toSvgY(e.y)];
          break;
        }

        // Visible stitch: if we're starting a fresh segment and have a prior
        // jump/underlay landing position, include it as the segment origin.
        if (currentSeg.length === 0 && jumpPos !== null) {
          currentSeg.push(jumpPos);
          jumpPos = null;
        }

        currentSeg.push([toSvgX(e.x), toSvgY(e.y)]);
        break;
      }
    }
  }
  flushSeg();

  // ── 3. Emit SVG ───────────────────────────────────────────────────────────
  const f3 = (n: number) => n.toFixed(3);
  const f2 = (n: number) => n.toFixed(2);
  const fmtPt = ([x, y]: Pt) => `${f3(x)},${f3(y)}`;

  const out: string[] = [];

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg"` +
      ` viewBox="0 0 ${f3(W)} ${f3(H)}"` +
      ` width="${f2(W)}mm" height="${f2(H)}mm">`,
  );
  out.push(`  <title>${escapeXml(name)}</title>`);
  if (metadata?.machineProfile?.source === 'run-options')
    out.push(
      `  <metadata id="needlescript-metadata">${escapeXml(JSON.stringify({ machineProfile: metadata.machineProfile }))}</metadata>`,
    );
  out.push(`  <rect width="100%" height="100%" fill="${background}"/>`);

  for (const run of runs) {
    if (run.segments.length === 0) continue;

    // Build one SVG path element per color run.
    // Multiple disconnected stitch sequences become M…L… subpaths within
    // the single <path d="…"> attribute.
    const dParts: string[] = [];
    for (const seg of run.segments) {
      dParts.push(`M${fmtPt(seg[0])}`);
      for (let i = 1; i < seg.length; i++) {
        dParts.push(`L${fmtPt(seg[i])}`);
      }
    }

    out.push(
      `  <path` +
        ` fill="none"` +
        ` stroke="${run.color}"` +
        ` stroke-width="0.4"` +
        ` stroke-linecap="round"` +
        ` stroke-linejoin="round"` +
        ` d="${dParts.join(' ')}"/>`,
    );
  }

  out.push('</svg>');
  return out.join('\n');
}
