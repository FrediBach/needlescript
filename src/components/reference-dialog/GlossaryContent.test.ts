import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
    const terms = [...document.querySelectorAll('div > span:first-child')].map(
      (element) => element.textContent,
    );

    expect(new Set(terms).size).toBe(terms.length);
  });

  it('distinguishes visible top stitching from removable fabric topping', () => {
    const glossary = renderGlossary('topping');

    expect(glossary).toContain('Topping layer');
    expect(glossary).toContain('Fabric topping');
  });
});
