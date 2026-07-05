import type { ComponentType } from 'react';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ChapterMeta {
  title: string;
  part: string;
  partNumber: number;
  order: number;
  subtitle?: string;
}

export interface Chapter {
  /** URL segment — also used as the localStorage progress key. */
  id: string;
  title: string;
  subtitle?: string;
  part: string;
  partNumber: number;
  /** 1-based position within the book (used for prev/next navigation). */
  order: number;
  /** Lazy import of the MDX module. */
  load: () => Promise<{ default: ComponentType; meta: ChapterMeta }>;
}

export interface Part {
  number: number;
  title: string;
  chapters: Chapter[];
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const CHAPTERS: Chapter[] = [
  // ── Part 0 — Start Here ────────────────────────────────────────────────
  {
    id: 'ch-0-1',
    title: "What you'll make",
    subtitle: 'A gallery of the possible',
    part: 'Part 0 — Start Here',
    partNumber: 0,
    order: 1,
    load: () => import('../content/part-0/ch-0-1.mdx'),
  },
  {
    id: 'ch-0-2',
    title: 'How this book works',
    subtitle: 'Running cells, the scrubber, and checkpoints',
    part: 'Part 0 — Start Here',
    partNumber: 0,
    order: 2,
    load: () => import('../content/part-0/ch-0-2.mdx'),
  },
  {
    id: 'ch-0-3',
    title: 'Choose your on-ramp',
    subtitle: 'Programmer, maker, or generative-artist track',
    part: 'Part 0 — Start Here',
    partNumber: 0,
    order: 3,
    load: () => import('../content/part-0/ch-0-3.mdx'),
  },
  {
    id: 'ch-0-4',
    title: 'Thread, needle, fabric',
    subtitle: 'A five-minute physics primer',
    part: 'Part 0 — Start Here',
    partNumber: 0,
    order: 4,
    load: () => import('../content/part-0/ch-0-4.mdx'),
  },
  {
    id: 'ch-0-5',
    title: 'Hello, hoop',
    subtitle: 'Your first six words of NeedleScript',
    part: 'Part 0 — Start Here',
    partNumber: 0,
    order: 5,
    load: () => import('../content/part-0/ch-0-5.mdx'),
  },

  // ── Part I — First Stitches: the Turtle ───────────────────────────────
  {
    id: 'ch-1',
    title: 'The mental model',
    subtitle: 'Millimetres, headings, and how paths become stitches',
    part: 'Part I — First Stitches: the Turtle',
    partNumber: 1,
    order: 1,
    load: () => import('../content/part-1/ch-1.mdx'),
  },
  {
    id: 'ch-2',
    title: 'Moving and sewing',
    subtitle: 'fd, bk, setxy, and the negative-literal trap',
    part: 'Part I — First Stitches: the Turtle',
    partNumber: 1,
    order: 2,
    load: () => import('../content/part-1/ch-2.mdx'),
  },
  {
    id: 'ch-3',
    title: 'Turning and looping',
    subtitle: 'rt, lt, repeat, repcount, and the polygon formula',
    part: 'Part I — First Stitches: the Turtle',
    partNumber: 1,
    order: 3,
    load: () => import('../content/part-1/ch-3.mdx'),
  },
  {
    id: 'ch-4',
    title: 'Pen, jumps, and travel',
    subtitle: 'up/down, moveto, trim, and push/pop',
    part: 'Part I — First Stitches: the Turtle',
    partNumber: 1,
    order: 4,
    load: () => import('../content/part-1/ch-4.mdx'),
  },
  {
    id: 'ch-5',
    title: 'Part I capstone: Constellation',
    subtitle: 'Stars, branches, and your first exported piece',
    part: 'Part I — First Stitches: the Turtle',
    partNumber: 1,
    order: 5,
    load: () => import('../content/part-1/ch-5.mdx'),
  },

  // ── Part II — The Thread Vocabulary ───────────────────────────────────
  {
    id: 'ch-6',
    title: 'Running stitch and stitch length',
    subtitle: 'stitchlen, curve fidelity, and the tiny-stitch warning',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 1,
    load: () => import('../content/part-2/ch-6.mdx'),
  },
  {
    id: 'ch-7',
    title: 'Satin',
    subtitle: 'Columns, width, density, and buffered flushing',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 2,
    load: () => import('../content/part-2/ch-7.mdx'),
  },
  {
    id: 'ch-8',
    title: 'Bean, blanket, and line character',
    subtitle: 'bean, estitch, and choosing your line style',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 3,
    load: () => import('../content/part-2/ch-8.mdx'),
  },
  {
    id: 'ch-9',
    title: 'Colour, stops, and locks',
    subtitle: 'color, stop, lock, and colour economics',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 4,
    load: () => import('../content/part-2/ch-9.mdx'),
  },
  {
    id: 'ch-10',
    title: 'Fills',
    subtitle: 'beginfill/endfill, holes, and the even-odd rule',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 5,
    load: () => import('../content/part-2/ch-10.mdx'),
  },
  {
    id: 'ch-11',
    title: 'Light and direction',
    subtitle: 'Thread gloss, fillangle, and two-tone effects',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 6,
    load: () => import('../content/part-2/ch-11.mdx'),
  },
  {
    id: 'ch-12',
    title: 'Part II capstone: The Badge',
    subtitle: 'Fill, knockout, satin border, two colours',
    part: 'Part II — The Thread Vocabulary',
    partNumber: 2,
    order: 7,
    load: () => import('../content/part-2/ch-12.mdx'),
  },

  // ── Part III — The Language ────────────────────────────────────────────
  {
    id: 'ch-13',
    title: 'Values and expressions',
    subtitle: 'Numbers, operators, precedence, and truth',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 1,
    load: () => import('../content/part-3/ch-13.mdx'),
  },
  {
    id: 'ch-14',
    title: 'Variables and scope: the no-surprises chapter',
    subtitle: 'let, assignment, one scope per procedure',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 2,
    load: () => import('../content/part-3/ch-14.mdx'),
  },
  {
    id: 'ch-15',
    title: 'Control flow in depth',
    subtitle: 'repeat, for, while, break, and continue',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 3,
    load: () => import('../content/part-3/ch-15.mdx'),
  },
  {
    id: 'ch-16',
    title: 'Procedures and reporters',
    subtitle: 'def, return, recursion, and motif APIs',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 4,
    load: () => import('../content/part-3/ch-16.mdx'),
  },
  {
    id: 'ch-17',
    title: 'Two dialects and call syntax',
    subtitle: 'Classic Logo-style vs modern parenthesized calls',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 5,
    load: () => import('../content/part-3/ch-17.mdx'),
  },
  {
    id: 'ch-18',
    title: 'Lists',
    subtitle: 'Literals, reference semantics, and the full toolkit',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 6,
    load: () => import('../content/part-3/ch-18.mdx'),
  },
  {
    id: 'ch-19',
    title: 'Strings',
    subtitle: 'Immutable sequences, the function set, and mode words',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 7,
    load: () => import('../content/part-3/ch-19.mdx'),
  },
  {
    id: 'ch-20',
    title: 'Higher-order programming',
    subtitle: '@name references, map, filter, reduce, and compose',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 8,
    load: () => import('../content/part-3/ch-20.mdx'),
  },
  {
    id: 'ch-21',
    title: 'Debugging like a digitizer',
    subtitle: 'print, mark, assert, the scrubber, and the warning taxonomy',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 9,
    load: () => import('../content/part-3/ch-21.mdx'),
  },
  {
    id: 'ch-22',
    title: 'Part III capstone: The Parametric Mandala Kit',
    subtitle: 'Three motif procedures, four sliders, one composition',
    part: 'Part III — The Language',
    partNumber: 3,
    order: 10,
    load: () => import('../content/part-3/ch-22.mdx'),
  },

  // ── Part IV — Randomness and Generative Math ───────────────────────────
  {
    id: 'ch-23',
    title: 'Seeded randomness and the determinism contract',
    subtitle: 'seed, random, gauss, pick, shuffle, and draw costs',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 1,
    load: () => import('../content/part-4/ch-23.mdx'),
  },
  {
    id: 'ch-24',
    title: 'Noise fields',
    subtitle: 'snoise2/3, fbm2, flow fields, and organic variation',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 2,
    load: () => import('../content/part-4/ch-24.mdx'),
  },
  {
    id: 'ch-25',
    title: 'The shaping toolkit',
    subtitle: 'lerp, remap, clamp, smoothstep, and trig modulation',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 3,
    load: () => import('../content/part-4/ch-25.mdx'),
  },
  {
    id: 'ch-26',
    title: 'Vectors',
    subtitle: 'vadd, vnorm, vfromheading, and polar geometry',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 4,
    load: () => import('../content/part-4/ch-26.mdx'),
  },
  {
    id: 'ch-27',
    title: 'Segments and proximity',
    subtitle: 'segisect, segdist, nearestonpath, and self-avoiding walkers',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 5,
    load: () => import('../content/part-4/ch-27.mdx'),
  },
  {
    id: 'ch-28',
    title: 'Part IV capstone: The Wander Study',
    subtitle: 'Flow fields in thread — from blank cell to sewable output',
    part: 'Part IV — Randomness and Generative Math',
    partNumber: 4,
    order: 6,
    load: () => import('../content/part-4/ch-28.mdx'),
  },

  // ── Part V — Paths, Curves, and the Data Bridge ────────────────────────
  {
    id: 'ch-29',
    title: 'Paths as data',
    subtitle: 'pathlen, centroid, bbox, resample, and sewpath',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 1,
    load: () => import('../content/part-5/ch-29.mdx'),
  },
  {
    id: 'ch-30',
    title: 'Trace: drawing becomes data',
    subtitle: 'trace, tracerings, the sandbox, and Pitfall D6',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 2,
    load: () => import('../content/part-5/ch-30.mdx'),
  },
  {
    id: 'ch-31',
    title: 'Curves and smoothing',
    subtitle: 'chaikin, catmull, bezier, and resampling discipline',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 3,
    load: () => import('../content/part-5/ch-31.mdx'),
  },
  {
    id: 'ch-32',
    title: 'Transforms',
    subtitle: 'translate, rotate, mirror, scale, and data twins',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 4,
    load: () => import('../content/part-5/ch-32.mdx'),
  },
  {
    id: 'ch-33',
    title: 'Effects: warp, humanize, snaptogrid',
    subtitle: 'Your first shader, coherent jitter, and lattice alignment',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 5,
    load: () => import('../content/part-5/ch-33.mdx'),
  },
  {
    id: 'ch-34',
    title: 'Part V capstone: The Cross-Stitch Portrait',
    subtitle: 'trace → resample → snaptogrid → palette by region',
    part: 'Part V — Paths, Curves, and the Data Bridge',
    partNumber: 5,
    order: 6,
    load: () => import('../content/part-5/ch-34.mdx'),
  },

  // ── Part VI — Computational Geometry ──────────────────────────────────
  {
    id: 'ch-35',
    title: 'Point generators',
    subtitle: 'scatter, relax, Poisson-disc, and density budgets',
    part: 'Part VI — Computational Geometry',
    partNumber: 6,
    order: 1,
    load: () => import('../content/part-6/ch-35.mdx'),
  },
  {
    id: 'ch-36',
    title: 'Tessellations: Voronoi, Delaunay, hull',
    subtitle: 'voronoi, triangulate, hull, inpath, and travel order',
    part: 'Part VI — Computational Geometry',
    partNumber: 6,
    order: 2,
    load: () => import('../content/part-6/ch-36.mdx'),
  },
  {
    id: 'ch-37',
    title: 'Offsets and booleans',
    subtitle: 'offsetpath, clippaths, and parity vs union',
    part: 'Part VI — Computational Geometry',
    partNumber: 6,
    order: 3,
    load: () => import('../content/part-6/ch-37.mdx'),
  },
  {
    id: 'ch-38',
    title: 'Part VI capstone: Shatter, rebuilt',
    subtitle: 'The full generative-geometry pipeline from scratch',
    part: 'Part VI — Computational Geometry',
    partNumber: 6,
    order: 4,
    load: () => import('../content/part-6/ch-38.mdx'),
  },
  {
    id: 'ch-39',
    title: 'Interlude: performance and budgets',
    subtitle: 'Op counter, stitch cap, and reading stats as a profiler',
    part: 'Part VI — Computational Geometry',
    partNumber: 6,
    order: 5,
    load: () => import('../content/part-6/ch-39.mdx'),
  },

  // ── Part VII — Fabric Physics and the Professional Layer ───────────────
  {
    id: 'ch-40',
    title: "Why geometry isn't enough",
    subtitle: 'Pull, sink, crowding, coverage layers, and the heatmap',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 1,
    load: () => import('../content/part-7/ch-40.mdx'),
  },
  {
    id: 'ch-41',
    title: 'Fabric presets',
    subtitle: 'woven, knit, stretch, denim, fleece — and when to use each',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 2,
    load: () => import('../content/part-7/ch-41.mdx'),
  },
  {
    id: 'ch-42',
    title: 'Pull compensation and underlay',
    subtitle: 'pullcomp, underlay modes, fillunderlay, and machine order',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 3,
    load: () => import('../content/part-7/ch-42.mdx'),
  },
  {
    id: 'ch-43',
    title: 'Curves, density, and trims at machine level',
    subtitle: 'shortstitch, maxdensity, autotrim, and needle hygiene',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 4,
    load: () => import('../content/part-7/ch-43.mdx'),
  },
  {
    id: 'ch-44',
    title: 'Programmable satin',
    subtitle: 'The generator contract: (t, s, i, u) → column tuple',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 5,
    load: () => import('../content/part-7/ch-44.mdx'),
  },
  {
    id: 'ch-45',
    title: 'Programmable fills',
    subtitle: 'fill dir/shape, direction fields, and tatamirow',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 6,
    load: () => import('../content/part-7/ch-45.mdx'),
  },
  {
    id: 'ch-46',
    title: 'Closed-loop generation',
    subtitle: 'coverat, countat, nearestsewn, and feedback stability',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 7,
    load: () => import('../content/part-7/ch-46.mdx'),
  },
  {
    id: 'ch-47',
    title: 'Part VII capstone: The Patch',
    subtitle: 'Production-grade merrowed badge from first principles',
    part: 'Part VII — Fabric Physics and the Professional Layer',
    partNumber: 7,
    order: 8,
    load: () => import('../content/part-7/ch-47.mdx'),
  },

  // ── Part VIII — Craft, Projects, and the Real Machine ─────────────────
  {
    id: 'ch-48',
    title: 'The two worlds',
    subtitle: 'Sewing vs data — the full command census',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 1,
    load: () => import('../content/part-8/ch-48.mdx'),
  },
  {
    id: 'ch-49',
    title: 'Sewing gotchas',
    subtitle: 'Open vs closed, parking, parity, and the pre-flight checklist',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 2,
    load: () => import('../content/part-8/ch-49.mdx'),
  },
  {
    id: 'ch-50',
    title: 'Travel planning and design hygiene',
    subtitle: 'Sewing order, nearest-neighbour tours, and trim budgets',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 3,
    load: () => import('../content/part-8/ch-50.mdx'),
  },
  {
    id: 'ch-51',
    title: 'From preview to fabric',
    subtitle: '.DST export, hooping, stabilizers, and troubleshooting',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 4,
    load: () => import('../content/part-8/ch-51.mdx'),
  },
  {
    id: 'ch-52',
    title: 'Capstone studio',
    subtitle: 'Meadow, Sampler, Stained Glass, Monogram Patch, Free study',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 5,
    load: () => import('../content/part-8/ch-52.mdx'),
  },
  {
    id: 'ch-53',
    title: 'Reading the masters',
    subtitle: 'Guided readings of the bundled examples',
    part: 'Part VIII — Craft, Projects, and the Real Machine',
    partNumber: 8,
    order: 6,
    load: () => import('../content/part-8/ch-53.mdx'),
  },

  // ── Part IX — Tooling and Ecosystem ───────────────────────────────────
  {
    id: 'ch-54',
    title: 'Playground power use',
    subtitle: 'REPL, Parameters panel, presets, and editor ergonomics',
    part: 'Part IX — Tooling and Ecosystem',
    partNumber: 9,
    order: 1,
    load: () => import('../content/part-9/ch-54.mdx'),
  },
  {
    id: 'ch-55',
    title: 'SVG import',
    subtitle: 'What maps to what and how to take it to production',
    part: 'Part IX — Tooling and Ecosystem',
    partNumber: 9,
    order: 2,
    load: () => import('../content/part-9/ch-55.mdx'),
  },
  {
    id: 'ch-56',
    title: 'The AI assistant',
    subtitle: '/ai setup, the four verbs, and review discipline',
    part: 'Part IX — Tooling and Ecosystem',
    partNumber: 9,
    order: 3,
    load: () => import('../content/part-9/ch-56.mdx'),
  },
  {
    id: 'ch-57',
    title: 'The engine as a library',
    subtitle: 'npm install needlescript — run, designStats, toDST, and beyond',
    part: 'Part IX — Tooling and Ecosystem',
    partNumber: 9,
    order: 4,
    load: () => import('../content/part-9/ch-57.mdx'),
  },
  {
    id: 'ch-58',
    title: 'Where to go from here',
    subtitle: 'Community, contributing, and a reading list',
    part: 'Part IX — Tooling and Ecosystem',
    partNumber: 9,
    order: 5,
    load: () => import('../content/part-9/ch-58.mdx'),
  },

  // ── Appendices ────────────────────────────────────────────────────────
  {
    id: 'appendix-a',
    title: 'Language reference',
    subtitle: 'Every command and function — searchable Ref cards',
    part: 'Appendices',
    partNumber: 10,
    order: 1,
    load: () => import('../content/appendices/appendix-a.mdx'),
  },
  {
    id: 'appendix-b',
    title: 'The two-worlds census',
    subtitle: 'Sortable taxonomy table of every command',
    part: 'Appendices',
    partNumber: 10,
    order: 2,
    load: () => import('../content/appendices/appendix-b.mdx'),
  },
  {
    id: 'appendix-c',
    title: 'Limits & clamps',
    subtitle: 'The safety-limit table and what hitting each one looks like',
    part: 'Appendices',
    partNumber: 10,
    order: 3,
    load: () => import('../content/appendices/appendix-c.mdx'),
  },
  {
    id: 'appendix-d',
    title: 'Warning & error catalog',
    subtitle: 'Every message verbatim → cause → fix → chapter',
    part: 'Appendices',
    partNumber: 10,
    order: 4,
    load: () => import('../content/appendices/appendix-d.mdx'),
  },
  {
    id: 'appendix-e',
    title: 'Pitfall drills index',
    subtitle: 'D1–D6 with all Bug cells collected for review',
    part: 'Appendices',
    partNumber: 10,
    order: 5,
    load: () => import('../content/appendices/appendix-e.mdx'),
  },
  {
    id: 'appendix-f',
    title: 'Glossary',
    subtitle: 'Embroidery terms for programmers, programming terms for makers',
    part: 'Appendices',
    partNumber: 10,
    order: 6,
    load: () => import('../content/appendices/appendix-f.mdx'),
  },
  {
    id: 'appendix-g',
    title: 'Cheat sheets',
    subtitle: 'Printable one-pagers for turtle, stitch modes, generative math, and pre-flight',
    part: 'Appendices',
    partNumber: 10,
    order: 7,
    load: () => import('../content/appendices/appendix-g.mdx'),
  },
  {
    id: 'appendix-h',
    title: 'Migration map',
    subtitle: 'Old tutorial § → new chapter mapping for existing readers',
    part: 'Appendices',
    partNumber: 10,
    order: 8,
    load: () => import('../content/appendices/appendix-h.mdx'),
  },
];

// ── Derived helpers ───────────────────────────────────────────────────────────

/** All chapters grouped by part, preserving part order. */
export function groupByPart(chapters: Chapter[]): Part[] {
  const partMap = new Map<number, Part>();
  for (const ch of chapters) {
    let part = partMap.get(ch.partNumber);
    if (!part) {
      part = { number: ch.partNumber, title: ch.part, chapters: [] };
      partMap.set(ch.partNumber, part);
    }
    part.chapters.push(ch);
  }
  return [...partMap.values()].sort((a, b) => a.number - b.number);
}

export function getChapterById(id: string): Chapter | undefined {
  return CHAPTERS.find((ch) => ch.id === id);
}

export function getPrevNext(id: string): { prev: Chapter | null; next: Chapter | null } {
  const idx = CHAPTERS.findIndex((ch) => ch.id === id);
  return {
    prev: idx > 0 ? CHAPTERS[idx - 1] : null,
    next: idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null,
  };
}
