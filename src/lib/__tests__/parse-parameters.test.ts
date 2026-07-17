import { describe, it, expect } from 'vitest';
import {
  parseParameters,
  updateParameter,
  updateTextParameter,
  updatePointParameter,
  updatePaletteParameter,
  parsePresets,
  snapValue,
  projectPoint,
  sampleRegion,
} from '../parse-parameters.ts';
import type { PointParamDef, XYRegion } from '../parse-parameters.ts';

// ── parseParameters ────────────────────────────────────────────────────────

describe('parseParameters', () => {
  it('recognises color and palette controls', () => {
    const items = parseParameters(
      [
        "let accent = '#e94560' // [color]",
        "let ink = '#0b132b' // [color:#0b132b,#5bc0be]",
        "let pal = ['#0b132b', '#5bc0be'] // [palette:2:4]",
      ].join('\n'),
    );
    expect(items).toMatchObject([
      { kind: 'color', def: { name: 'accent', value: '#e94560' } },
      { kind: 'color', def: { name: 'ink', choices: ['#0b132b', '#5bc0be'] } },
      { kind: 'palette', def: { name: 'pal', value: ['#0b132b', '#5bc0be'], min: 2, max: 4 } },
    ]);
  });
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

  describe('text', () => {
    it('recognises a single-quoted string with a [text] annotation', () => {
      const items = parseParameters("let word = 'NEEDLE\\nSCRIPT' // [text]");
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: 'text',
        def: { name: 'word', value: 'NEEDLE\nSCRIPT', controlType: 'text', line: 1 },
      });
    });

    it('decodes supported string escapes', () => {
      const items = parseParameters("let label = 'it\\'s\\tready\\\\now' // [text]");
      expect(items[0]).toMatchObject({ kind: 'text', def: { value: "it's\tready\\now" } });
    });

    it('ignores [text] on a non-string declaration', () => {
      expect(parseParameters('let count = 4 // [text]')).toHaveLength(0);
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

describe('color parameter updates and presets', () => {
  it('updates a palette literal without touching its annotation', () => {
    expect(
      updatePaletteParameter("let pal = ['#000000'] // [palette]", 1, 'pal', [
        '#112233',
        '#abcdef',
      ]),
    ).toBe("let pal = ['#112233', '#abcdef'] // [palette]");
  });

  it('parses hex, strings, and color lists in presets', () => {
    expect(
      parsePresets("// @preset Night : accent=#e94560, bg='linen', pal=['#111111','#eeeeee']"),
    ).toMatchObject([{ values: { accent: '#e94560', bg: 'linen', pal: ['#111111', '#eeeeee'] } }]);
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

describe('updateTextParameter', () => {
  it('updates a let declaration and preserves the annotation', () => {
    const src = "let word = 'NEEDLE\\nSCRIPT' // [text]";
    expect(updateTextParameter(src, 1, 'word', 'HELLO\nWORLD')).toBe(
      "let word = 'HELLO\\nWORLD' // [text]",
    );
  });

  it('escapes quotes, backslashes, tabs, and newlines', () => {
    const src = "let label = 'old' // [text]";
    expect(updateTextParameter(src, 1, 'label', "it's\\here\tnow\nnext")).toBe(
      "let label = 'it\\'s\\\\here\\tnow\\nnext' // [text]",
    );
  });

  it('updates classic make and bare assignment declarations', () => {
    expect(updateTextParameter("make \"label 'old' // [text]", 1, 'label', 'new')).toBe(
      "make \"label 'new' // [text]",
    );
    expect(updateTextParameter("label = 'old' // [text]", 1, 'label', 'new')).toBe(
      "label = 'new' // [text]",
    );
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

// ── [xy] annotation grammar ────────────────────────────────────────────────

describe('parseParameters — [xy] point params', () => {
  function getPoint(src: string): PointParamDef | null {
    const items = parseParameters(src);
    const item = items.find((i) => i.kind === 'point');
    return item?.kind === 'point' ? item.def : null;
  }

  // ── basic forms ───────────────────────────────────────────────────────────
  it('recognises [xy] — free region', () => {
    const def = getPoint('let a = [0, 18] // [xy]');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('a');
    expect(def!.valueX).toBeCloseTo(0);
    expect(def!.valueY).toBeCloseTo(18);
    expect(def!.region.kind).toBe('free');
    expect(def!.controlType).toBe('point');
  });

  it('recognises [xy: xMin:xMax, yMin:yMax] — rect region', () => {
    const def = getPoint('let p = [-25, 10] // [xy: -40:0, 0:40]');
    expect(def).not.toBeNull();
    expect(def!.region.kind).toBe('rect');
    if (def!.region.kind !== 'rect') return;
    expect(def!.region.minX).toBe(-40);
    expect(def!.region.maxX).toBe(0);
    expect(def!.region.minY).toBe(0);
    expect(def!.region.maxY).toBe(40);
  });

  it('recognises [xy: disc R] — disc region', () => {
    const def = getPoint('let eye = [8, 4] // [xy: disc 12]');
    expect(def).not.toBeNull();
    expect(def!.region.kind).toBe('disc');
    if (def!.region.kind !== 'disc') return;
    expect(def!.region.radius).toBe(12);
    expect(def!.region.cx).toBe(0);
    expect(def!.region.cy).toBe(0);
  });

  it('recognises [xy: disc R @ cx,cy] — disc with center', () => {
    const def = getPoint('let p = [0, 0] // [xy: disc 10 @ 5,-3]');
    expect(def!.region.kind).toBe('disc');
    if (def!.region.kind !== 'disc') return;
    expect(def!.region.radius).toBe(10);
    expect(def!.region.cx).toBe(5);
    expect(def!.region.cy).toBe(-3);
  });

  it('recognises [xy: x] — horizontal axis (x free, y fixed)', () => {
    const def = getPoint('let tip = [22, 5] // [xy: x]');
    expect(def!.region.kind).toBe('axis');
    if (def!.region.kind !== 'axis') return;
    expect(def!.region.axis).toBe('x');
    expect(def!.region.fixedCoord).toBe(5); // y from declared value
    expect(def!.region.rangeMin).toBe(-Infinity);
    expect(def!.region.rangeMax).toBe(Infinity);
  });

  it('recognises [xy: y] — vertical axis (y free, x fixed)', () => {
    const def = getPoint('let tip = [3, 0] // [xy: y]');
    expect(def!.region.kind).toBe('axis');
    if (def!.region.kind !== 'axis') return;
    expect(def!.region.axis).toBe('y');
    expect(def!.region.fixedCoord).toBe(3); // x from declared value
  });

  it('recognises [xy: x 5:40] — bounded horizontal axis', () => {
    const def = getPoint('let tip = [22, 0] // [xy: x 5:40]');
    expect(def!.region.kind).toBe('axis');
    if (def!.region.kind !== 'axis') return;
    expect(def!.region.axis).toBe('x');
    expect(def!.region.fixedCoord).toBe(0); // y = 0
    expect(def!.region.rangeMin).toBe(5);
    expect(def!.region.rangeMax).toBe(40);
  });

  it('recognises [xy: y -20:20] — bounded vertical axis', () => {
    const def = getPoint('let p = [0, 5] // [xy: y -20:20]');
    expect(def!.region.kind).toBe('axis');
    if (def!.region.kind !== 'axis') return;
    expect(def!.region.axis).toBe('y');
    expect(def!.region.rangeMin).toBe(-20);
    expect(def!.region.rangeMax).toBe(20);
  });

  it('recognises snap clause on free region', () => {
    const def = getPoint('let a = [0, 0] // [xy, snap 0.5]');
    expect(def!.snap).toBe(0.5);
  });

  it('recognises snap clause on disc region', () => {
    const def = getPoint('let a = [0, 0] // [xy: disc 25, snap 1]');
    expect(def!.snap).toBe(1);
    expect(def!.region.kind).toBe('disc');
  });

  it('recognises snap clause on rect region', () => {
    const def = getPoint('let a = [0, 0] // [xy: -30:30, -20:20, snap 0.5]');
    expect(def!.snap).toBe(0.5);
    expect(def!.region.kind).toBe('rect');
  });

  // ── case-insensitivity and whitespace ──────────────────────────────────────
  it('is case-insensitive for XY keyword', () => {
    expect(getPoint('let a = [0, 0] // [XY]')).not.toBeNull();
    expect(getPoint('let a = [0, 0] // [Xy]')).not.toBeNull();
  });

  it('is case-insensitive for disc keyword', () => {
    expect(getPoint('let a = [0, 0] // [xy: DISC 10]')).not.toBeNull();
  });

  it('is case-insensitive for axis keywords', () => {
    expect(getPoint('let a = [0, 0] // [xy: X]')).not.toBeNull();
    expect(getPoint('let a = [0, 0] // [xy: Y]')).not.toBeNull();
  });

  it('tolerates extra whitespace around numbers', () => {
    const def = getPoint('let p = [ 5 , -3 ] // [xy:  disc  12  ]');
    expect(def).not.toBeNull();
    expect(def!.region.kind).toBe('disc');
  });

  // ── all three declaration styles ──────────────────────────────────────────
  it('parses let syntax', () => {
    expect(getPoint('let anchor = [0, 18] // [xy]')).not.toBeNull();
  });

  it('parses make syntax', () => {
    expect(getPoint('make "anchor [0, 18] // [xy]')).not.toBeNull();
  });

  it('parses bare assignment', () => {
    expect(getPoint('anchor = [0, 18] // [xy]')).not.toBeNull();
  });

  // ── both comment styles ───────────────────────────────────────────────────
  it('supports ; comment style', () => {
    expect(getPoint('let p = [0, 0] ; [xy]')).not.toBeNull();
  });

  it('supports # comment style', () => {
    expect(getPoint('let p = [0, 0] # [xy]')).not.toBeNull();
  });

  // ── negative and fractional coords ───────────────────────────────────────
  it('parses negative declared values', () => {
    const def = getPoint('let p = [-12, -7.5] // [xy]');
    expect(def!.valueX).toBeCloseTo(-12);
    expect(def!.valueY).toBeCloseTo(-7.5);
  });

  it('parses fractional declared values', () => {
    const def = getPoint('let p = [1.5, -0.25] // [xy]');
    expect(def!.valueX).toBeCloseTo(1.5);
    expect(def!.valueY).toBeCloseTo(-0.25);
  });

  // ── invalid / malformed cases ──────────────────────────────────────────────
  it('silently ignores [xy] on a scalar declaration', () => {
    expect(getPoint('let n = 5 // [xy]')).toBeNull();
  });

  it('silently ignores [xy] on a non-literal list', () => {
    expect(getPoint('let p = [a, b] // [xy]')).toBeNull();
  });

  it('silently ignores malformed disc (radius <= 0)', () => {
    expect(getPoint('let p = [0, 0] // [xy: disc 0]')).toBeNull();
  });

  it('silently ignores malformed disc (negative radius)', () => {
    expect(getPoint('let p = [0, 0] // [xy: disc -5]')).toBeNull();
  });

  it('silently ignores rect with min > max', () => {
    expect(getPoint('let p = [0, 0] // [xy: 30:-30, -20:20]')).toBeNull();
  });

  it('silently ignores snap <= 0', () => {
    expect(getPoint('let p = [0, 0] // [xy, snap 0]')).toBeNull();
    expect(getPoint('let p = [0, 0] // [xy, snap -1]')).toBeNull();
  });

  // ── declared value is projected on load ───────────────────────────────────
  it('projects declared value outside disc onto rim', () => {
    const def = getPoint('let p = [100, 0] // [xy: disc 20]');
    expect(def).not.toBeNull();
    expect(def!.valueX).toBeCloseTo(20);
    expect(def!.valueY).toBeCloseTo(0);
  });

  it('projects declared value outside rect to nearest point', () => {
    const def = getPoint('let p = [50, 50] // [xy: -10:10, -10:10]');
    expect(def!.valueX).toBe(10);
    expect(def!.valueY).toBe(10);
  });

  it('does not modify declared value already inside region', () => {
    const def = getPoint('let p = [5, -3] // [xy: -10:10, -10:10]');
    expect(def!.valueX).toBeCloseTo(5);
    expect(def!.valueY).toBeCloseTo(-3);
  });

  // ── section headers still work alongside point params ───────────────────
  it('returns items in correct order with points and sections mixed', () => {
    const src = ['// --- Geometry ---', 'let anchor = [0, 10] // [xy]', 'let n = 5 // [2:20]'].join(
      '\n',
    );
    const items = parseParameters(src);
    expect(items.map((i) => i.kind)).toEqual(['section', 'point', 'param']);
  });
});

// ── updatePointParameter ───────────────────────────────────────────────────

describe('updatePointParameter', () => {
  it('updates a let declaration in place', () => {
    const src = 'let anchor = [0, 18] // [xy]';
    expect(updatePointParameter(src, 1, 'anchor', 12, -5)).toBe('let anchor = [12, -5] // [xy]');
  });

  it('preserves the annotation comment', () => {
    const src = 'let p = [0, 0] // [xy: disc 20] extra note';
    const out = updatePointParameter(src, 1, 'p', 5, 10);
    expect(out).toBe('let p = [5, 10] // [xy: disc 20] extra note');
  });

  it('updates a point list with whitespace inside its brackets', () => {
    const src = 'let cut_a = [ 13.7, 37.6 ] // [xy]';
    expect(updatePointParameter(src, 1, 'cut_a', 12, -5)).toBe('let cut_a = [12, -5] // [xy]');
  });

  it('updates a make declaration', () => {
    const src = 'make "anchor [0, 18] // [xy]';
    expect(updatePointParameter(src, 1, 'anchor', 3, -7)).toBe('make "anchor [3, -7] // [xy]');
  });

  it('updates a bare assignment', () => {
    const src = 'anchor = [0, 18] // [xy]';
    expect(updatePointParameter(src, 1, 'anchor', -1, 5)).toBe('anchor = [-1, 5] // [xy]');
  });

  it('handles negative and float values', () => {
    const src = 'let p = [0, 0] // [xy]';
    const out = updatePointParameter(src, 1, 'p', -3.5, 1.25);
    expect(out).toBe('let p = [-3.5, 1.25] // [xy]');
  });

  it('formats whole-number floats without decimal point', () => {
    const src = 'let p = [1.5, 2.5] // [xy]';
    const out = updatePointParameter(src, 1, 'p', 4.0, 6.0);
    expect(out).toBe('let p = [4, 6] // [xy]');
  });

  it('targets the correct line in multiline source', () => {
    const src = 'let a = [0, 0] // [xy]\nlet b = [5, 5] // [xy]\nlet c = [1, 1] // [xy]';
    const out = updatePointParameter(src, 2, 'b', 99, -99);
    expect(out).toBe('let a = [0, 0] // [xy]\nlet b = [99, -99] // [xy]\nlet c = [1, 1] // [xy]');
  });

  it('leaves source unchanged on out-of-range line', () => {
    const src = 'let p = [0, 0] // [xy]';
    expect(updatePointParameter(src, 99, 'p', 1, 2)).toBe(src);
  });
});

// ── projectPoint ──────────────────────────────────────────────────────────

describe('projectPoint', () => {
  // ── free ─────────────────────────────────────────────────────────────────
  it('free: point inside hoop is unchanged', () => {
    const region: XYRegion = { kind: 'free' };
    const p = projectPoint({ x: 10, y: -5 }, region);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(-5);
  });

  it('free: point outside hoop is pulled onto the rim', () => {
    const region: XYRegion = { kind: 'free' };
    const p = projectPoint({ x: 100, y: 0 }, region);
    expect(p.x).toBeCloseTo(47);
    expect(p.y).toBeCloseTo(0);
  });

  it('free: direction is preserved when projecting to rim', () => {
    const region: XYRegion = { kind: 'free' };
    const p = projectPoint({ x: 60, y: 60 }, region);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    expect(dist).toBeCloseTo(47);
    expect(p.x).toBeCloseTo(p.y); // 45° direction preserved
  });

  // ── rect ──────────────────────────────────────────────────────────────────
  it('rect: point inside is unchanged', () => {
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -5, maxY: 5 };
    const p = projectPoint({ x: 3, y: -2 }, region);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(-2);
  });

  it('rect: point outside is clamped', () => {
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -5, maxY: 5 };
    const p = projectPoint({ x: 15, y: -8 }, region);
    expect(p.x).toBe(10);
    expect(p.y).toBe(-5);
  });

  it('rect: point on boundary is unchanged', () => {
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -5, maxY: 5 };
    const p = projectPoint({ x: 10, y: 5 }, region);
    expect(p.x).toBe(10);
    expect(p.y).toBe(5);
  });

  // ── disc ──────────────────────────────────────────────────────────────────
  it('disc: point inside is unchanged', () => {
    const region: XYRegion = { kind: 'disc', cx: 0, cy: 0, radius: 20 };
    const p = projectPoint({ x: 5, y: 5 }, region);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
  });

  it('disc: point outside is pulled to rim', () => {
    const region: XYRegion = { kind: 'disc', cx: 0, cy: 0, radius: 10 };
    const p = projectPoint({ x: 20, y: 0 }, region);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
  });

  it('disc: projection preserves direction toward center', () => {
    const region: XYRegion = { kind: 'disc', cx: 5, cy: 5, radius: 10 };
    const p = projectPoint({ x: 50, y: 5 }, region);
    const dist = Math.sqrt((p.x - 5) ** 2 + (p.y - 5) ** 2);
    expect(dist).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(5); // horizontal direction preserved → same y as center
  });

  it('disc: non-centered disc projects correctly', () => {
    const region: XYRegion = { kind: 'disc', cx: 10, cy: 10, radius: 5 };
    const p = projectPoint({ x: 20, y: 10 }, region);
    expect(p.x).toBeCloseTo(15); // cx + radius in x-direction
    expect(p.y).toBeCloseTo(10);
  });

  // ── axis ──────────────────────────────────────────────────────────────────
  it('axis x: forces y to fixedCoord, clamps x to range', () => {
    const region: XYRegion = { kind: 'axis', axis: 'x', fixedCoord: 5, rangeMin: 0, rangeMax: 20 };
    const p = projectPoint({ x: 10, y: 99 }, region);
    expect(p.y).toBeCloseTo(5); // y fixed
    expect(p.x).toBeCloseTo(10); // x in range
  });

  it('axis x: clamps x below rangeMin', () => {
    const region: XYRegion = { kind: 'axis', axis: 'x', fixedCoord: 0, rangeMin: 5, rangeMax: 40 };
    const p = projectPoint({ x: -10, y: 0 }, region);
    expect(p.x).toBe(5);
  });

  it('axis x: clamps x above rangeMax', () => {
    const region: XYRegion = { kind: 'axis', axis: 'x', fixedCoord: 0, rangeMin: 5, rangeMax: 40 };
    const p = projectPoint({ x: 100, y: 0 }, region);
    expect(p.x).toBe(40);
  });

  it('axis y: forces x to fixedCoord, clamps y to range', () => {
    const region: XYRegion = {
      kind: 'axis',
      axis: 'y',
      fixedCoord: -8,
      rangeMin: -20,
      rangeMax: 20,
    };
    const p = projectPoint({ x: 99, y: 7 }, region);
    expect(p.x).toBeCloseTo(-8); // x fixed
    expect(p.y).toBeCloseTo(7); // y in range
  });

  it('axis: unbounded (Infinity) uses hoop chord at fixedCoord', () => {
    const region: XYRegion = {
      kind: 'axis',
      axis: 'x',
      fixedCoord: 0,
      rangeMin: -Infinity,
      rangeMax: Infinity,
    };
    // At y=0, chord half is 47 mm
    const p = projectPoint({ x: 100, y: 0 }, region);
    expect(p.x).toBeCloseTo(47);
  });

  // ── snap ──────────────────────────────────────────────────────────────────
  it('snap: applies after projection', () => {
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -10, maxY: 10 };
    const p = projectPoint({ x: 3.2, y: -4.7 }, region, 1);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(-5);
  });

  it('snap: re-projected result stays inside region', () => {
    // Choose a point that snaps beyond the boundary
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -10, maxY: 10 };
    const p = projectPoint({ x: 9.9, y: 0 }, region, 1);
    expect(p.x).toBeLessThanOrEqual(10);
  });
});

// ── sampleRegion ──────────────────────────────────────────────────────────

describe('sampleRegion', () => {
  const N = 200;
  // Deterministic mock RNG using a simple linear congruential generator
  function makeLCG(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0x100000000;
    };
  }

  it('free: all samples within 40 mm disc', () => {
    const rng = makeLCG(42);
    const region: XYRegion = { kind: 'free' };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, undefined, rng);
      expect(Math.sqrt(x * x + y * y)).toBeLessThanOrEqual(40 + 1e-9);
    }
  });

  it('rect: all samples within bounds', () => {
    const rng = makeLCG(7);
    const region: XYRegion = { kind: 'rect', minX: -30, maxX: 10, minY: -5, maxY: 15 };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, undefined, rng);
      expect(x).toBeGreaterThanOrEqual(-30 - 1e-9);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-5 - 1e-9);
      expect(y).toBeLessThanOrEqual(15 + 1e-9);
    }
  });

  it('disc: all samples within disc', () => {
    const rng = makeLCG(13);
    const region: XYRegion = { kind: 'disc', cx: 5, cy: -3, radius: 15 };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, undefined, rng);
      const dist = Math.sqrt((x - 5) ** 2 + (y + 3) ** 2);
      expect(dist).toBeLessThanOrEqual(15 + 1e-9);
    }
  });

  it('axis x: all samples on the axis segment', () => {
    const rng = makeLCG(99);
    const region: XYRegion = {
      kind: 'axis',
      axis: 'x',
      fixedCoord: 10,
      rangeMin: -20,
      rangeMax: 20,
    };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, undefined, rng);
      expect(y).toBeCloseTo(10);
      expect(x).toBeGreaterThanOrEqual(-20 - 1e-9);
      expect(x).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it('axis y: all samples on the axis segment', () => {
    const rng = makeLCG(55);
    const region: XYRegion = { kind: 'axis', axis: 'y', fixedCoord: -5, rangeMin: 0, rangeMax: 30 };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, undefined, rng);
      expect(x).toBeCloseTo(-5);
      expect(y).toBeGreaterThanOrEqual(0 - 1e-9);
      expect(y).toBeLessThanOrEqual(30 + 1e-9);
    }
  });

  it('snap: snapped samples stay inside region', () => {
    const rng = makeLCG(77);
    const region: XYRegion = { kind: 'rect', minX: -10, maxX: 10, minY: -10, maxY: 10 };
    for (let i = 0; i < N; i++) {
      const { x, y } = sampleRegion(region, 1, rng);
      expect(x).toBeGreaterThanOrEqual(-10 - 1e-9);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-10 - 1e-9);
      expect(y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

// ── parsePresets — bracket-aware splitting ─────────────────────────────────

describe('parsePresets — point values', () => {
  it('parses a point value in a preset', () => {
    const src = '// @preset Stem : anchor=[0,26]';
    const presets = parsePresets(src);
    expect(presets).toHaveLength(1);
    expect(presets[0].values['anchor']).toEqual([0, 26]);
  });

  it('parses mixed scalar and point values', () => {
    const src = '// @preset Tall Stem : anchor=[0,26], tip=[22,0], layers=8';
    const presets = parsePresets(src);
    expect(presets[0].values['anchor']).toEqual([0, 26]);
    expect(presets[0].values['tip']).toEqual([22, 0]);
    expect(presets[0].values['layers']).toBe(8);
  });

  it('scalar-only preset is byte-identical to previous behaviour', () => {
    const src = '// @preset Dense Rosette : bigR=100, rollR=63, pen=50';
    const presets = parsePresets(src);
    expect(presets[0].values).toEqual({ bigr: 100, rollr: 63, pen: 50 });
  });

  it('parses negative coordinates in point values', () => {
    const src = '// @preset P : pt=[-5,-10]';
    const presets = parsePresets(src);
    expect(presets[0].values['pt']).toEqual([-5, -10]);
  });

  it('parses fractional coordinates in point values', () => {
    const src = '// @preset P : pt=[1.5,-0.25]';
    const presets = parsePresets(src);
    expect(presets[0].values['pt']).toEqual([1.5, -0.25]);
  });

  it('handles spaces around brackets and commas', () => {
    const src = '// @preset P : pt=[ 3 , 7 ]';
    const presets = parsePresets(src);
    expect(presets[0].values['pt']).toEqual([3, 7]);
  });

  it('ignores malformed point values (missing second coord)', () => {
    // [5] is malformed — pt is skipped; n is still parsed
    const src = '// @preset P : pt=[5], n=3';
    const presets = parsePresets(src);
    expect(presets[0].values['pt']).toBeUndefined();
    expect(presets[0].values['n']).toBe(3);
  });
});
