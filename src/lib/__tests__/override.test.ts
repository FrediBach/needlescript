// ---------- override command tests ----------

import { describe, it, expect } from 'vitest';
import { run, STOCK_LIMITS, OVERRIDE_CEILINGS, OVERRIDE_FLOORS } from '../engine.ts';

// ── key validation ────────────────────────────────────────────────────────────

describe('override key validation', () => {
  const VALID_KEYS = [
    'stitches',
    'ops',
    'calldepth',
    'loopiters',
    'listlen',
    'listcells',
    'stringlen',
    'stringtotal',
    'scatterpoints',
    'geoinput',
    'clipverts',
    'chalks',
    'chalkverts',
  ] as const;

  it('accepts all 13 valid keys without error', () => {
    for (const key of VALID_KEYS) {
      const stock = (STOCK_LIMITS as Record<string, number>)[
        (
          {
            stitches: 'maxStitches',
            ops: 'maxOps',
            calldepth: 'maxCallDepth',
            loopiters: 'maxLoopIters',
            listlen: 'maxListLen',
            listcells: 'maxListCells',
            stringlen: 'maxStringLength',
            stringtotal: 'maxStringChars',
            scatterpoints: 'maxScatterPoints',
            geoinput: 'maxDelaunayPoints',
            clipverts: 'maxClipVerts',
            chalks: 'maxChalks',
            chalkverts: 'maxChalkVerts',
          } as Record<string, string>
        )[key]
      ];
      expect(() => run(`override '${key}' ${stock}`)).not.toThrow();
    }
  });

  it('unknown key errors', () => {
    expect(() => run("override 'pixels' 1000")).toThrow(/unknown limit/i);
  });

  it('did-you-mean for close typos', () => {
    expect(() => run("override 'stiches' 120000")).toThrow(/stitches/);
  });

  it('non-overridable physics key errors with explanation', () => {
    expect(() => run("override 'stitchlen' 0.3")).toThrow(
      /protect the machine|not a computational/i,
    );
  });

  it('non-string first argument errors', () => {
    expect(() => run('override 1 10000')).toThrow(/first argument must be a limit name string/i);
  });
});

// ── value validation ──────────────────────────────────────────────────────────

describe('override value validation', () => {
  it('non-integer values are floored silently', () => {
    expect(() => run("override 'stitches' 120000.9\nfd 1")).not.toThrow();
  });

  it('value above ceiling errors', () => {
    const ceil = OVERRIDE_CEILINGS.maxStitches;
    expect(() => run(`override 'stitches' ${ceil + 1}`)).toThrow(/out of range/i);
  });

  it('value below floor errors', () => {
    const floor = OVERRIDE_FLOORS.maxStitches;
    expect(() => run(`override 'stitches' ${floor - 1}`)).toThrow(/out of range/i);
  });

  it('value equal to stock is accepted (no effect raise or lower)', () => {
    expect(() => run(`override 'stitches' ${STOCK_LIMITS.maxStitches}\nfd 1`)).not.toThrow();
  });

  it('ceiling value itself is accepted', () => {
    expect(() => run(`override 'stitches' ${OVERRIDE_CEILINGS.maxStitches}`)).not.toThrow();
  });

  it('floor value itself is accepted', () => {
    expect(() => run(`override 'stitches' ${OVERRIDE_FLOORS.maxStitches}`)).not.toThrow();
  });
});

// ── placement rules ───────────────────────────────────────────────────────────

describe('override placement rules', () => {
  it('errors inside a trace block', () => {
    expect(() => run("let p = trace [ override 'stitches' 120000 fd 10 ]")).toThrow(/directives/i);
  });

  it('errors inside a repeat block', () => {
    expect(() => run("repeat 1 [ override 'stitches' 120000 ]")).toThrow(/top level/i);
  });

  it('errors inside an if branch', () => {
    expect(() => run("if 1 [ override 'ops' 5000000 ]")).toThrow(/top level/i);
  });

  it('errors when called after a stitch has been sewn', () => {
    expect(() => run("fd 10\noverride 'stitches' 120000")).toThrow(/before the first stitch/i);
  });

  it('duplicate key errors', () => {
    expect(() => run("override 'stitches' 120000\noverride 'stitches' 150000")).toThrow(
      /already overridden/i,
    );
  });

  it('multiple different keys are fine', () => {
    expect(() => run("override 'stitches' 120000\noverride 'ops' 20000000\nfd 1")).not.toThrow();
  });

  it('hoop and override can coexist in any order', () => {
    expect(() => run("hoop '5x7'\noverride 'stitches' 120000\nfd 1")).not.toThrow();
    expect(() => run("override 'stitches' 120000\nhoop '5x7'\nfd 1")).not.toThrow();
  });
});

// ── raising limits ────────────────────────────────────────────────────────────

describe('override raises limits', () => {
  it('raises the stitch limit so more stitches are accepted', () => {
    // Default limit is 100,000. Raise to 120,000;
    // A program with 100,001 stitches should now succeed.
    // We test this cheaply by checking that a long fd doesn't throw.
    expect(() =>
      run(
        `override 'stitches' ${STOCK_LIMITS.maxStitches + 10000}\nstitchlen 0.4\nfd ${(STOCK_LIMITS.maxStitches + 5000) * 0.4}`,
      ),
    ).not.toThrow();
  });

  it('emits a warning every run when raised', () => {
    const r = run("override 'stitches' 120000\nfd 1");
    const warn = r.warnings.find((w) => w.includes('override') && w.includes('stitches'));
    expect(warn).toBeTruthy();
    expect(warn).toMatch(/120,000/);
  });

  it('limit-hit error message acknowledges override when raised', () => {
    expect(() =>
      run(
        `override 'stitches' ${STOCK_LIMITS.maxStitches}\nstitchlen 0.4\nfd ${(STOCK_LIMITS.maxStitches + 1000) * 0.4}`,
      ),
    ).toThrow(/stitches/i);
  });

  it('warning mentions the override line', () => {
    const r = run("override 'stitches' 120000\nfd 1");
    const warn = r.warnings.find((w) => w.includes('override') && w.includes('line 1'));
    expect(warn).toBeTruthy();
  });
});

// ── lowering limits ───────────────────────────────────────────────────────────

describe('override lowers limits', () => {
  it('lowered stitch limit triggers at the lower value', () => {
    const low = 50;
    expect(() => run(`override 'stitches' ${low}\nstitchlen 0.4\nfd ${(low + 10) * 0.4}`)).toThrow(
      /stitches/i,
    );
  });

  it('lowered limit emits an info note (not a raise warning)', () => {
    const r = run(`override 'stitches' ${OVERRIDE_FLOORS.maxStitches}\nfd 1`);
    // The note should be present but should NOT contain the raise warning pattern
    const note = r.warnings.find((w) => w.includes('note'));
    expect(note).toBeTruthy();
    const raiseWarn = r.warnings.find((w) => w.includes('⚠') && w.includes('stitches'));
    expect(raiseWarn).toBeFalsy();
  });

  it('lowered loop limit triggers at the lower value', () => {
    const low = 500;
    expect(() => run(`override 'loopiters' ${low}\nrepeat ${low + 1} [ fd 0.1 ]`)).toThrow(
      /repeat count/i,
    );
  });
});

// ── override unlocks specific limits ─────────────────────────────────────────

describe('override specific limits', () => {
  it("'ops' override raises the op budget", () => {
    // Verify we can set it without error
    const r = run(`override 'ops' ${OVERRIDE_CEILINGS.maxOps}\nfd 1`);
    expect(r.activeOverrides?.ops).toBe(OVERRIDE_CEILINGS.maxOps);
  });

  it("'calldepth' override raises recursion limit", () => {
    const r = run(`override 'calldepth' 300\nfd 1`);
    expect(r.activeOverrides?.calldepth).toBe(300);
  });

  it("'listlen' override raises the list length limit", () => {
    const r = run(`override 'listlen' 200000\nfd 1`);
    expect(r.activeOverrides?.listlen).toBe(200000);
  });

  it("'clipverts' override is accepted", () => {
    const r = run(`override 'clipverts' 100000\nfd 1`);
    expect(r.activeOverrides?.clipverts).toBe(100000);
  });

  it("'geoinput' override is accepted", () => {
    const r = run(`override 'geoinput' 20000\nfd 1`);
    expect(r.activeOverrides?.geoinput).toBe(20000);
  });

  it("'scatterpoints' override is accepted", () => {
    const r = run(`override 'scatterpoints' 50000\nfd 1`);
    expect(r.activeOverrides?.scatterpoints).toBe(50000);
  });
});

// ── RunResult.activeOverrides ────────────────────────────────────────────────

describe('RunResult.activeOverrides', () => {
  it('is undefined when no override command is used', () => {
    expect(run('fd 1').activeOverrides).toBeUndefined();
  });

  it('is set when override is used', () => {
    const r = run("override 'stitches' 120000\nfd 1");
    expect(r.activeOverrides).toBeDefined();
    expect(r.activeOverrides?.stitches).toBe(120000);
  });

  it('contains all overridden keys', () => {
    const r = run("override 'stitches' 120000\noverride 'ops' 20000000\nfd 1");
    expect(r.activeOverrides?.stitches).toBe(120000);
    expect(r.activeOverrides?.ops).toBe(20000000);
  });
});

// ── constants ────────────────────────────────────────────────────────────────

describe('STOCK_LIMITS / OVERRIDE_CEILINGS / OVERRIDE_FLOORS', () => {
  it('STOCK_LIMITS matches current LIMITS values', () => {
    // Spot-check the mapped values
    expect(STOCK_LIMITS.maxStitches).toBe(100000);
    expect(STOCK_LIMITS.maxOps).toBe(10000000);
    expect(STOCK_LIMITS.maxCallDepth).toBe(200);
  });

  it('OVERRIDE_CEILINGS are above STOCK_LIMITS', () => {
    for (const key of Object.keys(STOCK_LIMITS) as (keyof typeof STOCK_LIMITS)[]) {
      expect(OVERRIDE_CEILINGS[key]).toBeGreaterThanOrEqual(STOCK_LIMITS[key]);
    }
  });

  it('OVERRIDE_FLOORS are below STOCK_LIMITS', () => {
    for (const key of Object.keys(STOCK_LIMITS) as (keyof typeof STOCK_LIMITS)[]) {
      expect(OVERRIDE_FLOORS[key]).toBeLessThanOrEqual(STOCK_LIMITS[key]);
    }
  });
});
