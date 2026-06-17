// ---------- Tie-in / tie-off locks ----------

import type { StitchEvent, DesignStats, DensityCell, DensityHotspot, DensityResult } from './types.ts';

interface LockResult {
  events: StitchEvent[];
  locks: number;
}

export function applyLocks(events: StitchEvent[], L: number): LockResult {
  const THRESH = 4;
  interface Part { run: boolean; ev: StitchEvent[]; cut?: boolean }
  const parts: Part[] = [];
  for (const e of events) {
    const isRun = e.t === 'stitch';
    if (!parts.length || parts[parts.length - 1].run !== isRun)
      parts.push({ run: isRun, ev: [] });
    parts[parts.length - 1].ev.push(e);
  }
  const out: StitchEvent[] = [];
  let locks = 0;
  let pos: StitchEvent | null = null;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  function gapCuts(part: Part, startPos: StitchEvent | null): boolean {
    let cut = false, jlen = 0, p: StitchEvent | null = startPos;
    for (const e of part.ev) {
      if (e.t === 'color' || e.t === 'trim') cut = true;
      if (e.t === 'jump') { if (p) jlen += dist(p, e); p = e; }
    }
    return cut || jlen >= THRESH;
  }

  function tie(at: StitchEvent | null, toward: StitchEvent | null, c: number) {
    if (!at || !toward) return;
    const d = dist(at, toward);
    if (d < 1e-6) return;
    const l = Math.min(L, d);
    if (l < 0.2) return;
    const ux = (toward.x - at.x) / d, uy = (toward.y - at.y) / d;
    for (let k = 0; k < 2; k++) {
      out.push({ t: 'stitch', x: at.x + ux * l, y: at.y + uy * l, c, line: at.line });
      out.push({ t: 'stitch', x: at.x, y: at.y, c, line: at.line });
    }
    locks++;
  }

  let firstRunSeen = false;
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (!part.run) {
      part.cut = gapCuts(part, pos);
      for (const e of part.ev) { out.push(e); if (e.t === 'jump') pos = e; }
      continue;
    }
    const ev = part.ev;
    const entry = pos;
    const needIn = !firstRunSeen || (pi > 0 && parts[pi - 1].cut);
    const nextGap = pi + 1 < parts.length ? parts[pi + 1] : null;
    const needOut = nextGap === null || gapCuts(nextGap, ev[ev.length - 1]);
    firstRunSeen = true;
    if (entry === null) {
      out.push(ev[0]); pos = ev[0];
      if (needIn) tie(ev[0], ev[1] || null, ev[0].c);
      for (let i = 1; i < ev.length; i++) { out.push(ev[i]); pos = ev[i]; }
    } else {
      if (needIn) tie(entry, ev[0], ev[0].c);
      for (const e of ev) { out.push(e); pos = e; }
    }
    if (needOut) {
      const last = ev[ev.length - 1];
      const back = ev.length >= 2 ? ev[ev.length - 2] : entry;
      tie(last, back, last.c);
    }
  }
  return { events: out, locks };
}

// ---------- Auto trim ----------

/**
 * Insert a trim before any travel of `threshold` mm or more of consecutive
 * jumps, so long connector threads don't dangle and snag on the garment.
 * Never trims when nothing has been sewn since the last cut.
 */
export function applyAutoTrim(
  events: StitchEvent[],
  threshold: number,
): { events: StitchEvent[]; trims: number } {
  const out: StitchEvent[] = [];
  let trims = 0;
  let sewn = false;
  let pos: StitchEvent | null = null;
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.t === 'stitch') { sewn = true; out.push(e); pos = e; i++; continue; }
    if (e.t === 'color' || e.t === 'trim') { sewn = false; out.push(e); i++; continue; }
    if (e.t === 'jump') {
      // measure the whole consecutive jump run
      let j = i, jl = 0, p: StitchEvent | null = pos;
      while (j < events.length && (events[j].t === 'jump' || events[j].t === 'mark')) {
        if (events[j].t === 'jump') {
          if (p) jl += Math.hypot(events[j].x - p.x, events[j].y - p.y);
          p = events[j];
        }
        j++;
      }
      if (sewn && pos && jl >= threshold) {
        out.push({ t: 'trim', x: pos.x, y: pos.y, c: e.c, line: e.line });
        trims++;
        sewn = false;
      }
      for (; i < j; i++) {
        out.push(events[i]);
        if (events[i].t === 'jump') pos = events[i];
      }
      continue;
    }
    out.push(e); // mark
    i++;
  }
  return { events: out, trims };
}

// ---------- Local density analysis ----------

const THREAD_W = 0.4; // typical 40 wt thread width on fabric, mm

/**
 * Grid analysis of thread build-up. The physical quantity that matters is
 * **coverage**: millimetres of thread per mm² of fabric, expressed in layers
 * (1 layer ≈ a clean satin column or tatami fill). Past ~2.5–3 layers the
 * patch goes hard: needle deflection, thread breaks, puckering. Repeated
 * penetrations in the same hole cut the fabric and are flagged separately.
 */
export function densityMap(
  events: StitchEvent[],
  cellMM = 1,
  threshold = 3,
): DensityResult {
  interface Cell { count: number; len: number; lines: Map<number, number> }
  const grid = new Map<string, Cell>();
  const micro = new Map<string, { count: number; x: number; y: number; line?: number }>();
  const cellOf = (x: number, y: number) => {
    const k = Math.floor(x / cellMM) + ',' + Math.floor(y / cellMM);
    let cell = grid.get(k);
    if (!cell) { cell = { count: 0, len: 0, lines: new Map() }; grid.set(k, cell); }
    return cell;
  };

  let px: number | null = null, py = 0;
  for (const e of events) {
    if (e.t === 'jump') { px = e.x; py = e.y; continue; }
    if (e.t !== 'stitch') continue;
    const cell = cellOf(e.x, e.y);
    cell.count++;
    if (e.line !== undefined) cell.lines.set(e.line, (cell.lines.get(e.line) || 0) + 1);
    // spread the thread length of this stitch over the cells it crosses
    if (px !== null) {
      const d = Math.hypot(e.x - px, e.y - py);
      if (d > 1e-6) {
        const steps = Math.max(1, Math.ceil(d / (cellMM * 0.5)));
        const dl = d / steps;
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          const c = cellOf(px + (e.x - px) * t, py + (e.y - py) * t);
          c.len += dl;
          if (e.line !== undefined) c.lines.set(e.line, (c.lines.get(e.line) || 0) + 0.2);
        }
      }
    }
    // same-hole detection on a 0.15 mm grid
    const mk = Math.round(e.x / 0.15) + ',' + Math.round(e.y / 0.15);
    const m = micro.get(mk);
    if (m) { m.count++; }
    else micro.set(mk, { count: 1, x: e.x, y: e.y, line: e.line });
    px = e.x; py = e.y;
  }

  const cellArea = cellMM * cellMM;
  const cells: DensityCell[] = [];
  let peak = 0;
  for (const [k, cell] of grid) {
    const [ix, iy] = k.split(',').map(Number);
    const layers = (cell.len * THREAD_W) / cellArea;
    if (layers > peak) peak = layers;
    cells.push({ ix, iy, count: cell.count, layers });
  }

  const hotspots: DensityHotspot[] = [];
  if (threshold > 0) {
    const hot = cells
      .filter(c => c.layers > threshold)
      .sort((a, b) => b.layers - a.layers);
    const taken: DensityCell[] = [];
    for (const c of hot) {
      if (taken.some(t => Math.abs(t.ix - c.ix) <= 2 && Math.abs(t.iy - c.iy) <= 2)) continue;
      taken.push(c);
      const lines = [...(grid.get(c.ix + ',' + c.iy)?.lines || new Map<number, number>())]
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(l => l[0]);
      hotspots.push({
        x: (c.ix + 0.5) * cellMM,
        y: (c.iy + 0.5) * cellMM,
        value: c.layers,
        lines,
        kind: 'density',
      });
      if (taken.length >= 20) break;
    }
    for (const m of micro.values()) {
      if (m.count >= 5) {
        hotspots.push({
          x: m.x, y: m.y, value: m.count,
          lines: m.line !== undefined ? [m.line] : [],
          kind: 'stack',
        });
        if (hotspots.length >= 40) break;
      }
    }
  }
  return { cellMM, cells, peak, hotspots };
}

// ---------- Design stats ----------

export function designStats(events: StitchEvent[]): DesignStats {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let stitches = 0, jumps = 0, colors = 0, trims = 0;
  let maxLen = 0, maxR = 0, yarnLength = 0;
  let px: number | null = null, py: number | null = null;
  const colorSet = new Set<number>();
  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are render-only
    if (e.t === 'color') { colors++; px = e.x; py = e.y; continue; }
    if (e.t === 'trim') { trims++; continue; }
    if (e.x < minX) minX = e.x; if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y; if (e.y > maxY) maxY = e.y;
    const rr = Math.hypot(e.x, e.y); if (rr > maxR) maxR = rr;
    if (e.t === 'stitch') {
      stitches++;
      colorSet.add(e.c);
      if (px !== null && py !== null) {
        const d = Math.hypot(e.x - px, e.y - py);
        maxLen = Math.max(maxLen, d);
        yarnLength += d;
      }
    } else {
      jumps++;
    }
    px = e.x; py = e.y;
  }
  if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
  return {
    stitches, jumps, trims,
    colorChanges: colors,
    colorsUsed: Math.max(1, colorSet.size),
    width: maxX - minX, height: maxY - minY,
    minX, maxX, minY, maxY, maxStitchLen: maxLen, maxRadius: maxR,
    yarnLength,
  };
}
