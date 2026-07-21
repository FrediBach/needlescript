// ---------- Tie-in / tie-off locks ----------

import type {
  EventType,
  StitchEvent,
  DesignStats,
  DensityCell,
  DensityHotspot,
  DensityResult,
  TravelPlanStats,
} from '../core/types.ts';
import { DEFAULT_THREAD_WIDTH_MM } from './embroidery-registry.ts';
import { eventSourceLine } from '../core/source-trace.ts';

interface LockResult {
  events: StitchEvent[];
  locks: number;
}

export function applyLocks(events: StitchEvent[], L: number): LockResult {
  const THRESH = 4;
  interface Part {
    run: boolean;
    ev: StitchEvent[];
    cut?: boolean;
  }
  const parts: Part[] = [];
  for (const e of events) {
    const isRun = e.t === 'stitch';
    if (!parts.length || parts[parts.length - 1].run !== isRun) parts.push({ run: isRun, ev: [] });
    parts[parts.length - 1].ev.push(e);
  }
  const out: StitchEvent[] = [];
  let locks = 0;
  let pos: StitchEvent | null = null;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  function gapCuts(part: Part, startPos: StitchEvent | null): boolean {
    let cut = false,
      jlen = 0,
      p: StitchEvent | null = startPos;
    for (const e of part.ev) {
      if (e.t === 'color' || e.t === 'trim') cut = true;
      if (e.t === 'jump') {
        if (p) jlen += dist(p, e);
        p = e;
      }
    }
    return cut || jlen >= THRESH;
  }

  function tie(at: StitchEvent | null, toward: StitchEvent | null, c: number) {
    if (!at || !toward) return;
    const d = dist(at, toward);
    if (d < 1e-6) return;
    const l = Math.min(L, d);
    if (l < 0.2) return;
    const ux = (toward.x - at.x) / d,
      uy = (toward.y - at.y) / d;
    for (let k = 0; k < 2; k++) {
      out.push({
        t: 'stitch',
        x: at.x + ux * l,
        y: at.y + uy * l,
        c,
        line: at.line,
        ...(at.source ? { source: at.source } : {}),
      });
      out.push({
        t: 'stitch',
        x: at.x,
        y: at.y,
        c,
        line: at.line,
        ...(at.source ? { source: at.source } : {}),
      });
    }
    locks++;
  }

  let firstRunSeen = false;
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (!part.run) {
      part.cut = gapCuts(part, pos);
      for (const e of part.ev) {
        out.push(e);
        if (e.t === 'jump') pos = e;
      }
      continue;
    }
    const ev = part.ev;
    const entry = pos;
    const needIn = !firstRunSeen || (pi > 0 && parts[pi - 1].cut);
    const nextGap = pi + 1 < parts.length ? parts[pi + 1] : null;
    const needOut = nextGap === null || gapCuts(nextGap, ev[ev.length - 1]);
    firstRunSeen = true;
    if (entry === null) {
      out.push(ev[0]);
      pos = ev[0];
      if (needIn) tie(ev[0], ev[1] || null, ev[0].c);
      for (let i = 1; i < ev.length; i++) {
        out.push(ev[i]);
        pos = ev[i];
      }
    } else {
      if (needIn) tie(entry, ev[0], ev[0].c);
      for (const e of ev) {
        out.push(e);
        pos = e;
      }
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
    if (e.t === 'stitch') {
      sewn = true;
      out.push(e);
      pos = e;
      i++;
      continue;
    }
    if (e.t === 'color' || e.t === 'trim') {
      sewn = false;
      out.push(e);
      i++;
      continue;
    }
    if (e.t === 'jump') {
      // measure the whole consecutive jump run
      let j = i,
        jl = 0,
        p: StitchEvent | null = pos;
      while (j < events.length && (events[j].t === 'jump' || events[j].t === 'mark')) {
        if (events[j].t === 'jump') {
          if (p) jl += Math.hypot(events[j].x - p.x, events[j].y - p.y);
          p = events[j];
        }
        j++;
      }
      if (sewn && pos && jl >= threshold) {
        out.push({
          t: 'trim',
          x: pos.x,
          y: pos.y,
          c: e.c,
          line: e.line,
          ...(e.source ? { source: e.source } : {}),
        });
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

interface DensCell {
  count: number;
  len: number;
  lines: Map<number, number>;
}

/**
 * Incremental thread build-up accumulator — the single source of truth for
 * coverage, shared by the post-process heatmap (densityMap, below) and the
 * live history queries (coverat/countat/nearestsewn/sewnwithin/stitchedpoints
 * — see the interpreter). Events are fed in **sewing order** exactly as they
 * are pushed onto the stitch stream, so a query mid-program reflects every
 * penetration committed so far and nothing buffered or sewn later. Tie-off
 * locks are added in a later pass (never fed here), so they never read as
 * crowding — the same exclusion the heatmap relies on.
 *
 * The physical quantity is **coverage**: millimetres of thread per mm² of
 * fabric, expressed in layers (1 layer ≈ a clean satin column or tatami fill).
 * Past ~2.5–3 layers the patch goes hard: needle deflection, thread breaks,
 * puckering. Repeated penetrations in the same hole cut the fabric and are
 * flagged separately.
 */
export class DensityGrid {
  readonly cellMM: number;
  private readonly cellArea: number;
  private _threadWidthMM: number;
  private readonly grid = new Map<string, DensCell>();
  private readonly micro = new Map<
    string,
    { count: number; x: number; y: number; line?: number }
  >();
  // Penetration points (hoop space, including underlay) plus a coarse bucket
  // index so nearest/within stay O(local) — the property that lets feedback
  // loops compose with the op limit instead of fighting it.
  private readonly pts: [number, number][] = [];
  private readonly buckets = new Map<string, [number, number][]>();
  private static readonly BUCKET = 4; // mm
  private px: number | null = null;
  private py = 0;

  constructor(cellMM = 1, threadWidthMM = DEFAULT_THREAD_WIDTH_MM) {
    this.cellMM = cellMM;
    this.cellArea = cellMM * cellMM;
    this._threadWidthMM = DensityGrid.validateThreadWidth(threadWidthMM);
  }

  private static validateThreadWidth(threadWidthMM: number): number {
    if (!Number.isFinite(threadWidthMM) || threadWidthMM <= 0)
      throw new RangeError('DensityGrid thread width must be a positive finite number');
    return threadWidthMM;
  }

  /** Width currently used for every live query and final coverage calculation. */
  get threadWidthMM(): number {
    return this._threadWidthMM;
  }

  /**
   * Change the resolved width without rebuilding geometry. Accumulated cells
   * retain raw path length, so all coverage reads consistently use this width.
   */
  setThreadWidthMM(threadWidthMM: number): void {
    this._threadWidthMM = DensityGrid.validateThreadWidth(threadWidthMM);
  }

  private cellOf(x: number, y: number): DensCell {
    const k = Math.floor(x / this.cellMM) + ',' + Math.floor(y / this.cellMM);
    let cell = this.grid.get(k);
    if (!cell) {
      cell = { count: 0, len: 0, lines: new Map() };
      this.grid.set(k, cell);
    }
    return cell;
  }

  /** Feed one stitch-stream event, in order. Mirrors the heatmap exactly. */
  feed(t: EventType, x: number, y: number, line?: number) {
    if (t === 'jump') {
      this.px = x;
      this.py = y;
      return;
    }
    if (t !== 'stitch') return; // color / trim / mark: no thread, cursor unchanged
    const cell = this.cellOf(x, y);
    cell.count++;
    if (line !== undefined) cell.lines.set(line, (cell.lines.get(line) || 0) + 1);
    if (this.px !== null) {
      const d = Math.hypot(x - this.px, y - this.py);
      if (d > 1e-6) {
        const steps = Math.max(1, Math.ceil(d / (this.cellMM * 0.5)));
        const dl = d / steps;
        for (let s = 0; s < steps; s++) {
          const tt = (s + 0.5) / steps;
          const c = this.cellOf(this.px + (x - this.px) * tt, this.py + (y - this.py) * tt);
          c.len += dl;
          if (line !== undefined) c.lines.set(line, (c.lines.get(line) || 0) + 0.2);
        }
      }
    }
    const mk = Math.round(x / 0.15) + ',' + Math.round(y / 0.15);
    const mm = this.micro.get(mk);
    if (mm) mm.count++;
    else this.micro.set(mk, { count: 1, x, y, line });
    // spatial index
    const p: [number, number] = [x, y];
    this.pts.push(p);
    const bk = Math.floor(x / DensityGrid.BUCKET) + ',' + Math.floor(y / DensityGrid.BUCKET);
    const b = this.buckets.get(bk);
    if (b) b.push(p);
    else this.buckets.set(bk, [p]);
    this.px = x;
    this.py = y;
  }

  // ---- Live queries (hoop space; zero draws, zero events) ----

  /** Thread coverage in layers at a point (containing 1 mm cell). */
  coverAt(x: number, y: number): number {
    const cell = this.grid.get(Math.floor(x / this.cellMM) + ',' + Math.floor(y / this.cellMM));
    return cell ? (cell.len * this.threadWidthMM) / this.cellArea : 0;
  }

  /** Coverage in layers averaged over the disc of radius r (empty cells = 0). */
  coverAvg(x: number, y: number, r: number): number {
    if (!(r > 0)) return this.coverAt(x, y);
    const c = this.cellMM;
    const ix0 = Math.floor((x - r) / c),
      ix1 = Math.floor((x + r) / c);
    const iy0 = Math.floor((y - r) / c),
      iy1 = Math.floor((y + r) / c);
    let sum = 0,
      n = 0;
    for (let ix = ix0; ix <= ix1; ix++) {
      const cx = (ix + 0.5) * c;
      for (let iy = iy0; iy <= iy1; iy++) {
        const cy = (iy + 0.5) * c;
        if (Math.hypot(cx - x, cy - y) > r) continue;
        n++;
        const cell = this.grid.get(ix + ',' + iy);
        if (cell) sum += (cell.len * this.threadWidthMM) / this.cellArea;
      }
    }
    return n ? sum / n : 0;
  }

  /** Penetration count in the containing 1 mm cell. */
  countAt(x: number, y: number): number {
    const cell = this.grid.get(Math.floor(x / this.cellMM) + ',' + Math.floor(y / this.cellMM));
    return cell ? cell.count : 0;
  }

  /** Closest prior penetration to (x, y), or null if nothing is sewn yet. */
  nearestSewn(x: number, y: number): [number, number] | null {
    if (!this.pts.length) return null;
    const B = DensityGrid.BUCKET;
    const bx = Math.floor(x / B),
      by = Math.floor(y / B);
    let best: [number, number] | null = null,
      bestD = Infinity;
    for (let ring = 0; ring < 100000; ring++) {
      // a point in bucket-ring `ring` is at least (ring-1)*B mm away
      if (best !== null && (ring - 1) * B > bestD) break;
      for (let gx = bx - ring; gx <= bx + ring; gx++)
        for (let gy = by - ring; gy <= by + ring; gy++) {
          if (Math.max(Math.abs(gx - bx), Math.abs(gy - by)) !== ring) continue;
          const b = this.buckets.get(gx + ',' + gy);
          if (!b) continue;
          for (const p of b) {
            const d = Math.hypot(p[0] - x, p[1] - y);
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
        }
    }
    return best;
  }

  /** All prior penetrations within r mm of (x, y) (sewing order preserved). */
  sewnWithin(x: number, y: number, r: number): [number, number][] {
    const out: [number, number][] = [];
    if (!(r >= 0)) return out;
    const B = DensityGrid.BUCKET;
    const gx0 = Math.floor((x - r) / B),
      gx1 = Math.floor((x + r) / B);
    const gy0 = Math.floor((y - r) / B),
      gy1 = Math.floor((y + r) / B);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const b = this.buckets.get(gx + ',' + gy);
        if (!b) continue;
        for (const p of b) if (Math.hypot(p[0] - x, p[1] - y) <= r) out.push(p);
      }
    return out;
  }

  /** The number of penetrations recorded so far. */
  get pointCount(): number {
    return this.pts.length;
  }

  /** A snapshot of every penetration so far (hoop space). */
  snapshot(): [number, number][] {
    return this.pts;
  }

  /** Collapse to the heatmap result the rest of the engine consumes. */
  finalize(threshold = 3): DensityResult {
    const cells: DensityCell[] = [];
    let peak = 0;
    for (const [k, cell] of this.grid) {
      const [ix, iy] = k.split(',').map(Number);
      const layers = (cell.len * this.threadWidthMM) / this.cellArea;
      if (layers > peak) peak = layers;
      cells.push({ ix, iy, count: cell.count, layers });
    }
    const hotspots: DensityHotspot[] = [];
    if (threshold > 0) {
      const hot = cells.filter((c) => c.layers > threshold).sort((a, b) => b.layers - a.layers);
      const taken: DensityCell[] = [];
      for (const c of hot) {
        if (taken.some((t) => Math.abs(t.ix - c.ix) <= 2 && Math.abs(t.iy - c.iy) <= 2)) continue;
        taken.push(c);
        const lines = [...(this.grid.get(c.ix + ',' + c.iy)?.lines || new Map<number, number>())]
          .toSorted((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map((l) => l[0]);
        hotspots.push({
          x: (c.ix + 0.5) * this.cellMM,
          y: (c.iy + 0.5) * this.cellMM,
          value: c.layers,
          lines,
          kind: 'density',
        });
        if (taken.length >= 20) break;
      }
      for (const m of this.micro.values()) {
        if (m.count >= 5) {
          hotspots.push({
            x: m.x,
            y: m.y,
            value: m.count,
            lines: m.line !== undefined ? [m.line] : [],
            kind: 'stack',
          });
          if (hotspots.length >= 40) break;
        }
      }
    }
    return { cellMM: this.cellMM, threadWidthMM: this.threadWidthMM, cells, peak, hotspots };
  }
}

/**
 * Post-process heatmap: build a DensityGrid by feeding the event stream, then
 * finalize. Identical output to feeding the live machine grid, so the history
 * queries and the heatmap always agree (one notion of density).
 */
export function densityMap(
  events: StitchEvent[],
  cellMM = 1,
  threshold = 3,
  threadWidthMM = DEFAULT_THREAD_WIDTH_MM,
): DensityResult {
  const g = new DensityGrid(cellMM, threadWidthMM);
  for (const e of events) g.feed(e.t, e.x, e.y, eventSourceLine(e));
  return g.finalize(threshold);
}

// ---------- Design stats ----------

export function designStats(
  events: StitchEvent[],
  plan?: TravelPlanStats,
  colorTable?: import('../core/types.ts').ColorTableEntry[],
): DesignStats {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let stitches = 0,
    jumps = 0,
    colors = 0,
    trims = 0;
  let maxLen = 0,
    maxR = 0,
    yarnLength = 0;
  let px: number | null = null,
    py: number | null = null;
  const colorSet = new Set<number>();
  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are render-only
    if (e.t === 'color') {
      colors++;
      px = e.x;
      py = e.y;
      continue;
    }
    if (e.t === 'trim') {
      trims++;
      continue;
    }
    if (e.x < minX) minX = e.x;
    if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y;
    if (e.y > maxY) maxY = e.y;
    const rr = Math.hypot(e.x, e.y);
    if (rr > maxR) maxR = rr;
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
    px = e.x;
    py = e.y;
  }
  if (!isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }
  return {
    stitches,
    jumps,
    trims,
    colorChanges: colors,
    colorsUsed: Math.max(1, colorSet.size),
    width: maxX - minX,
    height: maxY - minY,
    minX,
    maxX,
    minY,
    maxY,
    maxStitchLen: maxLen,
    maxRadius: maxR,
    yarnLength,
    ...(colorTable
      ? {
          slots: colorTable.map(({ slot, stitchCount, pathLenMm }) => ({
            slot,
            stitchCount,
            pathLenMm,
          })),
        }
      : {}),
    ...(plan
      ? {
          planMode: plan.planMode,
          travelBeforeMm: plan.travelBeforeMm,
          travelAfterMm: plan.travelAfterMm,
        }
      : {}),
  };
}
