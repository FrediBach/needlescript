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
