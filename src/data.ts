// Shared constants for the NeedleScript playground UI

import { DEFAULT_PALETTE } from './lib/core/colormath.ts';
import {
  EXAMPLE_CATALOG,
  EXAMPLE_CATEGORY_DEFINITIONS,
  START_HERE_EXAMPLE_IDS,
} from './example-catalog.ts';
import type { ExampleCategoryId, ExampleKind } from './example-catalog.ts';

export const THREADS: string[] = [...DEFAULT_PALETTE];

export interface HoopConfig {
  id: string;
  label: string;
  widthMM: number;
  heightMM: number;
  shape: 'circle' | 'oval' | 'rectangle';
}

export const HOOPS: HoopConfig[] = [
  { id: 'round-100', label: '100 mm round', widthMM: 100, heightMM: 100, shape: 'circle' },
  { id: 'round-130', label: '130 mm round', widthMM: 130, heightMM: 130, shape: 'circle' },
  { id: 'round-150', label: '150 mm round', widthMM: 150, heightMM: 150, shape: 'circle' },
  { id: 'round-200', label: '200 mm round', widthMM: 200, heightMM: 200, shape: 'circle' },
  { id: 'oval-120x75', label: '120×75 mm oval', widthMM: 120, heightMM: 75, shape: 'oval' },
  { id: 'oval-150x100', label: '150×100 mm oval', widthMM: 150, heightMM: 100, shape: 'oval' },
  { id: 'rect-100', label: '100×100 mm', widthMM: 100, heightMM: 100, shape: 'rectangle' },
  { id: 'rect-180x130', label: '180×130 mm', widthMM: 180, heightMM: 130, shape: 'rectangle' },
];

export const DEFAULT_HOOP: HoopConfig = HOOPS[0];

// Machine presets belong to the playground rather than the language runtime: applying one
// writes ordinary NeedleScript directives into the source file.
export type MachineClass = 'home' | 'multi-needle' | 'commercial';
export type TrimmerClass = 'jump' | 'colorchange' | 'none';
export type MachineNativeFormat = 'DST' | 'PES' | 'EXP' | 'JEF' | 'VP3' | 'XXX';

export interface MachineHoop {
  id: string;
  label: string;
  /** Literal NeedleScript argument, deliberately not interpreted by the UI. */
  hoopArg: string;
}

export interface MachinePreset {
  id: string;
  brand: string;
  model: string;
  cls: MachineClass;
  hoops: MachineHoop[];
  trimmer: TrimmerClass;
  nativeFormat: MachineNativeFormat;
  maxSpm?: number;
  budgetStitches?: number;
  notes?: string;
}

const rect = (id: string, label: string, width: number, height: number): MachineHoop => ({
  id,
  label,
  hoopArg: `[${Math.min(width, height)}, ${Math.max(width, height)}]`,
});

/**
 * Curated, popular presets. Dimensions use the machines' nominal embroidery fields rather
 * than the outside dimensions of a physical frame, so the generated `hoop` directive is
 * directly useful in NeedleScript.
 */
export const MACHINES: MachinePreset[] = [
  {
    id: 'brother-pe800',
    brand: 'Brother',
    model: 'PE800',
    cls: 'home',
    hoops: [
      rect('100x100', '4×4 (100×100)', 100, 100),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 650,
    budgetStitches: 40000,
  },
  {
    id: 'brother-se600',
    brand: 'Brother',
    model: 'SE600',
    cls: 'home',
    hoops: [{ id: '4x4', label: '4×4 (100×100)', hoopArg: "'4x4'" }],
    trimmer: 'colorchange',
    nativeFormat: 'PES',
    maxSpm: 400,
    budgetStitches: 25000,
  },
  {
    id: 'brother-pe550d',
    brand: 'Brother',
    model: 'PE550D',
    cls: 'home',
    hoops: [{ id: '4x4', label: '4×4 (100×100)', hoopArg: "'4x4'" }],
    trimmer: 'colorchange',
    nativeFormat: 'PES',
    maxSpm: 400,
    budgetStitches: 25000,
  },
  {
    id: 'brother-pe900',
    brand: 'Brother',
    model: 'PE900',
    cls: 'home',
    hoops: [
      rect('100x100', '4×4 (100×100)', 100, 100),
      rect('100x180', '4×7 (100×180)', 100, 180),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 650,
    budgetStitches: 40000,
  },
  {
    id: 'brother-se2000',
    brand: 'Brother',
    model: 'SE2000',
    cls: 'home',
    hoops: [
      rect('100x100', '4×4 (100×100)', 100, 100),
      rect('100x180', '4×7 (100×180)', 100, 180),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 650,
    budgetStitches: 40000,
  },
  {
    id: 'babylock-flourish-ii',
    brand: 'Baby Lock',
    model: 'Flourish II',
    cls: 'home',
    hoops: [
      rect('100x100', '4×4 (100×100)', 100, 100),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 650,
    budgetStitches: 40000,
  },
  {
    id: 'janome-mc500e',
    brand: 'Janome',
    model: 'MC500E',
    cls: 'home',
    hoops: [
      rect('sq14', 'SQ14 (140×140)', 140, 140),
      rect('re20', 'RE20 (170×200)', 170, 200),
      rect('re28', 'RE28 (200×280)', 200, 280),
    ],
    trimmer: 'jump',
    nativeFormat: 'JEF',
    maxSpm: 860,
    budgetStitches: 45000,
  },
  {
    id: 'janome-mc550e',
    brand: 'Janome',
    model: 'MC550E',
    cls: 'home',
    hoops: [
      rect('sq14b', 'SQ14b (140×140)', 140, 140),
      rect('re20b', 'RE20b (140×200)', 140, 200),
      rect('sq20b', 'SQ20b (200×200)', 200, 200),
      rect('re28b', 'RE28b (200×280)', 200, 280),
      rect('re36b', 'RE36b (200×360)', 200, 360),
    ],
    trimmer: 'jump',
    nativeFormat: 'JEF',
    maxSpm: 860,
    budgetStitches: 50000,
  },
  {
    id: 'bernina-570-qe',
    brand: 'Bernina',
    model: '570 QE + module',
    cls: 'home',
    hoops: [
      rect('50x72', 'Small (50×72)', 50, 72),
      rect('100x130', 'Medium (100×130)', 100, 130),
      rect('145x255', 'Large oval (145×255)', 145, 255),
      rect('165x265', 'Midi (165×265)', 165, 265),
    ],
    trimmer: 'jump',
    nativeFormat: 'EXP',
    maxSpm: 680,
    budgetStitches: 40000,
  },
  {
    id: 'bernina-790-plus',
    brand: 'Bernina',
    model: '790 PLUS',
    cls: 'home',
    hoops: [
      rect('50x72', 'Small (50×72)', 50, 72),
      rect('100x130', 'Medium (100×130)', 100, 130),
      rect('145x255', 'Large oval (145×255)', 145, 255),
      rect('165x265', 'Midi (165×265)', 165, 265),
      rect('210x400', 'Maxi (210×400)', 210, 400),
    ],
    trimmer: 'jump',
    nativeFormat: 'EXP',
    maxSpm: 1000,
    budgetStitches: 50000,
  },
  {
    id: 'bernette-70-deco',
    brand: 'bernette',
    model: '70 DECO',
    cls: 'home',
    hoops: [
      rect('50x70', 'Small (50×70)', 50, 70),
      rect('120x180', 'Medium (120×180)', 120, 180),
      rect('160x260', 'Large (160×260)', 160, 260),
    ],
    trimmer: 'jump',
    nativeFormat: 'EXP',
    maxSpm: 850,
    budgetStitches: 40000,
  },
  {
    id: 'husqvarna-topaz-50',
    brand: 'Husqvarna',
    model: 'Designer Topaz 50',
    cls: 'home',
    hoops: [
      rect('120x120', '120×120', 120, 120),
      rect('120x180', '120×180', 120, 180),
      rect('150x240', '150×240', 150, 240),
      rect('200x260', '200×260', 200, 260),
    ],
    trimmer: 'jump',
    nativeFormat: 'VP3',
    maxSpm: 800,
    budgetStitches: 40000,
  },
  {
    id: 'pfaff-creative-45',
    brand: 'Pfaff',
    model: 'Creative 4.5',
    cls: 'home',
    hoops: [
      rect('120x120', '120×120', 120, 120),
      rect('120x180', '120×180', 120, 180),
      rect('150x240', '150×240', 150, 240),
      rect('200x260', '200×260', 200, 260),
    ],
    trimmer: 'jump',
    nativeFormat: 'VP3',
    maxSpm: 800,
    budgetStitches: 40000,
  },
  {
    id: 'singer-futura-xl580',
    brand: 'Singer',
    model: 'Futura XL-580',
    cls: 'home',
    hoops: [
      rect('100x100', '100×100', 100, 100),
      rect('100x240', '100×240', 100, 240),
      rect('171x260', '171×260', 171, 260),
    ],
    trimmer: 'none',
    nativeFormat: 'XXX',
    maxSpm: 700,
    budgetStitches: 30000,
  },
  {
    id: 'brother-pr680w',
    brand: 'Brother',
    model: 'PR680W',
    cls: 'multi-needle',
    hoops: [
      rect('100x100', '100×100', 100, 100),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
      rect('200x300', '200×300', 200, 300),
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 1000,
    budgetStitches: 60000,
  },
  {
    id: 'brother-pr1055x',
    brand: 'Brother',
    model: 'PR1055X',
    cls: 'multi-needle',
    hoops: [
      rect('40x60', '1.5×2 (40×60)', 40, 60),
      rect('100x100', '4×4 (100×100)', 100, 100),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
      rect('200x360', '8×14 (200×360)', 200, 360),
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 1000,
    budgetStitches: 70000,
  },
  {
    id: 'babylock-venture',
    brand: 'Baby Lock',
    model: 'Venture',
    cls: 'multi-needle',
    hoops: [
      rect('100x100', '4×4 (100×100)', 100, 100),
      { id: '5x7', label: '5×7 (130×180)', hoopArg: "'5x7'" },
      rect('200x200', '8×8 (200×200)', 200, 200),
      rect('200x360', '7⅞×14 (200×360)', 200, 360),
    ],
    trimmer: 'jump',
    nativeFormat: 'PES',
    maxSpm: 1000,
    budgetStitches: 70000,
  },
  {
    id: 'janome-mb7',
    brand: 'Janome',
    model: 'MB-7',
    cls: 'multi-needle',
    hoops: [
      rect('50x50', 'M3 (50×50)', 50, 50),
      rect('110x126', 'M2 (110×126)', 110, 126),
      rect('200x240', 'M1 (200×240)', 200, 240),
    ],
    trimmer: 'jump',
    nativeFormat: 'JEF',
    maxSpm: 800,
    budgetStitches: 60000,
  },
  {
    id: 'ricoma-em1010',
    brand: 'Ricoma',
    model: 'EM-1010',
    cls: 'commercial',
    hoops: [
      rect('50x70', '50×70', 50, 70),
      rect('110x110', '110×110', 110, 110),
      rect('140x190', '140×190', 140, 190),
      rect('210x310', '210×310', 210, 310),
    ],
    trimmer: 'jump',
    nativeFormat: 'DST',
    maxSpm: 1000,
    budgetStitches: 70000,
  },
  {
    id: 'ricoma-mt1501',
    brand: 'Ricoma',
    model: 'MT-1501',
    cls: 'commercial',
    hoops: [
      rect('90x90', '90×90', 90, 90),
      rect('120x120', '120×120', 120, 120),
      rect('150x150', '150×150', 150, 150),
      rect('200x200', '200×200', 200, 200),
      rect('300x300', '300×300', 300, 300),
    ],
    trimmer: 'jump',
    nativeFormat: 'DST',
    maxSpm: 1200,
    budgetStitches: 100000,
  },
  {
    id: 'melco-emt16x',
    brand: 'Melco',
    model: 'EMT16X',
    cls: 'commercial',
    hoops: [
      { id: 'round150', label: '150 mm round', hoopArg: '150' },
      rect('300x360', '300×360', 300, 360),
    ],
    trimmer: 'jump',
    nativeFormat: 'EXP',
    maxSpm: 1500,
    budgetStitches: 80000,
  },
  {
    id: 'tajima-tmez-sc',
    brand: 'Tajima',
    model: 'TMEZ-SC',
    cls: 'commercial',
    hoops: [
      rect('80x180', 'Cap (80×180)', 80, 180),
      rect('100x100', '100×100', 100, 100),
      rect('150x150', '150×150', 150, 150),
      rect('250x250', '250×250', 250, 250),
    ],
    trimmer: 'jump',
    nativeFormat: 'DST',
    maxSpm: 1200,
    budgetStitches: 100000,
  },
];

export const SEW_TIME_TRIM_PENALTY_SECONDS = 12;
export const SEW_TIME_COLOR_CHANGE_PENALTY_SECONDS = 25;

export interface Example {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: ExampleCategoryId;
  kind: ExampleKind;
  tags: readonly string[];
  lineCount: number;
}

export interface ExampleCategory {
  id: ExampleCategoryId;
  label: string;
  description: string;
  examples: Example[];
}

const exampleFiles = import.meta.glob('../examples/**/*.ns', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const catalogById = new Map(EXAMPLE_CATALOG.map((entry) => [entry.id, entry]));
if (catalogById.size !== EXAMPLE_CATALOG.length) {
  throw new Error('Example catalogue contains duplicate IDs');
}

const seenExampleIds = new Set<string>();
const examples = Object.entries(exampleFiles)
  .map(([path, source]): Example => {
    const match = path.match(/^\.\.\/examples\/([^/]+)\/([^/]+)\.ns$/);
    if (!match) throw new Error(`Invalid example path: ${path}`);

    const [, directory, id] = match;
    if (seenExampleIds.has(id)) throw new Error(`Duplicate example ID: ${id}`);
    seenExampleIds.add(id);

    const metadata = catalogById.get(id);
    if (!metadata) throw new Error(`Example is missing catalogue metadata: ${id}`);
    if (metadata.category !== directory) {
      throw new Error(
        `Example "${id}" is catalogued as ${metadata.category} but stored in ${directory}`,
      );
    }

    const lineCount = source.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return { ...metadata, source, lineCount };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

const missingExampleFiles = EXAMPLE_CATALOG.filter((entry) => !seenExampleIds.has(entry.id));
if (missingExampleFiles.length > 0) {
  throw new Error(
    `Catalogue entries have no example file: ${missingExampleFiles.map(({ id }) => id).join(', ')}`,
  );
}

// IDs remain filename slugs, independent of their topic directory.
export const EXAMPLES: Record<string, string> = Object.fromEntries(
  examples.map(({ id, source }) => [id, source]),
);

export const EXAMPLE_CATEGORIES: ExampleCategory[] = EXAMPLE_CATEGORY_DEFINITIONS.map(
  ({ id, label, description }) => ({
    id,
    label,
    description,
    examples: examples.filter((example) => example.category === id),
  }),
);

export const ALL_EXAMPLES: readonly Example[] = examples;

const examplesById = new Map(examples.map((example) => [example.id, example]));
export const START_HERE_EXAMPLES: readonly Example[] = START_HERE_EXAMPLE_IDS.map((id) => {
  const example = examplesById.get(id);
  if (!example) throw new Error(`Start-here example does not exist: ${id}`);
  return example;
});

export const DEFAULT_EXAMPLE_ID = 'bloom';
