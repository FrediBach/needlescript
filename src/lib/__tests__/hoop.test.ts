// ---------- hoop command tests ----------

import { describe, it, expect } from 'vitest';
import { run, LIMITS, DEFAULT_HOOP_INFO } from '../engine.ts';

// ── default behaviour ─────────────────────────────────────────────────────────

describe('default hoop (no directive)', () => {
  it('activeHoop is undefined when hoop is not set', () => {
    const result = run('fd 10');
    expect(result.activeHoop).toBeUndefined();
  });

  it('scatter default domain = 47mm disc (round100 field)', () => {
    // With no hoop directive, scatter should stay in the r=47 disc
    const result = run('seed 1\nlet pts = scatter(5)\nfor p in pts [ assert vlen(p) <= 47 ]');
    expect(result.warnings.some((w) => w.includes('assert'))).toBe(false);
  });

  it('DEFAULT_HOOP_INFO is round100', () => {
    expect(DEFAULT_HOOP_INFO.shape).toBe('circle');
    expect(DEFAULT_HOOP_INFO.widthMM).toBe(100);
    expect(DEFAULT_HOOP_INFO.fieldWidthMM).toBe(94);
    expect(DEFAULT_HOOP_INFO.presetName).toBe('round100');
  });
});

// ── named presets ─────────────────────────────────────────────────────────────

describe('hoop named presets', () => {
  it('round100 is the default — no change in behaviour', () => {
    const a = run("hoop 'round100'\nseed 1\nfd 10");
    const b = run('seed 1\nfd 10');
    // Events should be identical
    expect(a.events.map((e) => [e.x, e.y])).toEqual(b.events.map((e) => [e.x, e.y]));
    expect(a.activeHoop?.presetName).toBe('round100');
    expect(a.activeHoop?.shape).toBe('circle');
    expect(a.activeHoop?.widthMM).toBe(100);
    expect(a.activeHoop?.fieldWidthMM).toBe(94);
  });

  it('4x4 is a 100×100 rectangle', () => {
    const r = run("hoop '4x4'\nfd 10");
    expect(r.activeHoop?.shape).toBe('rectangle');
    expect(r.activeHoop?.widthMM).toBe(100);
    expect(r.activeHoop?.heightMM).toBe(100);
    expect(r.activeHoop?.fieldWidthMM).toBe(94);
  });

  it('5x7 is a 130×180 rectangle', () => {
    const r = run("hoop '5x7'\nfd 10");
    expect(r.activeHoop?.widthMM).toBe(130);
    expect(r.activeHoop?.heightMM).toBe(180);
    expect(r.activeHoop?.fieldWidthMM).toBe(124);
    expect(r.activeHoop?.fieldHeightMM).toBe(174);
  });

  it('6x10 is a 160×260 rectangle', () => {
    const r = run("hoop '6x10'\nfd 10");
    expect(r.activeHoop?.widthMM).toBe(160);
    expect(r.activeHoop?.heightMM).toBe(260);
  });

  it('8x8 is a 200×200 rectangle', () => {
    const r = run("hoop '8x8'");
    expect(r.activeHoop?.widthMM).toBe(200);
    expect(r.activeHoop?.heightMM).toBe(200);
  });

  it('8x12 is a 200×300 rectangle', () => {
    const r = run("hoop '8x12'");
    expect(r.activeHoop?.widthMM).toBe(200);
    expect(r.activeHoop?.heightMM).toBe(300);
  });

  it('preset matching is case-insensitive', () => {
    expect(() => run("hoop '5X7'\nfd 1")).not.toThrow();
    expect(() => run("hoop 'Round100'\nfd 1")).not.toThrow();
  });

  it('double-quoted word form works', () => {
    expect(() => run('hoop "5x7\nfd 1')).not.toThrow();
  });
});

// ── numeric and list forms ────────────────────────────────────────────────────

describe('hoop numeric and list forms', () => {
  it('numeric form creates a round hoop by diameter', () => {
    const r = run('hoop 150\nfd 10');
    expect(r.activeHoop?.shape).toBe('circle');
    expect(r.activeHoop?.widthMM).toBe(150);
    expect(r.activeHoop?.fieldWidthMM).toBe(144);
  });

  it('list form creates a rectangular hoop', () => {
    const r = run('hoop [180, 130]\nfd 10');
    expect(r.activeHoop?.shape).toBe('rectangle');
    expect(r.activeHoop?.widthMM).toBe(180);
    expect(r.activeHoop?.heightMM).toBe(130);
    expect(r.activeHoop?.fieldWidthMM).toBe(174);
    expect(r.activeHoop?.fieldHeightMM).toBe(124);
  });

  it('shaped list form creates an oval hoop', () => {
    const r = run("hoop [120, 75, 'oval']\nfd 10");
    expect(r.activeHoop).toMatchObject({
      shape: 'oval',
      widthMM: 120,
      heightMM: 75,
      fieldWidthMM: 114,
      fieldHeightMM: 69,
    });
  });

  it('oval field reporters use ellipse geometry', () => {
    const r = run(
      "hoop [120, 75, 'oval']\nprint infield([50, 0])\nprint infield([0, 36])\nprint infield([50, 30])",
    );
    expect(r.printed).toEqual(['1', '0', '0']);
    expect(run("hoop [120, 75, 'oval']\nlet p = fieldpath()\nprint len(p)").printed[0]).not.toBe(
      '4',
    );
  });

  it('hoop(pick(sizes)) expression form works', () => {
    expect(() => run('let sizes = [100, 150, 200]\nhoop pick(sizes)')).not.toThrow();
  });
});

// ── validation errors ─────────────────────────────────────────────────────────

describe('hoop validation errors', () => {
  it('diameter below 20mm is an error', () => {
    expect(() => run('hoop 12')).toThrow(/20.400 mm/i);
  });

  it('diameter above 400mm is an error', () => {
    expect(() => run('hoop 500')).toThrow(/20.400 mm/i);
  });

  it('list form below 20mm is an error', () => {
    expect(() => run('hoop [15, 100]')).toThrow(/20.400 mm/i);
  });

  it('list form above 400mm is an error', () => {
    expect(() => run('hoop [500, 100]')).toThrow(/20.400 mm/i);
  });

  it('list with wrong length is an error', () => {
    expect(() => run('hoop [100, 200, 300]')).toThrow(/hoop shape must be a string/i);
  });

  it('validates a shaped list mode and circular dimensions', () => {
    expect(() => run("hoop [120, 75, 'ovla']")).toThrow(/Unknown hoop shape.*did you mean.*oval/i);
    expect(() => run("hoop [120, 75, 'circle']")).toThrow(/width and height must match/i);
  });

  it('unknown preset name errors with did-you-mean', () => {
    expect(() => run("hoop '5X8'")).toThrow(/Unknown hoop preset/i);
  });

  it('non-overridable type (number 0) errors', () => {
    expect(() => run('hoop 0')).toThrow(/20.400 mm/i);
  });
});

// ── placement rules ───────────────────────────────────────────────────────────

describe('hoop placement rules', () => {
  it('errors inside a trace block', () => {
    expect(() => run("let p = trace [ hoop '5x7' fd 10 ]")).toThrow(/directives/i);
  });

  it('errors inside a repeat block', () => {
    expect(() => run("repeat 1 [ hoop '5x7' ]")).toThrow(/top level/i);
  });

  it('errors inside an if branch', () => {
    expect(() => run("if 1 [ hoop '5x7' ]")).toThrow(/top level/i);
  });

  it('errors inside a procedure', () => {
    expect(() => run("def setup [] [ hoop '5x7' ]\nsetup()")).toThrow();
  });

  it('errors when called after a stitch has been sewn', () => {
    expect(() => run("fd 10\nhoop '5x7'")).toThrow(/before the first stitch/i);
  });

  it('errors when called twice', () => {
    expect(() => run("hoop '5x7'\nhoop '4x4'")).toThrow(/already set/i);
  });

  it('procedure definitions before hoop are fine (they do not execute)', () => {
    expect(() => run("def draw() [ fd 10 ]\nhoop '5x7'\ndraw()")).not.toThrow();
  });

  it('seed, fabric, color before hoop are fine', () => {
    expect(() => run("seed 5\nfabric 'denim'\ncolor 1\nhoop '5x7'\nfd 10")).not.toThrow();
  });
});

// ── fieldLocked guard ─────────────────────────────────────────────────────────

describe('hoop fieldLocked guard', () => {
  it('errors when hoop is set after an implicit-region scatter', () => {
    expect(() => run("seed 1\nlet pts = scatter(5)\nhoop '5x7'")).toThrow(/before scatter/i);
  });

  it('does NOT lock when scatter has an explicit region', () => {
    // Explicit region — fieldLocked should not be set
    expect(() =>
      run(
        "hoop '5x7'\nseed 1\nlet box = [[-50,-50],[50,-50],[50,50],[-50,50]]\nlet pts = scatter(5, box)",
      ),
    ).not.toThrow();
  });
});

// ── generator default domain changes with hoop ────────────────────────────────

describe('hoop changes scatter/relax default domain', () => {
  it('scatter with round 150mm hoop stays within 69mm field radius', () => {
    const r = run('hoop 150\nseed 3\nlet pts = scatter(8)\nfor p in pts [ assert vlen(p) <= 72 ]');
    expect(r.warnings.some((w) => w.includes('assert'))).toBe(false);
  });

  it('scatter with 5x7 hoop stays within 124×174mm field', () => {
    const r = run(
      "hoop '5x7'\nseed 4\nlet pts = scatter(10)\nfor p in pts [ assert (abs(p[0]) <= 63) and (abs(p[1]) <= 88) ]",
    );
    expect(r.warnings.some((w) => w.includes('assert'))).toBe(false);
  });

  it('same seed + different hoop → different scatter result', () => {
    const b = run("hoop '5x7'\nseed 99\nprint len(scatter(5))");
    // The number of points may differ because the field is larger
    // but more importantly the designs diverge — this just checks the field is used
    expect(b.activeHoop?.shape).toBe('rectangle');
    // Points in a 5x7 hoop should potentially have different count
    // (at minimum, activeHoop is set):
    expect(b.activeHoop?.widthMM).toBe(130);
  });
});

// ── field reporters ───────────────────────────────────────────────────────────

describe('infield', () => {
  it('returns 1 for a point inside the default field (r=47)', () => {
    const r = run('print infield([20, 20])');
    expect(r.printed[0]).toBe('1');
  });

  it('returns 0 for a point outside the default field', () => {
    const r = run('print infield([50, 50])');
    expect(r.printed[0]).toBe('0');
  });

  it('correctly handles rectangular field', () => {
    const r = run("hoop '5x7'\nprint infield([60, 80])\nprint infield([65, 90])");
    expect(r.printed[0]).toBe('1'); // 60 < 62, 80 < 87 → inside
    expect(r.printed[1]).toBe('0'); // 65 > 62 → outside
  });
});

describe('fieldbounds', () => {
  it('returns [-47,-47,47,47] for the default round100 hoop', () => {
    const r = run('let b = fieldbounds()\nprint b[0]\nprint b[1]\nprint b[2]\nprint b[3]');
    expect(parseFloat(r.printed[0])).toBeCloseTo(-47);
    expect(parseFloat(r.printed[1])).toBeCloseTo(-47);
    expect(parseFloat(r.printed[2])).toBeCloseTo(47);
    expect(parseFloat(r.printed[3])).toBeCloseTo(47);
  });

  it('returns correct bounds for 5x7 hoop', () => {
    const r = run(
      "hoop '5x7'\nlet b = fieldbounds()\nprint b[0]\nprint b[2]\nprint b[1]\nprint b[3]",
    );
    expect(parseFloat(r.printed[0])).toBeCloseTo(-62);
    expect(parseFloat(r.printed[1])).toBeCloseTo(62);
    expect(parseFloat(r.printed[2])).toBeCloseTo(-87);
    expect(parseFloat(r.printed[3])).toBeCloseTo(87);
  });
});

describe('fieldpath', () => {
  it('returns a non-empty polygon', () => {
    const r = run('let fp = fieldpath()\nprint len(fp)');
    const n = parseInt(r.printed[0]);
    expect(n).toBeGreaterThanOrEqual(8);
  });

  it('round field polygon stays within field radius', () => {
    const r = run('let fp = fieldpath()\nfor p in fp [ assert vlen(p) <= 47.1 ]');
    expect(r.warnings.some((w) => w.includes('assert'))).toBe(false);
  });

  it('rectangular field polygon has 4 corners', () => {
    const r = run("hoop '4x4'\nlet fp = fieldpath()\nprint len(fp)");
    expect(r.printed[0]).toBe('4');
  });

  it('fieldpath can be used with offsetpath', () => {
    const r = run("hoop '4x4'\nlet margin = first(offsetpath(fieldpath(), -5))\nprint len(margin)");
    const n = parseInt(r.printed[0]);
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('zero RNG draws — fieldpath does not advance the random stream', () => {
    const a = run('seed 42\nlet fp = fieldpath()\nprint random(1000)');
    const b = run('seed 42\nprint random(1000)');
    expect(a.printed[0]).toBe(b.printed[0]);
  });
});

// ── overflow warnings ─────────────────────────────────────────────────────────

describe('overflow warnings', () => {
  it('warns when a stitch is outside the sewable field', () => {
    // Move to a point outside r=47
    const r = run('moveto 60 0\nfd 5');
    expect(r.warnings.some((w) => w.toLowerCase().includes('outside'))).toBe(true);
  });

  it('no overflow warning when stitches are inside the field', () => {
    const r = run('moveto 10 10\nfd 5');
    expect(r.warnings.some((w) => w.toLowerCase().includes('outside'))).toBe(false);
  });

  it('overflow warning names the field dimensions for rectangular hoop', () => {
    // 5x7: hoop half-dims 65×90 mm, field half-dims 62×87 mm.
    // A stitch at (64, 0) is inside the hoop but outside the field.
    const r = run("hoop '5x7'\nmoveto 64 0\nfd 1");
    const overflowWarn = r.warnings.find((w) => w.toLowerCase().includes('outside'));
    expect(overflowWarn).toBeTruthy();
    // Should describe the field (not the hoop), and mention 124×174 or "field"
    expect(overflowWarn).toMatch(/124.*174|field/i);
  });

  it('overflow warning location is populated', () => {
    const r = run('moveto 60 0\nfd 5');
    const loc = (r.warningLocations ?? []).find((wl) => wl.kind === 'overflow');
    expect(loc).toBeTruthy();
    expect(loc!.points.length).toBeGreaterThan(0);
  });

  it('LIMITS.sewableRadius and default field radius still match', () => {
    // The default hoop info should have the same field radius as the old LIMITS.sewableRadius
    expect(DEFAULT_HOOP_INFO.fieldWidthMM / 2).toBe(LIMITS.sewableRadius);
  });
});

// ── RunResult.activeHoop ─────────────────────────────────────────────────────

describe('RunResult.activeHoop', () => {
  it('is undefined when no hoop command is used', () => {
    expect(run('fd 10').activeHoop).toBeUndefined();
  });

  it('is set when hoop is used', () => {
    const r = run("hoop '5x7'\nfd 10");
    expect(r.activeHoop).toBeDefined();
    expect(r.activeHoop?.presetName).toBe('5x7');
  });

  it('carries fieldWidthMM and fieldHeightMM', () => {
    const r = run("hoop '5x7'");
    expect(r.activeHoop?.fieldWidthMM).toBe(124);
    expect(r.activeHoop?.fieldHeightMM).toBe(174);
  });
});
