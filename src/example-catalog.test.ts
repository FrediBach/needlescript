import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_CATALOG,
  EXAMPLE_CATEGORY_DEFINITIONS,
  START_HERE_EXAMPLE_IDS,
} from './example-catalog.ts';
import { ALL_EXAMPLES, EXAMPLES, EXAMPLE_CATEGORIES, START_HERE_EXAMPLES } from './data.ts';

const examplePreviews = import.meta.glob('../public/example-previews/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('example catalogue', () => {
  it('catalogues every bundled example exactly once', () => {
    const catalogIds = EXAMPLE_CATALOG.map(({ id }) => id);
    const bundledIds = ALL_EXAMPLES.map(({ id }) => id);

    expect(EXAMPLE_CATALOG).toHaveLength(108);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(bundledIds.toSorted()).toEqual(catalogIds.toSorted());
    expect(Object.keys(EXAMPLES).toSorted()).toEqual(catalogIds.toSorted());
  });

  it('keeps every topic populated and in the declared order', () => {
    expect(EXAMPLE_CATEGORIES.map(({ id }) => id)).toEqual(
      EXAMPLE_CATEGORY_DEFINITIONS.map(({ id }) => id),
    );
    for (const category of EXAMPLE_CATEGORIES) {
      expect(category.examples.length, category.id).toBeGreaterThan(0);
      expect(category.examples.every((example) => example.category === category.id)).toBe(true);
    }
  });

  it('provides useful searchable metadata', () => {
    for (const example of EXAMPLE_CATALOG) {
      expect(example.title.trim().length, `${example.id} title`).toBeGreaterThan(2);
      expect(example.summary.trim().length, `${example.id} summary`).toBeGreaterThan(20);
      expect(example.tags.length, `${example.id} tags`).toBeGreaterThanOrEqual(2);
      expect(new Set(example.tags).size, `${example.id} duplicate tags`).toBe(example.tags.length);
      for (const tag of example.tags) {
        expect(tag, `${example.id} tag`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    }
  });

  it('keeps the start-here collection deliberate and ordered', () => {
    expect(new Set(START_HERE_EXAMPLE_IDS).size).toBe(START_HERE_EXAMPLE_IDS.length);
    expect(START_HERE_EXAMPLES.map(({ id }) => id)).toEqual(START_HERE_EXAMPLE_IDS);
  });

  it('has one square generated preview per example', () => {
    const previewIds = Object.keys(examplePreviews)
      .map(
        (filename) =>
          filename
            .split('/')
            .at(-1)
            ?.replace(/\.svg$/, '') ?? '',
      )
      .toSorted();
    const exampleIds = EXAMPLE_CATALOG.map(({ id }) => id).toSorted();

    expect(previewIds).toEqual(exampleIds);
    for (const id of previewIds) {
      const svg = examplePreviews[`../public/example-previews/${id}.svg`];
      const viewBox = svg.match(/viewBox="([^ ]+) ([^ ]+) ([^ ]+) ([^"]+)"/);
      expect(viewBox, `${id} viewBox`).not.toBeNull();
      expect(Number(viewBox?.[3]), `${id} square width`).toBeCloseTo(Number(viewBox?.[4]), 5);
      expect(svg, `${id} preview dimensions`).toContain('width="256" height="256"');
    }
  });
});
