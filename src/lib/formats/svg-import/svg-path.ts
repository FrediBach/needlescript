// ============================================================
// Low-level SVG geometry helpers shared by the quick importer and the
// staging parser: path "d" flattening, basic-shape → polylines, affine
// transforms, and RDP simplification. Pure number-crunching, no DOM.
// ============================================================

export type Point = [number, number];
export type Matrix = [number, number, number, number, number, number]; // SVG 2×3 affine
export type CurveAnchor = [Point, Point, Point];
export interface SvgCurveSpec {
  anchors: CurveAnchor[];
  closed: boolean;
}

/** Parse SVG path data into cubic anchors without flattening. */
export function pathToCurveSpecs(d: string): SvgCurveSpec[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let previousCubic: Point | null = null;
  let previousQuad: Point | null = null;
  let active: SvgCurveSpec | null = null;
  const specs: SvgCurveSpec[] = [];
  const number = () => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error('path data ended mid-command');
    return value;
  };
  const endpoint = (a: number, b: number, relative: boolean): Point =>
    relative ? [x + a, y + b] : [a, b];
  const start = (point: Point) => {
    if (active && active.anchors.length >= 2) specs.push(active);
    active = {
      anchors: [
        [
          [point[0], point[1]],
          [0, 0],
          [0, 0],
        ],
      ],
      closed: false,
    };
    x = startX = point[0];
    y = startY = point[1];
  };
  const cubic = (c1: Point, c2: Point, end: Point, closing = false) => {
    if (!active) start([x, y]);
    const current = active!.anchors[active!.anchors.length - 1];
    current[2] = [c1[0] - x, c1[1] - y];
    if (closing) {
      active!.anchors[0][1] = [c2[0] - end[0], c2[1] - end[1]];
      active!.closed = true;
    } else {
      active!.anchors.push([
        [end[0], end[1]],
        [c2[0] - end[0], c2[1] - end[1]],
        [0, 0],
      ]);
    }
    x = end[0];
    y = end[1];
    previousCubic = [c2[0], c2[1]];
  };
  const line = (end: Point, closing = false) => cubic([x, y], end, end, closing);
  const quadratic = (control: Point, end: Point) => {
    cubic(
      [x + (2 / 3) * (control[0] - x), y + (2 / 3) * (control[1] - y)],
      [end[0] + (2 / 3) * (control[0] - end[0]), end[1] + (2 / 3) * (control[1] - end[1])],
      end,
    );
    previousQuad = control;
  };
  const arc = (
    rxValue: number,
    ryValue: number,
    rotation: number,
    largeArc: boolean,
    sweep: boolean,
    end: Point,
  ) => {
    let rx = Math.abs(rxValue);
    let ry = Math.abs(ryValue);
    if (rx === 0 || ry === 0 || (Math.abs(end[0] - x) < 1e-12 && Math.abs(end[1] - y) < 1e-12)) {
      line(end);
      return;
    }
    const phi = (rotation * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (x - end[0]) / 2;
    const dy = (y - end[1]) / 2;
    const xp = cosPhi * dx + sinPhi * dy;
    const yp = -sinPhi * dx + cosPhi * dy;
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lambda > 1) {
      const factor = Math.sqrt(lambda);
      rx *= factor;
      ry *= factor;
    }
    const numerator = Math.max(
      0,
      (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) /
        (rx * rx * yp * yp + ry * ry * xp * xp),
    );
    const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(numerator);
    const cxp = (factor * rx * yp) / ry;
    const cyp = (-factor * ry * xp) / rx;
    const cx = cosPhi * cxp - sinPhi * cyp + (x + end[0]) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y + end[1]) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) =>
      Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const theta0 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && delta > 0) delta -= Math.PI * 2;
    if (sweep && delta < 0) delta += Math.PI * 2;
    const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    const part = delta / count;
    const pointAt = (theta: number): Point => [
      cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
      cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
    ];
    const derivative = (theta: number): Point => [
      -rx * Math.sin(theta) * cosPhi - ry * Math.cos(theta) * sinPhi,
      -rx * Math.sin(theta) * sinPhi + ry * Math.cos(theta) * cosPhi,
    ];
    for (let partIndex = 0; partIndex < count; partIndex++) {
      const a0 = theta0 + part * partIndex;
      const a1 = a0 + part;
      const p0 = pointAt(a0);
      const p1 = partIndex === count - 1 ? end : pointAt(a1);
      const d0 = derivative(a0);
      const d1 = derivative(a1);
      const alpha = (4 / 3) * Math.tan(part / 4);
      cubic(
        [p0[0] + alpha * d0[0], p0[1] + alpha * d0[1]],
        [p1[0] - alpha * d1[0], p1[1] - alpha * d1[1]],
        p1,
      );
    }
  };

  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) throw new Error('path data must start with M');
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === 'M') {
      start(endpoint(number(), number(), relative));
      command = relative ? 'l' : 'L';
    } else if (upper === 'L') line(endpoint(number(), number(), relative));
    else if (upper === 'H') line([relative ? x + number() : number(), y]);
    else if (upper === 'V') line([x, relative ? y + number() : number()]);
    else if (upper === 'C') {
      const c1 = endpoint(number(), number(), relative);
      const c2 = endpoint(number(), number(), relative);
      cubic(c1, c2, endpoint(number(), number(), relative));
    } else if (upper === 'S') {
      const c1: Point = previousCubic
        ? [2 * x - previousCubic[0], 2 * y - previousCubic[1]]
        : [x, y];
      const c2 = endpoint(number(), number(), relative);
      cubic(c1, c2, endpoint(number(), number(), relative));
    } else if (upper === 'Q') {
      const control = endpoint(number(), number(), relative);
      quadratic(control, endpoint(number(), number(), relative));
    } else if (upper === 'T') {
      const control: Point = previousQuad
        ? [2 * x - previousQuad[0], 2 * y - previousQuad[1]]
        : [x, y];
      quadratic(control, endpoint(number(), number(), relative));
    } else if (upper === 'A') {
      const rx = number();
      const ry = number();
      const rotation = number();
      const large = number() !== 0;
      const sweep = number() !== 0;
      arc(rx, ry, rotation, large, sweep, endpoint(number(), number(), relative));
    } else if (upper === 'Z') {
      const closingSpec = active as SvgCurveSpec | null;
      if (closingSpec && (Math.abs(x - startX) > 1e-12 || Math.abs(y - startY) > 1e-12))
        line([startX, startY], true);
      else if (closingSpec) closingSpec.closed = true;
      command = '';
    } else throw new Error(`unsupported path command "${command}"`);
    if (upper !== 'C' && upper !== 'S') previousCubic = null;
    if (upper !== 'Q' && upper !== 'T') previousQuad = null;
  }
  const finalSpec = active as SvgCurveSpec | null;
  if (finalSpec && finalSpec.anchors.length >= 2) specs.push(finalSpec);
  return specs;
}

// ---------- path "d" parser ----------

function parsePathD(d: string, minSeg = 8, maxSeg = 72): Point[][] {
  const tokenMatch = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokenMatch) return [];
  const tokens: string[] = tokenMatch;

  let i = 0;
  function num(): number {
    if (i >= tokens.length) throw new Error('path data ended mid-command');
    const v = parseFloat(tokens[i++]);
    if (isNaN(v)) throw new Error(`expected a number in path data, got "${tokens[i - 1]}"`);
    return v;
  }
  function flag(): boolean {
    return num() !== 0;
  }

  const subpaths: Point[][] = [];
  let pts: Point[] | null = null;
  let x = 0,
    y = 0;
  let sx = 0,
    sy = 0;
  let px_: number | null = null,
    py_: number | null = null;
  let qx: number | null = null,
    qy: number | null = null;
  let cmd: string | null = null;

  function start(nx: number, ny: number) {
    if (pts && pts.length >= 2) subpaths.push(pts);
    pts = [[nx, ny]];
    x = sx = nx;
    y = sy = ny;
  }
  function lineTo(nx: number, ny: number) {
    if (!pts) start(0, 0);
    pts!.push([nx, ny]);
    x = nx;
    y = ny;
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
    const x0 = x,
      y0 = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n,
        u = 1 - t;
      const a = u * u * u,
        b = 3 * u * u * t,
        c2 = 3 * u * t * t,
        dd = t * t * t;
      lineTo(a * x0 + b * c1x + c2 * c2x + dd * ex, a * y0 + b * c1y + c2 * c2y + dd * ey);
    }
    px_ = c2x;
    py_ = c2y;
  }
  function quadTo(cx2: number, cy2: number, ex: number, ey: number) {
    const L = Math.hypot(cx2 - x, cy2 - y) + Math.hypot(ex - cx2, ey - cy2);
    const n = segCount(L);
    const x0 = x,
      y0 = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n,
        u = 1 - t;
      lineTo(u * u * x0 + 2 * u * t * cx2 + t * t * ex, u * u * y0 + 2 * u * t * cy2 + t * t * ey);
    }
    qx = cx2;
    qy = cy2;
  }
  function arcTo(
    rx: number,
    ry: number,
    rotDeg: number,
    largeArc: boolean,
    sweep: boolean,
    ex: number,
    ey: number,
  ) {
    if (rx === 0 || ry === 0) {
      lineTo(ex, ey);
      return;
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (rotDeg * Math.PI) / 180;
    const cosP = Math.cos(phi),
      sinP = Math.sin(phi);
    const dx2 = (x - ex) / 2,
      dy2 = (y - ey) / 2;
    const x1 = cosP * dx2 + sinP * dy2,
      y1 = -sinP * dx2 + cosP * dy2;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) {
      const s = Math.sqrt(lam);
      rx *= s;
      ry *= s;
    }
    const sign = largeArc !== sweep ? 1 : -1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const rad = Math.max(0, (rx * rx * ry * ry - den) / den);
    const co = sign * Math.sqrt(rad);
    const cxp = (co * rx * y1) / ry,
      cyp = (-co * ry * x1) / rx;
    const cxc = cosP * cxp - sinP * cyp + (x + ex) / 2;
    const cyc = sinP * cxp + cosP * cyp + (y + ey) / 2;
    function ang(ux: number, uy: number, vx: number, vy: number) {
      const dot = ux * vx + uy * vy;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      const a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      return ux * vy - uy * vx < 0 ? -a : a;
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
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
    }
    if (cmd === null) throw new Error('path data must start with M');
    const rel: boolean = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case 'M': {
        const nx = num(),
          ny = num();
        start(rel ? x + nx : nx, rel ? y + ny : ny);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const lx = num(),
          ly = num();
        lineTo(rel ? x + lx : lx, rel ? y + ly : ly);
        break;
      }
      case 'H': {
        const hx = num();
        lineTo(rel ? x + hx : hx, y);
        break;
      }
      case 'V': {
        const vy = num();
        lineTo(x, rel ? y + vy : vy);
        break;
      }
      case 'C': {
        const a1 = num(),
          a2 = num(),
          a3 = num(),
          a4 = num(),
          a5 = num(),
          a6 = num();
        cubicTo(
          rel ? x + a1 : a1,
          rel ? y + a2 : a2,
          rel ? x + a3 : a3,
          rel ? y + a4 : a4,
          rel ? x + a5 : a5,
          rel ? y + a6 : a6,
        );
        break;
      }
      case 'S': {
        const s3 = num(),
          s4 = num(),
          s5 = num(),
          s6 = num();
        const r1 = px_ !== null ? 2 * x - px_ : x;
        const r2 = py_ !== null ? 2 * y - py_ : y;
        cubicTo(r1, r2, rel ? x + s3 : s3, rel ? y + s4 : s4, rel ? x + s5 : s5, rel ? y + s6 : s6);
        break;
      }
      case 'Q': {
        const q1 = num(),
          q2 = num(),
          q3 = num(),
          q4 = num();
        quadTo(rel ? x + q1 : q1, rel ? y + q2 : q2, rel ? x + q3 : q3, rel ? y + q4 : q4);
        break;
      }
      case 'T': {
        const t3 = num(),
          t4 = num();
        const rq1 = qx !== null ? 2 * x - qx : x;
        const rq2 = qy !== null ? 2 * y - qy : y;
        quadTo(rq1, rq2, rel ? x + t3 : t3, rel ? y + t4 : t4);
        break;
      }
      case 'A': {
        const rx2 = num(),
          ry2 = num(),
          rot = num(),
          laf = flag(),
          swf = flag(),
          ax = num(),
          ay = num();
        arcTo(rx2, ry2, rot, laf, swf, rel ? x + ax : ax, rel ? y + ay : ay);
        break;
      }
      case 'Z': {
        const ptsZ = pts as Point[] | null;
        if (ptsZ !== null && ptsZ.length) lineTo(sx, sy);
        break;
      }
      default:
        throw new Error(`unsupported path command "${cmd}"`);
    }
    if (C !== 'S' && C !== 'C') {
      px_ = null;
      py_ = null;
    }
    if (C !== 'Q' && C !== 'T') {
      qx = null;
      qy = null;
    }
  }
  const ptsEnd = pts as Point[] | null;
  if (ptsEnd !== null && ptsEnd.length >= 2) subpaths.push(ptsEnd);
  return subpaths;
}

// ---------- basic shapes -> polylines ----------

export function shapeToPolylines(
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
    case 'path': {
      const d = attr('d');
      return d ? parsePathD(d) : [];
    }
    case 'rect': {
      const rx0 = n('x', 0),
        ry0 = n('y', 0),
        w = n('width', 0),
        h = n('height', 0);
      if (w <= 0 || h <= 0) return [];
      return [
        [
          [rx0, ry0],
          [rx0 + w, ry0],
          [rx0 + w, ry0 + h],
          [rx0, ry0 + h],
          [rx0, ry0],
        ],
      ];
    }
    case 'circle': {
      const r = n('r', 0);
      if (r <= 0) return [];
      return [ringPoints(n('cx', 0), n('cy', 0), r, r, 64)];
    }
    case 'ellipse': {
      const erx = n('rx', 0),
        ery = n('ry', 0);
      if (erx <= 0 || ery <= 0) return [];
      return [ringPoints(n('cx', 0), n('cy', 0), erx, ery, 64)];
    }
    case 'line':
      return [
        [
          [n('x1', 0), n('y1', 0)],
          [n('x2', 0), n('y2', 0)],
        ],
      ];
    case 'polyline':
    case 'polygon': {
      const raw = (attr('points') || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
      if (!raw || raw.length < 4) return [];
      const p: Point[] = [];
      for (let k = 0; k + 1 < raw.length; k += 2)
        p.push([parseFloat(raw[k]), parseFloat(raw[k + 1])]);
      if (tag === 'polygon') p.push([p[0][0], p[0][1]]);
      return [p];
    }
    default:
      return null;
  }
}

// ---------- transforms ----------

export function matMul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function matApply(m: Matrix, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** Approximate uniform scale factor of an affine matrix (for stroke-width). */
export function matScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function parseTransform(str: string): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(str)) !== null) {
    const args = (mm[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(parseFloat);
    let t: Matrix | null = null;
    switch (mm[1]) {
      case 'matrix':
        if (args.length === 6) t = args as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] || 0, args.length > 1 ? args[1] : 0];
        break;
      case 'scale':
        t = [args[0] || 1, 0, 0, args.length > 1 ? args[1] : args[0] || 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        const rot: Matrix = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (args.length > 2) {
          t = matMul(matMul([1, 0, 0, 1, args[1], args[2]], rot), [1, 0, 0, 1, -args[1], -args[2]]);
        } else t = rot;
        break;
      }
      case 'skewX': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        t = [1, 0, Math.tan(a), 1, 0, 0];
        break;
      }
      case 'skewY': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        t = [1, Math.tan(a), 0, 1, 0, 0];
        break;
      }
    }
    if (t) m = matMul(m, t);
  }
  return m;
}

// ---------- RDP simplification ----------

export function simplifyRDP(pts: Point[], tol: number): Point[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop()!;
    const [a, b] = seg;
    const ax = pts[a][0],
      ay = pts[a][1],
      bx = pts[b][0],
      by = pts[b][1];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1,
      maxI = -1;
    for (let i = a + 1; i < b; i++) {
      let d: number;
      if (len2 === 0) {
        d = (pts[i][0] - ax) ** 2 + (pts[i][1] - ay) ** 2;
      } else {
        const cr = (pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx;
        d = (cr * cr) / len2;
      }
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > t2) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  const out: Point[] = [];
  for (let k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
  return out;
}
