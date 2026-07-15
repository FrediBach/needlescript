// Shared constants for the NeedleScript playground UI

export const THREADS: string[] = [
  '#C8472F', // 0 — red
  '#31604F', // 1 — forest
  '#3A4E8C', // 2 — blue
  '#D9A441', // 3 — gold
  '#8C4A6B', // 4 — mauve
  '#2B2B2B', // 5 — black
  '#5E8F8C', // 6 — teal
  '#B8651B', // 7 — amber
];

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

export interface Example {
  id: string;
  label: string;
  source: string;
  tier: string;
}

export interface ExampleTier {
  label: string;
  examples: Example[];
}

const exampleFiles = import.meta.glob('../examples/*/*.ns', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function labelForExample(id: string): string {
  return id
    .replaceAll('-', ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2');
}

const examples = Object.entries(exampleFiles)
  .map(([path, source]): Example => {
    const match = path.match(/^\.\.\/examples\/([^/]+)\/([^/]+)\.ns$/);
    if (!match) throw new Error(`Invalid example path: ${path}`);

    const [, tier, id] = match;
    return { id, label: labelForExample(id), source, tier };
  })
  .sort((a, b) => a.tier.localeCompare(b.tier) || a.label.localeCompare(b.label));

// IDs are filename slugs. Adding a .ns file to a tier directory registers it automatically.
export const EXAMPLES: Record<string, string> = Object.fromEntries(
  examples.map(({ id, source }) => [id, source]),
);

const examplesByTier = examples.reduce<Record<string, Example[]>>((tiers, example) => {
  (tiers[example.tier] ??= []).push(example);
  return tiers;
}, {});

const EXAMPLE_TIER_ORDER = ['intro', 'intermediate', 'advanced'];

export const EXAMPLE_TIERS: ExampleTier[] = Object.entries(examplesByTier)
  .map(([label, tierExamples]) => ({ label, examples: tierExamples }))
  .sort((a, b) => EXAMPLE_TIER_ORDER.indexOf(a.label) - EXAMPLE_TIER_ORDER.indexOf(b.label));

export const DEFAULT_EXAMPLE_ID = 'bloom';
