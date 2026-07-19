// ---------- Tatami fill ----------

export interface FillOpts {
  angle: number;
  spacing: number;
  stitchLen: number;
  endNear?: { x: number; y: number };
  /** Extend (+) or inset (−) each row end along the stitch axis, in mm. */
  comp?: number;
  /** Require every sewn row connector to remain inside the compound region. */
  safeConnect?: boolean;
}

export interface FillPoint {
  x: number;
  y: number;
  jump: boolean;
}

/** Routed, unsplit tatami row spines. Pull compensation and brick subdivision are omitted. */
export function generateFillRows(
  rings: [number, number][][],
  spacingArg: number,
  angleDeg: number,
): [number, number][][] {
  const angle = (angleDeg || 0) * (Math.PI / 180);
  const ca = Math.cos(angle),
    sa = Math.sin(angle);
  const rot = (p: [number, number]): [number, number] => [
    p[0] * ca + p[1] * sa,
    -p[0] * sa + p[1] * ca,
  ];
  const unrot = (p: [number, number]): [number, number] => [
    p[0] * ca - p[1] * sa,
    p[0] * sa + p[1] * ca,
  ];
  const rr = rings.map((ring) => ring.map(rot));
  const spacing = Math.min(Math.max(spacingArg || 0.4, 0.25), 5);
  let minY = Infinity,
    maxY = -Infinity;
  for (const ring of rr)
    for (const p of ring) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  if (!(maxY - minY > spacing * 0.6)) return [];
  const rows: { a: [number, number]; b: [number, number] }[][] = [];
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
    const xs: number[] = [];
    for (const ring of rr)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    xs.sort((a, b) => a - b);
    const row: { a: [number, number]; b: [number, number] }[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2)
      if (xs[i + 1] - xs[i] >= 0.5) row.push({ a: [xs[i], y], b: [xs[i + 1], y] });
    if (row.length) rows.push(row);
  }
  if (!rows.length) return [];
  const end = rings[0]?.[0] ? rot(rings[0][0]) : null;
  const orderedRows =
    end && Math.abs(end[1] - rows[0][0].a[1]) < Math.abs(end[1] - rows[rows.length - 1][0].a[1])
      ? rows.slice().reverse()
      : rows;
  const segs = orderedRows.flat();
  const out: [number, number][][] = [];
  let cur: [number, number] | null = null;
  while (segs.length) {
    let best = 0,
      reverse = false,
      dist = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const da = cur ? Math.hypot(segs[i].a[0] - cur[0], segs[i].a[1] - cur[1]) : i;
      const db = cur ? Math.hypot(segs[i].b[0] - cur[0], segs[i].b[1] - cur[1]) : i + 0.5;
      if (da < dist) {
        best = i;
        reverse = false;
        dist = da;
      }
      if (db < dist) {
        best = i;
        reverse = true;
        dist = db;
      }
    }
    const seg = segs.splice(best, 1)[0];
    const path = reverse ? [seg.b, seg.a] : [seg.a, seg.b];
    out.push(path.map(unrot));
    cur = path[1];
  }
  return out;
}

export function evenOddInside(rings: [number, number][][], px: number, py: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
        const xi = a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (xi > px) inside = !inside;
      }
    }
  }
  return inside;
}

export function generateFill(rings: [number, number][][], opt: FillOpts): FillPoint[] {
  const angle = (opt.angle || 0) * (Math.PI / 180);
  const ca = Math.cos(angle),
    sa = Math.sin(angle);
  const rot = (p: [number, number]): [number, number] => [
    p[0] * ca + p[1] * sa,
    -p[0] * sa + p[1] * ca,
  ];
  const unrot = (p: [number, number]): [number, number] => [
    p[0] * ca - p[1] * sa,
    p[0] * sa + p[1] * ca,
  ];
  const R = rings.map((r) => r.map(rot));
  const spacing = Math.min(Math.max(opt.spacing || 0.4, 0.25), 5);
  const slen = Math.min(Math.max(opt.stitchLen || 3, 1), 7);

  let minY = Infinity,
    maxY = -Infinity;
  R.forEach((r) =>
    r.forEach((p) => {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }),
  );
  if (!(maxY - minY > spacing * 0.6)) return [];

  interface Seg {
    x0: number;
    x1: number;
    y: number;
    row: number;
  }

  const rows: Seg[][] = [];
  let rowIdx = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing, rowIdx++) {
    const xs: number[] = [];
    for (const ring of R) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
    }
    xs.sort((p, q) => p - q);
    const segs: Seg[] = [];
    const comp = opt.comp || 0; // pull compensation (+) or underlay inset (−)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a0 = xs[i] - comp,
        a1 = xs[i + 1] + comp;
      if (a1 - a0 >= 0.5) segs.push({ x0: a0, x1: a1, y, row: rowIdx });
    }
    if (segs.length) rows.push(segs);
  }
  if (!rows.length) return [];

  let order = rows;
  if (opt.endNear) {
    const en = rot([opt.endNear.x, opt.endNear.y]);
    const dFirst = Math.abs(en[1] - rows[0][0].y);
    const dLast = Math.abs(en[1] - rows[rows.length - 1][0].y);
    if (dFirst < dLast) order = rows.slice().reverse();
  }

  const out: { p: [number, number]; jump: boolean }[] = [];
  let cur: [number, number] | null = null;

  function push(x: number, y: number, jump: boolean) {
    out.push({ p: [x, y], jump });
    cur = [x, y];
  }

  function sewLine(to: [number, number]) {
    if (!cur) return;
    const dx = to[0] - cur[0],
      dy = to[1] - cur[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    const start: [number, number] = [cur[0], cur[1]];
    const steps = Math.max(1, Math.ceil(d / slen));
    for (let k = 1; k <= steps; k++) {
      push(start[0] + (dx * k) / steps, start[1] + (dy * k) / steps, false);
    }
  }

  function connect(to: [number, number]) {
    if (!cur) return;
    const d = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
    if (d < 0.05) return;
    if (!opt.safeConnect && d <= spacing * 3 + 0.6) {
      sewLine(to);
      return;
    }
    let allIn = d <= 12;
    if (allIn) {
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let k = 1; k < n; k++) {
        const mx = cur[0] + ((to[0] - cur[0]) * k) / n;
        const my = cur[1] + ((to[1] - cur[1]) * k) / n;
        if (!evenOddInside(R, mx, my)) {
          allIn = false;
          break;
        }
      }
    }
    if (allIn) sewLine(to);
    else push(to[0], to[1], true);
  }

  function sewSegment(seg: Seg, reverse: boolean) {
    const from = reverse ? seg.x1 : seg.x0;
    const to = reverse ? seg.x0 : seg.x1;
    if (cur === null) push(from, seg.y, false);
    else connect([from, seg.y]);
    const phase = (seg.row % 3) * (slen / 3);
    const lo = Math.min(from, to) + 0.3,
      hi = Math.max(from, to) - 0.3;
    const grid: number[] = [];
    for (let g = Math.ceil((lo - phase) / slen) * slen + phase; g < hi; g += slen) grid.push(g);
    if (reverse) grid.reverse();
    for (const g of grid) sewLine([g, seg.y]);
    sewLine([to, seg.y]);
  }

  const all: Seg[] = [];
  for (const rowSegs of order) for (const seg of rowSegs) all.push(seg);

  while (all.length) {
    let bi = 0,
      brev = false,
      bd = Infinity;
    for (let i = 0; i < all.length; i++) {
      const sgm = all[i];
      const dS = cur ? Math.hypot(sgm.x0 - cur[0], sgm.y - cur[1]) : i;
      const dE = cur ? Math.hypot(sgm.x1 - cur[0], sgm.y - cur[1]) : i + 0.5;
      if (dS < bd) {
        bd = dS;
        bi = i;
        brev = false;
      }
      if (dE < bd) {
        bd = dE;
        bi = i;
        brev = true;
      }
    }
    sewSegment(all.splice(bi, 1)[0], brev);
  }

  return out.map((o) => {
    const p = unrot(o.p);
    return { x: p[0], y: p[1], jump: o.jump };
  });
}
