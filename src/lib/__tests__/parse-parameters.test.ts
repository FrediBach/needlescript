import { describe, it, expect } from 'vitest';
import { parseParameters, updateParameter, snapValue } from '../parse-parameters.ts';

// ── parseParameters ────────────────────────────────────────────────────────

describe('parseParameters', () => {
  describe('integer slider', () => {
    it('recognises [min:max] with both integer bounds', () => {
      const src = 'let n = 8 // [4:30]';
      const items = parseParameters(src);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: 'param',
        def: {
          name: 'n',
          value: 8,
          controlType: 'slider',
          sliderKind: 'integer',
          min: 4,
          max: 30,
          step: 1,
          line: 1,
        },
      });
    });

    it('handles negative bounds', () => {
      const src = 'let offset = -5 // [-10:10]';
      const items = parseParameters(src);
      expect(items[0]).toMatchObject({
        kind: 'param',
        def: { name: 'offset', value: -5, min: -10, max: 10, step: 1, sliderKind: 'integer' },
      });
    });
  });

  describe('smooth slider', () => {
    it('recognises [min:max] with a float bound', () => {
      const src = 'let t = 0.5 // [0:1]';
      const items = parseParameters(src);
      expect(items[0]).toMatchObject({
        kind: 'param',
        def: {
          name: 't',
          sliderKind: 'smooth',
          min: 0,
          max: 1,
          step: 0.01,
        },
      });
    });

    it('sets step to (max-min)/100', () => {
      const src = 'let x = 2.5 // [0.5:8]';
      const items = parseParameters(src);
      const def = (items[0] as { kind: 'param'; def: import('../parse-parameters.ts').ParamDef })
        .def;
      expect(def.step).toBeCloseTo((8 - 0.5) / 100);
    });
  });

  describe('stepped slider', () => {
    it('recognises [min:step:max]', () => {
      const src = '  let smoothness = 2 // [0.5:0.5:8]';
      const items = parseParameters(src);
      expect(items[0]).toMatchObject({
        kind: 'param',
        def: {
          name: 'smoothness',
          sliderKind: 'stepped',
          min: 0.5,
          max: 8,
          step: 0.5,
        },
      });
    });
  });

  describe('switch', () => {
    it('recognises [switch]', () => {
      const src = 'let enabled = 1 // [switch]';
      const items = parseParameters(src);
      expect(items[0]).toMatchObject({
        kind: 'param',
        def: {
          name: 'enabled',
          value: 1,
          controlType: 'switch',
          labels: undefined,
        },
      });
    });

    it('recognises [switch:label0,label1]', () => {
      const src = 'let mode = 0 // [switch:hypo,epi]';
      const items = parseParameters(src);
      const def = (items[0] as { kind: 'param'; def: import('../parse-parameters.ts').ParamDef })
        .def;
      expect(def.labels).toEqual(['hypo', 'epi']);
    });
  });

  describe('section headers', () => {
    it('recognises // --- Title ---', () => {
      const src = '// --- Geometry ---\nlet n = 3 // [2:20]';
      const items = parseParameters(src);
      expect(items[0]).toEqual({ kind: 'section', title: 'Geometry' });
      expect(items[1]).toMatchObject({ kind: 'param', def: { name: 'n' } });
    });

    it('handles multiple dashes', () => {
      const src = '// ---- Size ----';
      const items = parseParameters(src);
      expect(items[0]).toEqual({ kind: 'section', title: 'Size' });
    });
  });

  describe('declaration styles', () => {
    it('parses modern let syntax', () => {
      const items = parseParameters('let r = 10 // [1:50]');
      expect(items[0]).toMatchObject({ kind: 'param', def: { name: 'r', value: 10 } });
    });

    it('parses classic make syntax', () => {
      const items = parseParameters('make "r 10 // [1:50]');
      expect(items[0]).toMatchObject({ kind: 'param', def: { name: 'r', value: 10 } });
    });

    it('parses bare assignment', () => {
      const items = parseParameters('r = 10 // [1:50]');
      expect(items[0]).toMatchObject({ kind: 'param', def: { name: 'r', value: 10 } });
    });
  });

  describe('comment styles', () => {
    it('supports ;', () => {
      const items = parseParameters('let n = 5 ; [2:10]');
      expect(items).toHaveLength(1);
    });

    it('supports #', () => {
      const items = parseParameters('let n = 5 # [2:10]');
      expect(items).toHaveLength(1);
    });
  });

  it('ignores lines without an annotation', () => {
    const src = 'let r = 10\nlet n = 5 // some comment';
    expect(parseParameters(src)).toHaveLength(0);
  });

  it('clamps out-of-range source values', () => {
    const items = parseParameters('let n = 100 // [1:10]');
    const def = (items[0] as { kind: 'param'; def: import('../parse-parameters.ts').ParamDef }).def;
    expect(def.value).toBe(10);
  });

  it('returns items in source order with mixed content', () => {
    const src = ['// --- A ---', 'let x = 1 // [0:10]', '// --- B ---', 'let y = 2 // [0:20]'].join(
      '\n',
    );
    const items = parseParameters(src);
    expect(items.map((i) => i.kind)).toEqual(['section', 'param', 'section', 'param']);
  });
});

// ── updateParameter ────────────────────────────────────────────────────────

describe('updateParameter', () => {
  it('updates a let declaration in place', () => {
    const src = 'let radius = 15 // [5:50]';
    const out = updateParameter(src, 1, 'radius', 25);
    expect(out).toBe('let radius = 25 // [5:50]');
  });

  it('preserves the annotation comment', () => {
    const src = 'let n = 8 // [4:30] — integer slider';
    const out = updateParameter(src, 1, 'n', 12);
    expect(out).toBe('let n = 12 // [4:30] — integer slider');
  });

  it('updates a make declaration', () => {
    const src = 'make "radius 15 // [5:50]';
    const out = updateParameter(src, 1, 'radius', 30);
    expect(out).toBe('make "radius 30 // [5:50]');
  });

  it('updates a bare assignment', () => {
    const src = 'radius = 15 // [5:50]';
    const out = updateParameter(src, 1, 'radius', 5);
    expect(out).toBe('radius = 5 // [5:50]');
  });

  it('handles negative values', () => {
    const src = 'let offset = 5 // [-10:10]';
    const out = updateParameter(src, 1, 'offset', -3);
    expect(out).toBe('let offset = -3 // [-10:10]');
  });

  it('handles float values', () => {
    const src = 'let t = 0.5 // [0:1]';
    const out = updateParameter(src, 1, 't', 0.75);
    expect(out).toBe('let t = 0.75 // [0:1]');
  });

  it('targets the correct line in multiline source', () => {
    const src = 'let a = 1 // [0:10]\nlet b = 2 // [0:10]\nlet c = 3 // [0:10]';
    const out = updateParameter(src, 2, 'b', 9);
    expect(out).toBe('let a = 1 // [0:10]\nlet b = 9 // [0:10]\nlet c = 3 // [0:10]');
  });

  it('leaves source unchanged when line number is out of range', () => {
    const src = 'let n = 5 // [1:10]';
    expect(updateParameter(src, 99, 'n', 7)).toBe(src);
  });

  it('formats whole-number floats without decimal point', () => {
    const src = 'let n = 3.5 // [0:10]';
    const out = updateParameter(src, 1, 'n', 5.0);
    expect(out).toBe('let n = 5 // [0:10]');
  });
});

// ── snapValue ─────────────────────────────────────────────────────────────

describe('snapValue', () => {
  it('snaps to the nearest step', () => {
    expect(snapValue(2.3, 0, 10, 0.5)).toBeCloseTo(2.5);
    expect(snapValue(2.1, 0, 10, 0.5)).toBeCloseTo(2.0);
  });

  it('clamps below min', () => {
    expect(snapValue(-5, 0, 10, 1)).toBe(0);
  });

  it('clamps above max', () => {
    expect(snapValue(15, 0, 10, 1)).toBe(10);
  });
});
