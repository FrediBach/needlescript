import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LANGUAGE_REFERENCE_FEATURES,
  LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURES,
} from '../../lib/language/reference.ts';
import { GlossaryContent } from './GlossaryContent.tsx';

const EMBROIDERY_RESULT_SEARCH_TERMS = [
  'stitchscope',
  'satincap',
  'satincaplen',
  'satinjoin',
  'satincorner',
  'satinwide',
  'satinmaxwidth',
  'satinsplitoverlap',
  'fillinset',
  'filledgerun',
  'filledgeshort',
  'fillstagger',
  'fillstaggeramount',
  'fillconnect',
  'compensation',
  'plan',
  'preflight',
  'planbarrier',
  'atomic',
  'routegroup',
  'fabric',
  'fabricgrain',
  'fabricstretch',
  'threadprofile',
  'threadwidth',
  'needle',
  'stabilizer',
  'topping',
  'underlay',
  'underlaypasses',
  'underlaylen',
  'underlayinset',
  'underlayspacing',
  'fillunderlay',
  'fillunderlaypasses',
  'fillunderlaylen',
  'fillunderlayinset',
  'fillunderlayspacing',
  'fillunderlayangle',
  'gradientrows',
  'gradientrowsn',
  'serpentinerows',
  'knockdown',
  'fillbordergeometry',
  'fillandborder',
  'fillandborderwith',
  'appliquewith',
] as const;

function renderGlossary(query: string): string {
  return renderToStaticMarkup(createElement(GlossaryContent, { query }));
}

describe('embroidery results glossary', () => {
  it('makes every new command and recipe discoverable by name', () => {
    const missing = EMBROIDERY_RESULT_SEARCH_TERMS.filter((term) =>
      renderGlossary(term).includes('no matches for'),
    );

    expect(missing).toEqual([]);
  });

  it('uses unique displayed terms', () => {
    const document = new DOMParser().parseFromString(renderGlossary(''), 'text/html');
    const terms = [...document.querySelectorAll('[data-glossary-entry] > span:first-child')].map(
      (element) => element.textContent,
    );

    expect(new Set(terms).size).toBe(terms.length);
  });

  it('lists related commands for every entry', () => {
    const document = new DOMParser().parseFromString(renderGlossary(''), 'text/html');
    const entries = [...document.querySelectorAll('[data-glossary-entry]')];

    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.filter((entry) => entry.querySelectorAll('[data-glossary-command]').length === 0),
    ).toEqual([]);
  });

  it('only lists documented language features and standard-library procedures', () => {
    const document = new DOMParser().parseFromString(renderGlossary(''), 'text/html');
    const knownCommands = new Set([
      ...LANGUAGE_REFERENCE_FEATURES.map((feature) => feature.label),
      ...LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURES.map((procedure) => procedure.name),
    ]);
    const unknownCommands = [...document.querySelectorAll('[data-glossary-command]')]
      .map((element) => element.textContent ?? '')
      .filter((command) => !knownCommands.has(command));

    expect(unknownCommands).toEqual([]);
  });

  it('filters by visible related commands', () => {
    const glossary = renderGlossary('satinsplitoverlap');

    expect(glossary).toContain('Split overlap');
    expect(glossary).toContain('Related commands:');
    expect(glossary).not.toContain('Needle penetration');
  });

  it('distinguishes visible top stitching from removable fabric topping', () => {
    const glossary = renderGlossary('topping');

    expect(glossary).toContain('Topping layer');
    expect(glossary).toContain('Fabric topping');
  });
});
