// ============================================================
// SVG importer for Needlescript.
// Converts SVG elements to Needlescript source code.
// Supported: <path> (M L H V C S Q T A Z), <rect>, <circle>,
// <ellipse>, <line>, <polyline>, <polygon>, <g>, transforms.
// No external dependencies.
// ============================================================

type Point = [number, number];
type Matrix = [number, number, number, number, number, number]; // SVG 2×3 affine

// ---------- path "d" parser ----------

function parsePathD(d: string, minSeg = 8, maxSeg = 72): Point[][] {
  const tokenMatch = d.match(
    /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g,
  );
  if (!tokenMatch) return [];
  const tokens: string[] = tokenMatch;

  let i = 0;
  function num(): number {
    if (i >= tokens.length) throw new Error('path data ended mid-command');
    const v = parseFloat(tokens[i++]);
    if (isNaN(v)) throw new Error(`expected a number in path data, got "${tokens[i - 1]}"`);
    return v;
  }
  function flag(): boolean { return num() !== 0; }

  const subpaths: Point[][] = [];
  let pts: Point[] | null = null;
  let x = 0, y = 0;
  let sx = 0, sy = 0;
  let px_: number | null = null, py_: number | null = null;
  let qx: number | null = null, qy: number | null = null;
  let cmd: string | null = null;

  function start(nx: number, ny: number) {
    if (pts && pts.length >= 2) subpaths.push(pts);
    pts = [[nx, ny]];
    x = sx = nx; y = sy = ny;
  }
  function lineTo(nx: number, ny: number) {
    if (!pts) start(0, 0);
    pts!.push([nx, ny]);
    x = nx; y = ny;
  }
  function segCount(approxLen: number) {
    return Math.max(minSeg, Math.min(maxSeg, Math.ceil(approxLen)));
  }
  function cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number) {
    const L =
      Math.hypot(c1x - x, c1y - y) +
      Math.hypot(c2x - c1x, c2y - c1y) +
      Math.hypot(ex - c2x, ey - c2y);
    const n = segCount(L);
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c2 = 3 * u * t * t, dd = t * t * t;
      lineTo(a * x0 + b * c1x + c2 * c2x + dd * ex, a * y0 + b * c1y + c2 * c2y + dd * ey);
    }
    px_ = c2x; py_ = c2y;
  }
  function quadTo(cx2: number, cy2: number, ex: number, ey: number) {
    const L = Math.hypot(cx2 - x, cy2 - y) + Math.hypot(ex - cx2, ey - cy2);
    const n = segCount(L);
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      lineTo(u * u * x0 + 2 * u * t * cx2 + t * t * ex, u * u * y0 + 2 * u * t * cy2 + t * t * ey);
    }
    qx = cx2; qy = cy2;
  }
  function arcTo(rx: number, ry: number, rotDeg: number, largeArc: boolean, sweep: boolean, ex: number, ey: number) {
    if (rx === 0 || ry === 0) { lineTo(ex, ey); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = rotDeg * Math.PI / 180;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx2 = (x - ex) / 2, dy2 = (y - ey) / 2;
    const x1 = cosP * dx2 + sinP * dy2, y1 = -sinP * dx2 + cosP * dy2;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const sign = (largeArc !== sweep) ? 1 : -1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const rad = Math.max(0, (rx * rx * ry * ry - den) / den);
    const co = sign * Math.sqrt(rad);
    const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
    const cxc = cosP * cxp - sinP * cyp + (x + ex) / 2;
    const cyc = sinP * cxp + cosP * cyp + (y + ey) / 2;
    function ang(ux: number, uy: number, vx: number, vy: number) {
      const dot = ux * vx + uy * vy;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      const a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      return (ux * vy - uy * vx < 0) ? -a : a;
    }
    const th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI;
    if (sweep && dth < 0) dth += 2 * Math.PI;
    const n = segCount(Math.abs(dth) * Math.max(rx, ry));
    for (let k = 1; k <= n; k++) {
      const t = th1 + dth * (k / n);
      lineTo(
        cxc + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP,
        cyc + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP,
      );
    }
  }

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; }
    if (cmd === null) throw new Error('path data must start with M');
    const rel: boolean = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case 'M': {
        const nx = num(), ny = num();
        start(rel ? x + nx : nx, rel ? y + ny : ny);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': { const lx = num(), ly = num(); lineTo(rel ? x + lx : lx, rel ? y + ly : ly); break; }
      case 'H': { const hx = num(); lineTo(rel ? x + hx : hx, y); break; }
      case 'V': { const vy = num(); lineTo(x, rel ? y + vy : vy); break; }
      case 'C': {
        const a1 = num(), a2 = num(), a3 = num(), a4 = num(), a5 = num(), a6 = num();
        cubicTo(rel ? x + a1 : a1, rel ? y + a2 : a2, rel ? x + a3 : a3, rel ? y + a4 : a4, rel ? x + a5 : a5, rel ? y + a6 : a6);
        break;
      }
      case 'S': {
        const s3 = num(), s4 = num(), s5 = num(), s6 = num();
        const r1 = px_ !== null ? 2 * x - px_ : x;
        const r2 = py_ !== null ? 2 * y - py_ : y;
        cubicTo(r1, r2, rel ? x + s3 : s3, rel ? y + s4 : s4, rel ? x + s5 : s5, rel ? y + s6 : s6);
        break;
      }
      case 'Q': {
        const q1 = num(), q2 = num(), q3 = num(), q4 = num();
        quadTo(rel ? x + q1 : q1, rel ? y + q2 : q2, rel ? x + q3 : q3, rel ? y + q4 : q4);
        break;
      }
      case 'T': {
        const t3 = num(), t4 = num();
        const rq1 = qx !== null ? 2 * x - qx : x;
        const rq2 = qy !== null ? 2 * y - qy : y;
        quadTo(rq1, rq2, rel ? x + t3 : t3, rel ? y + t4 : t4);
        break;
      }
      case 'A': {
        const rx2 = num(), ry2 = num(), rot = num(), laf = flag(), swf = flag(), ax = num(), ay = num();
        arcTo(rx2, ry2, rot, laf, swf, rel ? x + ax : ax, rel ? y + ay : ay);
        break;
      }
      case 'Z': {
        const ptsZ = pts as Point[] | null;
        if (ptsZ !== null && ptsZ.length) lineTo(sx, sy);
        break;
      }
      default: throw new Error(`unsupported path command "${cmd}"`);
    }
    if (C !== 'S' && C !== 'C') { px_ = null; py_ = null; }
    if (C !== 'Q' && C !== 'T') { qx = null; qy = null; }
  }
  const ptsEnd = pts as Point[] | null;
  if (ptsEnd !== null && ptsEnd.length >= 2) subpaths.push(ptsEnd);
  return subpaths;
}

// ---------- basic shapes -> polylines ----------

function shapeToPolylines(
  tag: string,
  attr: (name: string) => string | null,
): Point[][] | null {
  function n(name: string, dflt: number): number {
    const v = attr(name);
    if (v === null || v === undefined || v === '') return dflt;
    const f = parseFloat(v);
    return isNaN(f) ? dflt : f;
  }
  function ringPoints(cx: number, cy: number, rx: number, ry: number, steps: number): Point[] {
    const p: Point[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * 2 * Math.PI;
      p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return p;
  }
  switch (tag) {
    case 'path': { const d = attr('d'); return d ? parsePathD(d) : []; }
    case 'rect': {
      const rx0 = n('x', 0), ry0 = n('y', 0), w = n('width', 0), h = n('height', 0);
      if (w <= 0 || h <= 0) return [];
      return [[[rx0, ry0], [rx0 + w, ry0], [rx0 + w, ry0 + h], [rx0, ry0 + h], [rx0, ry0]]];
    }
    case 'circle': {
      const r = n('r', 0);
      if (r <= 0) return [];
      return [ringPoints(n('cx', 0), n('cy', 0), r, r, 64)];
    }
    case 'ellipse': {
      const erx = n('rx', 0), ery = n('ry', 0);
      if (erx <= 0 || ery <= 0) return [];
      return [ringPoints(n('cx', 0), n('cy', 0), erx, ery, 64)];
    }
    case 'line':
      return [[[n('x1', 0), n('y1', 0)], [n('x2', 0), n('y2', 0)]]];
    case 'polyline':
    case 'polygon': {
      const raw = (attr('points') || '').match(
        /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g,
      );
      if (!raw || raw.length < 4) return [];
      const p: Point[] = [];
      for (let k = 0; k + 1 < raw.length; k += 2)
        p.push([parseFloat(raw[k]), parseFloat(raw[k + 1])]);
      if (tag === 'polygon') p.push([p[0][0], p[0][1]]);
      return [p];
    }
    default: return null;
  }
}

// ---------- transforms ----------

function matMul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function matApply(m: Matrix, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

function parseTransform(str: string): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(str)) !== null) {
    const args = (
      mm[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []
    ).map(parseFloat);
    let t: Matrix | null = null;
    switch (mm[1]) {
      case 'matrix': if (args.length === 6) t = args as Matrix; break;
      case 'translate': t = [1, 0, 0, 1, args[0] || 0, args.length > 1 ? args[1] : 0]; break;
      case 'scale': t = [args[0] || 1, 0, 0, args.length > 1 ? args[1] : (args[0] || 1), 0, 0]; break;
      case 'rotate': {
        const a = (args[0] || 0) * Math.PI / 180;
        const rot: Matrix = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (args.length > 2) {
          t = matMul(matMul([1, 0, 0, 1, args[1], args[2]], rot), [1, 0, 0, 1, -args[1], -args[2]]);
        } else t = rot;
        break;
      }
      case 'skewX': { const a = (args[0] || 0) * Math.PI / 180; t = [1, 0, Math.tan(a), 1, 0, 0]; break; }
      case 'skewY': { const a = (args[0] || 0) * Math.PI / 180; t = [1, Math.tan(a), 0, 1, 0, 0]; break; }
    }
    if (t) m = matMul(m, t);
  }
  return m;
}

// ---------- color utilities ----------

const SVG_NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
  brown: '#a52a2a', gray: '#808080', grey: '#808080', gold: '#ffd700', navy: '#000080',
  teal: '#008080', maroon: '#800000', olive: '#808000', cyan: '#00ffff', magenta: '#ff00ff',
};

function parseColorStr(s: string | null | undefined): number[] | null | undefined {
  if (!s) return undefined;
  s = s.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  if (s === 'currentcolor' || s === 'inherit') return undefined;
  if (s[0] === '#') {
    if (s.length === 4) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
    if (s.length >= 7) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    return undefined;
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].map(v =>
      v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : Math.round(parseFloat(v)),
    );
  }
  if (SVG_NAMED[s]) return parseColorStr(SVG_NAMED[s]);
  return undefined;
}

function nearestThread(rgb: number[], palette: string[]): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = parseColorStr(palette[i]) as number[];
    const d = (rgb[0] - p[0]) ** 2 + (rgb[1] - p[1]) ** 2 + (rgb[2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------- RDP simplification ----------

function simplifyRDP(pts: Point[], tol: number): Point[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop()!;
    const [a, b] = seg;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      let d: number;
      if (len2 === 0) {
        d = (pts[i][0] - ax) ** 2 + (pts[i][1] - ay) ** 2;
      } else {
        const cr = (pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx;
        d = cr * cr / len2;
      }
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > t2) { keep[maxI] = 1; stack.push([a, maxI], [maxI, b]); }
  }
  const out: Point[] = [];
  for (let k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
  return out;
}

// ---------- Shape with paint ----------

interface Shape {
  subpaths: Point[][];
  fill: string | null;   // '#hex' or null (none)
  stroke: string | null; // '#hex' or null (none)
}

interface ShapeWithSimp extends Shape {
  simp: Point[][];
}

// ---------- Convert shapes to code ----------

export interface ConvertOptions {
  fitMM?: number;
  palette?: string[];
  name?: string;
  maxSegments?: number;
}

export interface ConvertReport {
  fills: number;
  outlines: number;
  colors: number;
  pointsRaw: number;
  segments: number;
  tolerance: number;
  fitMM: number;
  ignored?: Record<string, number>;
}

export interface ConvertResult {
  code: string;
  report: ConvertReport;
}

export function convertShapes(shapes: Shape[], opts: ConvertOptions = {}): ConvertResult {
  const fitMM = Math.min(Math.max(opts.fitMM || 80, 5), 200);
  const palette = opts.palette || ['#C8472F', '#31604F', '#3A4E8C', '#D9A441', '#8C4A6B', '#2B2B2B', '#5E8F8C', '#B8651B'];
  const name = opts.name || 'import';
  const maxSegments = opts.maxSegments || 1400;

  // clean subpaths
  const work: ShapeWithSimp[] = [];
  let totalRaw = 0;
  shapes.forEach(sh => {
    if (sh.fill === null && sh.stroke === null) return;
    const subs: Point[][] = [];
    (sh.subpaths || []).forEach(pl => {
      const pts: Point[] = [];
      let last: Point | null = null;
      pl.forEach(p => {
        if (!isFinite(p[0]) || !isFinite(p[1])) return;
        if (last && Math.abs(p[0] - last[0]) < 1e-9 && Math.abs(p[1] - last[1]) < 1e-9) return;
        pts.push([p[0], p[1]]); last = p;
      });
      totalRaw += pts.length;
      if (pts.length >= 2) subs.push(pts);
    });
    if (subs.length) work.push({ subpaths: subs, fill: sh.fill, stroke: sh.stroke, simp: [] });
  });
  if (!work.length)
    throw new Error('No stitchable outlines found in this SVG (paths, shapes and lines are supported).');

  // bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  work.forEach(sh => sh.subpaths.forEach(pl => pl.forEach(p => {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  })));
  const span = Math.max(maxX - minX, maxY - minY);
  if (span < 1e-9) throw new Error('SVG geometry has zero size.');
  const scale = fitMM / span;
  const cxBB = (minX + maxX) / 2, cyBB = (minY + maxY) / 2;

  // scale, centre, flip y
  work.forEach(sh => {
    sh.subpaths = sh.subpaths.map(pl =>
      pl.map(p => [(p[0] - cxBB) * scale, -(p[1] - cyBB) * scale] as Point),
    );
  });

  // simplify
  const tolLadder = [0.2, 0.3, 0.45, 0.7, 1.0, 1.5, 2.2];
  let tol = tolLadder[0];
  let segs = 0;
  for (let ti = 0; ti < tolLadder.length; ti++) {
    tol = tolLadder[ti];
    segs = 0;
    work.forEach(sh => {
      sh.simp = sh.subpaths.map(pl => {
        const sp = simplifyRDP(pl, tol);
        segs += Math.max(0, sp.length - 1);
        return sp;
      });
    });
    if (segs <= maxSegments) break;
  }

  function pathLen(pl: Point[]): number {
    let L = 0;
    for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    return L;
  }
  function isClosed(pl: Point[]): boolean {
    return Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 0.15;
  }
  function threadOf(hex: string | null): number {
    const rgb = (parseColorStr(hex || '') as number[]) || [0, 0, 0];
    return nearestThread(rgb, palette);
  }

  interface Job {
    thread: number;
    subpaths: Point[][];
    proc?: string;
  }

  const fillJobs: Job[] = [], strokeJobs: Job[] = [];
  const procs: { name: string; subpaths: Point[][] }[] = [];
  let procCount = 0;

  work.forEach(sh => {
    const usable = sh.simp.filter(pl => pl.length >= 2 && pathLen(pl) >= 1);
    if (!usable.length) return;
    let fillable: Point[][] | null = null;
    if (sh.fill !== null) {
      fillable = usable.filter(pl =>
        pl.length >= (isClosed(pl) ? 4 : 3) && pathLen(pl) >= 3,
      );
      if (!fillable.length) fillable = null;
    }
    const wantStroke = sh.stroke !== null;
    if (fillable && wantStroke) {
      const pname = `shape_${++procCount}`;
      procs.push({ name: pname, subpaths: fillable });
      fillJobs.push({ thread: threadOf(sh.fill), proc: pname, subpaths: fillable });
      strokeJobs.push({ thread: threadOf(sh.stroke), proc: pname, subpaths: fillable });
      usable.forEach(pl => {
        if (!fillable!.includes(pl)) strokeJobs.push({ thread: threadOf(sh.stroke), subpaths: [pl] });
      });
    } else if (fillable) {
      fillJobs.push({ thread: threadOf(sh.fill), subpaths: fillable });
    } else if (wantStroke) {
      usable.forEach(pl => strokeJobs.push({ thread: threadOf(sh.stroke), subpaths: [pl] }));
    }
  });
  if (!fillJobs.length && !strokeJobs.length)
    throw new Error('All outlines were too small to stitch at this size — try a larger "fit" value.');

  interface Group { thread: number; jobs: Job[] }

  function groupJobs(jobs: Job[], allowReverse: boolean): Group[] {
    const groups: Group[] = [];
    const byThread: Record<number, Group> = {};
    jobs.forEach(j => {
      if (!(j.thread in byThread)) {
        byThread[j.thread] = { thread: j.thread, jobs: [] };
        groups.push(byThread[j.thread]);
      }
      byThread[j.thread].jobs.push(j);
    });
    let curX = 0, curY = 0;
    groups.forEach(g => {
      const remaining = g.jobs.slice();
      const ordered: Job[] = [];
      while (remaining.length) {
        let bi = 0, brev = false, bd = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const sp = remaining[i].subpaths;
          const st = sp[0][0], en = sp[sp.length - 1][sp[sp.length - 1].length - 1];
          const dS = (st[0] - curX) ** 2 + (st[1] - curY) ** 2;
          const dE = (en[0] - curX) ** 2 + (en[1] - curY) ** 2;
          if (dS < bd) { bd = dS; bi = i; brev = false; }
          if (dE < bd) { bd = dE; bi = i; brev = true; }
        }
        let chosen = remaining.splice(bi, 1)[0];
        if (brev && allowReverse && !chosen.proc && chosen.subpaths.length === 1) {
          chosen = { thread: chosen.thread, subpaths: [chosen.subpaths[0].slice().reverse()] };
        }
        ordered.push(chosen);
        const lastSub = chosen.subpaths[chosen.subpaths.length - 1];
        curX = lastSub[lastSub.length - 1][0];
        curY = lastSub[lastSub.length - 1][1];
      }
      g.jobs = ordered;
    });
    return groups;
  }

  const fillGroups = groupJobs(fillJobs, false);
  const strokeGroups = groupJobs(strokeJobs, true);

  function fmt(v: number): string {
    const r = Math.round(v * 100) / 100;
    if (Object.is(r, -0)) return '0';
    return String(r);
  }

  function traceSubpath(pts: Point[], indent: string): string[] {
    const lines: string[] = [];
    const sim = {
      x: Math.round(pts[0][0] * 100) / 100,
      y: Math.round(pts[0][1] * 100) / 100,
      h: 0,
    };
    lines.push(`${indent}up setxy ${fmt(sim.x)} ${fmt(sim.y)} down`);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - sim.x, dy = pts[i][1] - sim.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.005) continue;
      const ht = Math.atan2(dx, dy) * 180 / Math.PI;
      let turn = ht - sim.h;
      while (turn > 180) turn -= 360;
      while (turn <= -180) turn += 360;
      turn = Math.round(turn * 100) / 100;
      const distR = Math.round(dist * 100) / 100;
      if (distR < 0.01) continue;
      const parts: string[] = [];
      if (i === 1) {
        const hr = Math.round(ht * 100) / 100;
        parts.push(`seth ${fmt(hr)}`);
        sim.h = hr;
      } else if (Math.abs(turn) >= 0.005) {
        parts.push(`${turn >= 0 ? 'rt' : 'lt'} ${fmt(Math.abs(turn))}`);
        sim.h += turn;
        while (sim.h > 180) sim.h -= 360;
        while (sim.h <= -180) sim.h += 360;
      }
      parts.push(`fd ${fmt(distR)}`);
      const hRad = sim.h * Math.PI / 180;
      sim.x += Math.sin(hRad) * distR;
      sim.y += Math.cos(hRad) * distR;
      lines.push(indent + parts.join(' '));
    }
    return lines;
  }

  function traceJob(job: Job, indent: string): string[] {
    const lines: string[] = [];
    job.subpaths.forEach(pl => lines.push(...traceSubpath(pl, indent)));
    return lines;
  }

  const lines: string[] = [];
  lines.push(`; imported from ${name}`);
  lines.push(
    `; ${fillJobs.length} fill${fillJobs.length === 1 ? '' : 's'}, ` +
    `${strokeJobs.length} outline${strokeJobs.length === 1 ? '' : 's'}, ` +
    `fit to ${fitMM} mm, simplified to ${tol} mm`,
  );
  lines.push('stitchlen 2.5');

  procs.forEach(pr => {
    lines.push('', `to ${pr.name}`);
    lines.push(...traceJob({ thread: 0, subpaths: pr.subpaths }, '  '));
    lines.push('end');
  });

  const multiColor =
    fillGroups.length + strokeGroups.length > 1 ||
    (fillGroups[0] || strokeGroups[0]).thread !== 0;
  let emittedColor: number | null = null;

  function emitColor(th: number) {
    if ((multiColor || th !== 0) && emittedColor !== th) {
      lines.push('', `color ${th}`);
      emittedColor = th;
    }
  }

  if (fillGroups.length) {
    lines.push('', '; --- fills (sewn first, outlines go on top) ---');
    lines.push('fillangle 45');
  }
  fillGroups.forEach(g => {
    emitColor(g.thread);
    g.jobs.forEach(job => {
      lines.push('', 'beginfill');
      if (job.proc) lines.push(`  ${job.proc}`);
      else lines.push(...traceJob(job, '  '));
      lines.push('endfill');
    });
  });
  if (strokeGroups.length && fillGroups.length) lines.push('', '; --- outlines ---');
  strokeGroups.forEach(g => {
    emitColor(g.thread);
    g.jobs.forEach(job => {
      if (job.proc) lines.push('', job.proc);
      else { lines.push(''); lines.push(...traceJob(job, '')); }
    });
  });

  return {
    code: lines.join('\n'),
    report: {
      fills: fillJobs.length,
      outlines: strokeJobs.length,
      colors: fillGroups.length + strokeGroups.length,
      pointsRaw: totalRaw,
      segments: segs,
      tolerance: tol,
      fitMM,
    },
  };
}

// ---------- DOM layer: SVG text -> code ----------

export function svgToCode(svgText: string, opts: ConvertOptions = {}): ConvertResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const pe = doc.querySelector('parseerror, parsererror');
  if (pe) throw new Error(`Not valid SVG: ${pe.textContent?.split('\n')[0].slice(0, 120)}`);
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg')
    throw new Error('No <svg> root element found.');

  const SKIP = new Set([
    'defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'style',
    'metadata', 'title', 'desc', 'script', 'lineargradient', 'radialgradient',
    'filter',
  ]);
  const GROUPS = new Set(['svg', 'g', 'a', 'switch']);
  const shapes: Shape[] = [];
  const ignored: Record<string, number> = {};

  function styleProp(el: Element, prop: string): string | null {
    const st = el.getAttribute('style');
    if (st) {
      const m = st.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
      if (m) return m[1];
    }
    return el.getAttribute(prop);
  }
  function rgbToHex(rgb: number[]): string {
    return '#' + rgb.map(v => ('0' + Math.min(255, Math.max(0, v)).toString(16)).slice(-2)).join('');
  }
  function resolvePaint(el: Element, prop: string, inherited: string | null): string | null {
    const v = parseColorStr(styleProp(el, prop));
    if (v === undefined) return inherited;
    return v === null ? null : rgbToHex(v as number[]);
  }

  interface Paint { stroke: string | null; fill: string | null }

  function walk(el: Element, mat: Matrix, paint: Paint) {
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    let m = mat;
    const tr = el.getAttribute('transform');
    if (tr) m = matMul(mat, parseTransform(tr));
    const p2: Paint = {
      stroke: resolvePaint(el, 'stroke', paint.stroke),
      fill: resolvePaint(el, 'fill', paint.fill),
    };
    if (GROUPS.has(tag)) {
      for (let i = 0; i < el.children.length; i++) walk(el.children[i], m, p2);
      return;
    }
    const polys = shapeToPolylines(tag, a => el.getAttribute(a));
    if (polys === null) { ignored[tag] = (ignored[tag] || 0) + 1; return; }
    const fill = tag === 'line' ? null : p2.fill;
    if (fill === null && p2.stroke === null) {
      const key = 'invisible (fill:none, stroke:none)';
      ignored[key] = (ignored[key] || 0) + 1;
      return;
    }
    const subs = polys
      .filter(pts => pts.length >= 2)
      .map(pts => pts.map(p => matApply(m, p)));
    if (subs.length) shapes.push({ subpaths: subs, fill, stroke: p2.stroke });
  }

  walk(root, [1, 0, 0, 1, 0, 0], { stroke: null, fill: '#000000' });

  const result = convertShapes(shapes, opts);
  result.report.ignored = ignored;
  return result;
}
