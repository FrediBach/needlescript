// ============================================================
// SVG importer for NeedleScript.
// Converts SVG elements to NeedleScript source code.
// Supported: <path> (M L H V C S Q T A Z), <rect>, <circle>,
// <ellipse>, <line>, <polyline>, <polygon>, <g>, transforms.
// No external dependencies.
// ============================================================

import {
  shapeToPolylines,
  matMul,
  matApply,
  parseTransform,
  simplifyRDP,
  type Point,
  type Matrix,
} from './svg/svg-path.ts';
import { parseColorStr, rgbToHex, nearestThread } from './svg/thread-map.ts';

// ---------- Shape with paint ----------

interface Shape {
  subpaths: Point[][];
  fill: string | null; // '#hex' or null (none)
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
  const palette = opts.palette || [
    '#C8472F',
    '#31604F',
    '#3A4E8C',
    '#D9A441',
    '#8C4A6B',
    '#2B2B2B',
    '#5E8F8C',
    '#B8651B',
  ];
  const name = opts.name || 'import';
  const maxSegments = opts.maxSegments || 1400;

  // clean subpaths
  const work: ShapeWithSimp[] = [];
  let totalRaw = 0;
  shapes.forEach((sh) => {
    if (sh.fill === null && sh.stroke === null) return;
    const subs: Point[][] = [];
    (sh.subpaths || []).forEach((pl) => {
      const pts: Point[] = [];
      let last: Point | null = null;
      pl.forEach((p) => {
        if (!isFinite(p[0]) || !isFinite(p[1])) return;
        if (last && Math.abs(p[0] - last[0]) < 1e-9 && Math.abs(p[1] - last[1]) < 1e-9) return;
        pts.push([p[0], p[1]]);
        last = p;
      });
      totalRaw += pts.length;
      if (pts.length >= 2) subs.push(pts);
    });
    if (subs.length) work.push({ subpaths: subs, fill: sh.fill, stroke: sh.stroke, simp: [] });
  });
  if (!work.length)
    throw new Error(
      'No stitchable outlines found in this SVG (paths, shapes and lines are supported).',
    );

  // bounding box
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  work.forEach((sh) =>
    sh.subpaths.forEach((pl) =>
      pl.forEach((p) => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }),
    ),
  );
  const span = Math.max(maxX - minX, maxY - minY);
  if (span < 1e-9) throw new Error('SVG geometry has zero size.');
  const scale = fitMM / span;
  const cxBB = (minX + maxX) / 2,
    cyBB = (minY + maxY) / 2;

  // scale, centre, flip y
  work.forEach((sh) => {
    sh.subpaths = sh.subpaths.map((pl) =>
      pl.map((p) => [(p[0] - cxBB) * scale, -(p[1] - cyBB) * scale] as Point),
    );
  });

  // simplify
  const tolLadder = [0.2, 0.3, 0.45, 0.7, 1.0, 1.5, 2.2];
  let tol = tolLadder[0];
  let segs = 0;
  for (let ti = 0; ti < tolLadder.length; ti++) {
    tol = tolLadder[ti];
    segs = 0;
    work.forEach((sh) => {
      sh.simp = sh.subpaths.map((pl) => {
        const sp = simplifyRDP(pl, tol);
        segs += Math.max(0, sp.length - 1);
        return sp;
      });
    });
    if (segs <= maxSegments) break;
  }

  function pathLen(pl: Point[]): number {
    let L = 0;
    for (let i = 1; i < pl.length; i++)
      L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
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

  const fillJobs: Job[] = [],
    strokeJobs: Job[] = [];
  const procs: { name: string; subpaths: Point[][] }[] = [];
  let procCount = 0;

  work.forEach((sh) => {
    const usable = sh.simp.filter((pl) => pl.length >= 2 && pathLen(pl) >= 1);
    if (!usable.length) return;
    let fillable: Point[][] | null = null;
    if (sh.fill !== null) {
      fillable = usable.filter((pl) => pl.length >= (isClosed(pl) ? 4 : 3) && pathLen(pl) >= 3);
      if (!fillable.length) fillable = null;
    }
    const wantStroke = sh.stroke !== null;
    if (fillable && wantStroke) {
      const pname = `shape_${++procCount}`;
      procs.push({ name: pname, subpaths: fillable });
      fillJobs.push({ thread: threadOf(sh.fill), proc: pname, subpaths: fillable });
      strokeJobs.push({ thread: threadOf(sh.stroke), proc: pname, subpaths: fillable });
      usable.forEach((pl) => {
        if (!fillable!.includes(pl))
          strokeJobs.push({ thread: threadOf(sh.stroke), subpaths: [pl] });
      });
    } else if (fillable) {
      fillJobs.push({ thread: threadOf(sh.fill), subpaths: fillable });
    } else if (wantStroke) {
      usable.forEach((pl) => strokeJobs.push({ thread: threadOf(sh.stroke), subpaths: [pl] }));
    }
  });
  if (!fillJobs.length && !strokeJobs.length)
    throw new Error(
      'All outlines were too small to stitch at this size — try a larger "fit" value.',
    );

  interface Group {
    thread: number;
    jobs: Job[];
  }

  function groupJobs(jobs: Job[], allowReverse: boolean): Group[] {
    const groups: Group[] = [];
    const byThread: Record<number, Group> = {};
    jobs.forEach((j) => {
      if (!(j.thread in byThread)) {
        byThread[j.thread] = { thread: j.thread, jobs: [] };
        groups.push(byThread[j.thread]);
      }
      byThread[j.thread].jobs.push(j);
    });
    let curX = 0,
      curY = 0;
    groups.forEach((g) => {
      const remaining = g.jobs.slice();
      const ordered: Job[] = [];
      while (remaining.length) {
        let bi = 0,
          brev = false,
          bd = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const sp = remaining[i].subpaths;
          const st = sp[0][0],
            en = sp[sp.length - 1][sp[sp.length - 1].length - 1];
          const dS = (st[0] - curX) ** 2 + (st[1] - curY) ** 2;
          const dE = (en[0] - curX) ** 2 + (en[1] - curY) ** 2;
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
    lines.push(`${indent}up setxy(${fmt(sim.x)}, ${fmt(sim.y)}) down`);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - sim.x,
        dy = pts[i][1] - sim.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.005) continue;
      const ht = (Math.atan2(dx, dy) * 180) / Math.PI;
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
      const hRad = (sim.h * Math.PI) / 180;
      sim.x += Math.sin(hRad) * distR;
      sim.y += Math.cos(hRad) * distR;
      lines.push(indent + parts.join(' '));
    }
    return lines;
  }

  function traceJob(job: Job, indent: string): string[] {
    const lines: string[] = [];
    job.subpaths.forEach((pl) => lines.push(...traceSubpath(pl, indent)));
    return lines;
  }

  const lines: string[] = [];
  lines.push(`// imported from ${name}`);
  lines.push(
    `// ${fillJobs.length} fill${fillJobs.length === 1 ? '' : 's'}, ` +
      `${strokeJobs.length} outline${strokeJobs.length === 1 ? '' : 's'}, ` +
      `fit to ${fitMM} mm, simplified to ${tol} mm`,
  );
  lines.push('stitchlen 2.5');

  procs.forEach((pr) => {
    lines.push('', `def ${pr.name}() [`);
    lines.push(...traceJob({ thread: 0, subpaths: pr.subpaths }, '  '));
    lines.push(']');
  });

  const multiColor =
    fillGroups.length + strokeGroups.length > 1 || (fillGroups[0] || strokeGroups[0]).thread !== 0;
  let emittedColor: number | null = null;

  function emitColor(th: number) {
    if ((multiColor || th !== 0) && emittedColor !== th) {
      lines.push('', `color ${th}`);
      emittedColor = th;
    }
  }

  if (fillGroups.length) {
    lines.push('', '// --- fills (sewn first, outlines go on top) ---');
    lines.push('fillangle 45');
  }
  fillGroups.forEach((g) => {
    emitColor(g.thread);
    g.jobs.forEach((job) => {
      lines.push('', 'beginfill');
      if (job.proc) lines.push(`  ${job.proc}()`);
      else lines.push(...traceJob(job, '  '));
      lines.push('endfill');
    });
  });
  if (strokeGroups.length && fillGroups.length) lines.push('', '// --- outlines ---');
  strokeGroups.forEach((g) => {
    emitColor(g.thread);
    g.jobs.forEach((job) => {
      if (job.proc) lines.push('', `${job.proc}()`);
      else {
        lines.push('');
        lines.push(...traceJob(job, ''));
      }
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
    'defs',
    'symbol',
    'clippath',
    'mask',
    'marker',
    'pattern',
    'style',
    'metadata',
    'title',
    'desc',
    'script',
    'lineargradient',
    'radialgradient',
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
  function resolvePaint(el: Element, prop: string, inherited: string | null): string | null {
    const v = parseColorStr(styleProp(el, prop));
    if (v === undefined) return inherited;
    return v === null ? null : rgbToHex(v as number[]);
  }

  interface Paint {
    stroke: string | null;
    fill: string | null;
  }

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
    const polys = shapeToPolylines(tag, (a) => el.getAttribute(a));
    if (polys === null) {
      ignored[tag] = (ignored[tag] || 0) + 1;
      return;
    }
    const fill = tag === 'line' ? null : p2.fill;
    if (fill === null && p2.stroke === null) {
      const key = 'invisible (fill:none, stroke:none)';
      ignored[key] = (ignored[key] || 0) + 1;
      return;
    }
    const subs = polys.flatMap((pts) => (pts.length >= 2 ? [pts.map((p) => matApply(m, p))] : []));
    if (subs.length) shapes.push({ subpaths: subs, fill, stroke: p2.stroke });
  }

  walk(root, [1, 0, 0, 1, 0, 0], { stroke: null, fill: '#000000' });

  const result = convertShapes(shapes, opts);
  result.report.ignored = ignored;
  return result;
}
