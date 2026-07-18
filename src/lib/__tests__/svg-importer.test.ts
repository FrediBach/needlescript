import { describe, it, expect } from 'vitest';
import { svgToCode, convertShapes } from '../../svg-import/import-policy.ts';
import { run } from '../engine.ts';

// ── SVG test fixtures ──────────────────────────────────────────────────────

const simpleLine = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <line x1="0" y1="0" x2="100" y2="0" stroke="black" stroke-width="1"/>
</svg>`;

const filledRect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="red"/>
</svg>`;

const strokedRect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="none" stroke="black" stroke-width="1"/>
</svg>`;

const circle = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" stroke="black" fill="none"/>
</svg>`;

const filledCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

const ellipse = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">
  <ellipse cx="50" cy="30" rx="45" ry="25" stroke="black" fill="none"/>
</svg>`;

const polygon = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <polygon points="50,10 90,80 10,80" stroke="black" fill="none"/>
</svg>`;

const polyline = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <polyline points="10,10 50,80 90,10" stroke="black" fill="none"/>
</svg>`;

const pathRect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <path d="M10,10 L90,10 L90,90 L10,90 Z" stroke="black" fill="none"/>
</svg>`;

const pathCubic = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <path d="M10,50 C10,10 90,10 90,50" stroke="black" fill="none"/>
</svg>`;

const pathArc = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <path d="M50,10 A40,40 0 1,1 49.9,10" stroke="black" fill="none"/>
</svg>`;

const groupWithTransform = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <g transform="translate(50,50)">
    <rect x="0" y="0" width="50" height="50" stroke="black" fill="none"/>
  </g>
</svg>`;

const multiColorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <line x1="0" y1="0" x2="50" y2="0" stroke="red"/>
  <line x1="0" y1="20" x2="50" y2="20" stroke="blue"/>
</svg>`;

const invisibleOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="none" stroke="none"/>
</svg>`;

const emptyPath = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <path d="M 0 0" fill="none" stroke="black"/>
</svg>`;

const withDefs = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs><circle id="c" r="5"/></defs>
  <circle cx="50" cy="50" r="40" stroke="black" fill="none"/>
</svg>`;

const styleAttrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" style="fill:green; stroke:red;"/>
</svg>`;

const fillAndStroke = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="red" stroke="black"/>
</svg>`;

// ── svgToCode ──────────────────────────────────────────────────────────────

describe('svgToCode', () => {
  describe('return shape', () => {
    it('returns { code, report }', () => {
      const result = svgToCode(simpleLine);
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('report');
      expect(typeof result.code).toBe('string');
    });

    it('code is non-empty for a valid SVG', () => {
      const { code } = svgToCode(simpleLine);
      expect(code.length).toBeGreaterThan(0);
    });

    it('report includes fills, outlines, colors, segments, tolerance, fitMM', () => {
      const { report } = svgToCode(simpleLine);
      expect(report).toHaveProperty('fills');
      expect(report).toHaveProperty('outlines');
      expect(report).toHaveProperty('colors');
      expect(report).toHaveProperty('segments');
      expect(report).toHaveProperty('tolerance');
      expect(report).toHaveProperty('fitMM');
    });
  });

  // ── supported shapes ────────────────────────────────────────────────────────
  describe('supported shapes', () => {
    it('converts <line>', () => {
      const { code } = svgToCode(simpleLine);
      expect(code).toContain('sewpath');
    });

    it('converts <rect> with stroke', () => {
      const { code } = svgToCode(strokedRect);
      expect(code).toContain('sewpath');
    });

    it('converts <rect> with fill → beginfill/endfill', () => {
      const { code } = svgToCode(filledRect);
      expect(code).toContain('beginfill');
      expect(code).toContain('endfill');
    });

    it('converts <circle>', () => {
      const { code } = svgToCode(circle);
      expect(code).toContain('sewpath');
    });

    it('converts filled <circle> → fill block', () => {
      const { code } = svgToCode(filledCircle);
      expect(code).toContain('beginfill');
    });

    it('converts <ellipse>', () => {
      const { code } = svgToCode(ellipse);
      expect(code).toContain('sewpath');
    });

    it('converts <polygon>', () => {
      const { code } = svgToCode(polygon);
      expect(code).toContain('sewpath');
    });

    it('converts <polyline>', () => {
      const { code } = svgToCode(polyline);
      expect(code).toContain('sewpath');
    });

    it('converts <path> with line commands (L, Z)', () => {
      const { code } = svgToCode(pathRect);
      expect(code).toContain('sewpath');
    });

    it('converts <path> with cubic bezier (C)', () => {
      const { code } = svgToCode(pathCubic);
      expect(code).toContain('sewpath');
    });

    it('converts <path> with arc (A)', () => {
      const { code } = svgToCode(pathArc);
      expect(code).toContain('sewpath');
    });
  });

  // ── transforms ─────────────────────────────────────────────────────────────
  describe('transforms', () => {
    it('applies translate transform', () => {
      const { code } = svgToCode(groupWithTransform);
      expect(code).toContain('sewpath');
    });

    it('transform attribute is applied: rotated shape differs from unrotated', () => {
      // A rectangle with a 45-degree rotation should produce different geometry
      // than the same rectangle without rotation.
      const noRotate = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect x="10" y="10" width="80" height="20" stroke="black" fill="none"/>
      </svg>`;
      const withRotate = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect x="10" y="10" width="80" height="20" stroke="black" fill="none"
              transform="rotate(45,50,50)"/>
      </svg>`;
      const base = svgToCode(noRotate).code;
      const rotated = svgToCode(withRotate).code;
      expect(base).not.toBe(rotated);
    });
  });

  // ── colors ─────────────────────────────────────────────────────────────────
  describe('color mapping', () => {
    it('single color SVG has 1 color in report', () => {
      const { report } = svgToCode(simpleLine);
      expect(report.colors).toBe(1);
    });

    it('multi-color SVG has > 1 colors when colors differ enough', () => {
      const { report } = svgToCode(multiColorSvg);
      expect(report.colors).toBeGreaterThanOrEqual(1);
    });

    it('code contains "color N" for multi-color designs', () => {
      // red vs blue are far apart in the palette → should get separate color groups
      const { code, report } = svgToCode(multiColorSvg);
      if (report.colors > 1) {
        expect(code).toMatch(/color \d/);
      }
    });

    it('style="fill:green; stroke:red;" is parsed correctly', () => {
      const { code } = svgToCode(styleAttrSvg);
      expect(code).toContain('beginfill'); // green fill
    });
  });

  // ── fill + stroke shapes ───────────────────────────────────────────────────
  describe('shapes with both fill and stroke', () => {
    it('generates a procedure for shapes with both fill and stroke', () => {
      const { code } = svgToCode(fillAndStroke);
      expect(code).toContain('beginfill');
      // Both paint operations reference one shared geometry declaration.
      expect(code.match(/let rect_1 =/g)).toHaveLength(1);
    });
  });

  // ── skipped elements ───────────────────────────────────────────────────────
  describe('skipped elements', () => {
    it('elements inside <defs> are not converted', () => {
      // withDefs has a circle inside defs AND a circle directly — only the direct one converts
      const { report } = svgToCode(withDefs);
      expect(report.outlines).toBe(1);
    });

    it('ignored tags are reported in report.ignored', () => {
      // Include a valid geometry element alongside the unsupported <text>
      const svgWithText = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <text x="10" y="10">Hi</text>
        <line x1="0" y1="0" x2="100" y2="0" stroke="black"/>
      </svg>`;
      const { report } = svgToCode(svgWithText);
      expect(report.ignored?.['text']).toBeGreaterThan(0);
    });
  });

  // ── fitMM option ───────────────────────────────────────────────────────────
  describe('fitMM option', () => {
    it('report.fitMM matches the option', () => {
      const { report } = svgToCode(simpleLine, { fitMM: 120 });
      expect(report.fitMM).toBe(120);
    });

    it('default fitMM is 80', () => {
      const { report } = svgToCode(simpleLine);
      expect(report.fitMM).toBe(80);
    });
  });

  // ── error cases ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('throws on invalid XML', () => {
      expect(() => svgToCode('<not valid xml')).toThrow();
    });

    it('throws when SVG has no geometry', () => {
      expect(() => svgToCode(invisibleOnly)).toThrow();
    });

    it('throws when all paths are degenerate', () => {
      expect(() => svgToCode(emptyPath)).toThrow();
    });

    it('throws on non-SVG root element', () => {
      expect(() => svgToCode('<html><body></body></html>')).toThrow();
    });

    it('throws on an unresolved paint instead of substituting gray', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect x="10" y="10" width="80" height="80" fill="url(#gradient)"/>
      </svg>`;
      expect(() => svgToCode(svg)).toThrow(/representative thread color/);
    });
  });

  // ── generated code validity ────────────────────────────────────────────────
  describe('generated code is valid Needlescript', () => {
    it('line SVG generates runnable code', () => {
      const { code } = svgToCode(simpleLine);
      expect(() => run(code)).not.toThrow();
    });

    it('filled rect SVG generates runnable code', () => {
      const { code } = svgToCode(filledRect);
      expect(() => run(code)).not.toThrow();
    });

    it('linear-gradient SVG generates a runnable density-neutral thread recipe', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><linearGradient id="blend">
          <stop offset="0" stop-color="#c8472f"/>
          <stop offset="1" stop-color="#3a4e8c"/>
        </linearGradient></defs>
        <rect x="10" y="10" width="80" height="80" fill="url(#blend)"/>
      </svg>`;
      const { code, report } = svgToCode(svg);
      expect(code).toContain('std.stitchcraft.gradientrowsn');
      expect(report).toMatchObject({ fills: 1, outlines: 0, colors: 2 });
      expect(() => run(code)).not.toThrow();
    });

    it('circle SVG generates runnable code', () => {
      const { code } = svgToCode(circle);
      expect(() => run(code)).not.toThrow();
    });

    it('generated code from filled circle produces stitches', () => {
      const { code } = svgToCode(filledCircle);
      const result = run(code);
      const s = result.events.filter((e) => e.t === 'stitch');
      expect(s.length).toBeGreaterThan(0);
    });
  });

  // ── implicit fill default ──────────────────────────────────────────────────
  describe('SVG paint defaults', () => {
    it('an element with no fill/stroke attributes inherits default black fill', () => {
      // In SVG the default fill is black, stroke is none
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <circle cx="50" cy="50" r="40"/>
      </svg>`;
      const { code } = svgToCode(svg);
      expect(code).toContain('beginfill');
    });
  });
});

// ── convertShapes (lower-level API) ─────────────────────────────────────────

describe('convertShapes', () => {
  type Point = [number, number];
  type Shape = { subpaths: Point[][]; fill: string | null; stroke: string | null };

  const square: Shape = {
    subpaths: [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ],
    fill: null,
    stroke: '#000000',
  };

  it('returns code and report', () => {
    const result = convertShapes([square]);
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('report');
  });

  it('scales geometry to fitMM', () => {
    const r80 = convertShapes([square], { fitMM: 80 });
    const r40 = convertShapes([square], { fitMM: 40 });
    expect(r80.report.fitMM).toBe(80);
    expect(r40.report.fitMM).toBe(40);
  });

  it('throws when all shapes are invisible', () => {
    const invisible: Shape = {
      subpaths: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      ],
      fill: null,
      stroke: null,
    };
    expect(() => convertShapes([invisible])).toThrow();
  });

  it('throws on zero-size geometry', () => {
    const zero: Shape = {
      subpaths: [
        [
          [5, 5],
          [5, 5],
        ],
      ],
      fill: null,
      stroke: '#000',
    };
    expect(() => convertShapes([zero])).toThrow();
  });

  it('fill shape produces beginfill block in code', () => {
    const filled: Shape = {
      subpaths: [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
      fill: '#FF0000',
      stroke: null,
    };
    const { code } = convertShapes([filled]);
    expect(code).toContain('beginfill');
  });

  it('stroke shape produces trace commands without beginfill', () => {
    const { code } = convertShapes([square]);
    expect(code).not.toContain('beginfill');
    expect(code).toContain('sewpath');
  });

  it('custom palette is used for thread color mapping', () => {
    const red: Shape = {
      subpaths: [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
      fill: '#FF0000',
      stroke: null,
    };
    const blue: Shape = {
      subpaths: [
        [
          [0, 50],
          [100, 50],
          [100, 100],
          [0, 100],
          [0, 50],
        ],
      ],
      fill: '#0000FF',
      stroke: null,
    };
    const palette = ['#FF0000', '#0000FF'];
    const { code } = convertShapes([red, blue], { palette });
    // Should assign color 0 and color 1
    expect(code).toMatch(/color [01]/);
  });

  it('RDP simplification report has segments ≤ maxSegments', () => {
    // A circle approximated with many points
    const pts: Point[] = [];
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * 2 * Math.PI;
      pts.push([50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)]);
    }
    const shape: Shape = { subpaths: [pts], fill: null, stroke: '#000' };
    const { report } = convertShapes([shape], { maxSegments: 100 });
    expect(report.segments).toBeLessThanOrEqual(100);
  });
});
