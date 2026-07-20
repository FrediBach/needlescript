import { NeedlescriptError } from '../core/errors.ts';
import { isFuncRef, isList, describeVal, formatNum, formatVal, num, isString } from './list.ts';
import type { Val } from './list.ts';
import type { ASTNode } from '../core/types.ts';
import type { OverrideKey } from '../core/types.ts';
import {
  LIMITS,
  STOCK_LIMITS,
  OVERRIDE_CEILINGS,
  OVERRIDE_FLOORS,
} from '../embroidery/machine/index.ts';
import type { BudgetKey } from '../embroidery/machine/index.ts';
import { QWORD_BUILTINS } from '../language/commands.ts';
import {
  EMBROIDERY_MODE_REGISTRIES,
  FABRIC_PROFILES,
  MATERIAL_RANGES,
  NEEDLE_SIZES,
  STABILIZER_PROFILES,
  THREAD_PROFILES,
} from '../embroidery/embroidery-registry.ts';
import type { FabricMode, FabricPreset } from '../embroidery/embroidery-registry.ts';
import {
  lookupHoopPreset,
  HOOP_PRESET_NAMES,
  HOOP_SHAPES,
  buildHoopInfo,
} from '../embroidery/hoop-presets.ts';
import type { HoopInfo } from '../core/types.ts';
import { makeRNG, makeNoise } from '../core/prng.ts';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { didYouMean } from '../core/suggestions.ts';
import { resolveMode, unknownModeMessage } from '../core/mode-registry.ts';
import type { RunContext } from './context.ts';
import { PLAN_MODES } from '../embroidery/travel-planner.ts';
import { PREFLIGHT_MODES } from '../embroidery/preflight.ts';
import { apply } from '../geometry/affine.ts';
import { inspectChalkValue } from './chalk.ts';
import type { ChalkStyle } from '../core/types.ts';
import { parseColorDetails } from '../core/colormath.ts';
import {
  FILL_UNDERLAY_MAX_PASSES,
  FILL_UNDERLAY_PASS_KINDS,
  FILL_UNDERLAY_RANGES,
  SATIN_UNDERLAY_MAX_PASSES,
  SATIN_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_RANGES,
} from '../embroidery/underlay-profile.ts';
import {
  FILL_CONSTRUCTION_RANGES,
  FILL_CONSTRUCTION_MODE_REGISTRIES,
} from '../embroidery/fill-profile.ts';
import {
  SATIN_CONSTRUCTION_MODE_REGISTRIES,
  SATIN_CONSTRUCTION_RANGES,
} from '../embroidery/satin-profile.ts';

/**
 * Handler for the `'cmd'` statement branch of execStmt. Returns a function
 * that processes a cmd-kind ASTNode, with already-evaluated arg values.
 *
 * `depth` is the call-stack depth at the time of the command (needed for
 * hoop/override top-level guards).
 */
export function initExecCmdHandler(
  ctx: RunContext,
): (st: ASTNode & { k: 'cmd' }, vals: Val[], depth: number) => void {
  return function execCmd(st, vals, depth) {
    if (st.name === 'print') {
      // Multi-arg call form: print(v1, v2, …) — concatenate renderings.
      // Classic form: print expr or print "label expr — single arg.
      const renderVal = (v: Val) => (isString(v) ? v : formatVal(v));
      if (st.args.length > 1) {
        // Variadic call form — no label, just concatenate
        ctx.printed.push(vals.map(renderVal).join(''));
      } else {
        ctx.printed.push((st.label ? st.label + ': ' : '') + renderVal(vals[0]));
      }
      return;
    }
    if (st.name === 'printloc') {
      // DX: printloc — logs local-frame needle position, like pos() formatted.
      ctx.printed.push(
        (st.label ?? 'loc') + ': [' + formatNum(ctx.m.x) + ', ' + formatNum(ctx.m.y) + ']',
      );
      return;
    }
    if (st.name === 'palette') {
      if (ctx.insideTrace > 0 || ctx.structuralDepth > 0 || depth > 0)
        throw new NeedlescriptError(
          'palette must be at the top level — put it near the top of the program',
          st.line,
        );
      if (ctx.m.started || ctx.colorOrStopLine !== undefined)
        throw new NeedlescriptError(
          'palette must run before the first stitch and before color or stop; move it to the top of the program',
          st.line,
        );
      if (ctx.paletteSetLine !== undefined)
        throw new NeedlescriptError(
          `palette already set on line ${ctx.paletteSetLine} — only one palette directive is allowed per program`,
          st.line,
        );
      const value = vals[0];
      if (!isList(value))
        throw new NeedlescriptError(
          `palette expects a list of colors, got ${describeVal(value)}`,
          st.line,
        );
      if (value.items.length < 1 || value.items.length > 64)
        throw new NeedlescriptError('palette needs 1–64 colors', st.line);
      ctx.palette = value.items.map((entry, index) => {
        if (typeof entry !== 'string')
          throw new NeedlescriptError(
            `palette entry ${index + 1} must be a color string, got ${describeVal(entry)}`,
            st.line,
          );
        const parsed = parseColorDetails(entry, st.line);
        return {
          slot: index + 1,
          hex: parsed.hex,
          ...(parsed.name ? { name: parsed.name } : {}),
          source: 'palette' as const,
          stitchCount: 0,
          pathLenMm: 0,
        };
      });
      ctx.paletteSetLine = st.line;
      return;
    }
    if (st.name === 'background') {
      if (ctx.insideTrace > 0 || ctx.structuralDepth > 0 || depth > 0)
        throw new NeedlescriptError(
          'background must be at the top level — put it near the top of the program',
          st.line,
        );
      if (ctx.m.started)
        throw new NeedlescriptError(
          'background must run before the first stitch; move it to the top of the program',
          st.line,
        );
      if (ctx.backgroundSetLine !== undefined)
        throw new NeedlescriptError(
          `background already set on line ${ctx.backgroundSetLine} — only one background directive is allowed per program`,
          st.line,
        );
      if (typeof vals[0] !== 'string')
        throw new NeedlescriptError(
          `background expects a color string, got ${describeVal(vals[0])}`,
          st.line,
        );
      ctx.background = parseColorDetails(vals[0], st.line).hex;
      ctx.backgroundSetLine = st.line;
      return;
    }
    if (st.name === 'color') {
      ctx.traceNote('color', 'note: color inside trace has no effect on the captured path');
      ctx.colorOrStopLine ??= st.line;
      const value = vals[0];
      if (typeof value === 'string') {
        const parsed = parseColorDetails(value, st.line);
        let index = ctx.palette.findIndex((slot) => slot.hex === parsed.hex);
        if (index < 0) {
          index = ctx.palette.length;
          ctx.palette.push({
            slot: index + 1,
            hex: parsed.hex,
            ...(parsed.name ? { name: parsed.name } : {}),
            source: 'auto',
            firstUseLine: st.line,
            stitchCount: 0,
            pathLenMm: 0,
          });
          ctx.m.warnings.push(
            `note: new thread slot ${index + 1} = '${parsed.hex}' (line ${st.line})`,
          );
        }
        ctx.usedColorIndices.add(index);
        ctx.m.colorChange(index);
        return;
      }
      const numeric = num(value, 'color', st.line);
      if (!Number.isInteger(numeric) || numeric < 0)
        throw new NeedlescriptError('color slot must be a non-negative integer', st.line);
      ctx.usedColorIndices.add(numeric);
      ctx.m.colorChange(numeric);
      return;
    }
    if (st.name === 'chalk') {
      const labelValue = vals[1];
      if (labelValue !== undefined && typeof labelValue !== 'string')
        throw new NeedlescriptError(
          `chalk label must be a string, got ${describeVal(labelValue)}`,
          st.line,
        );
      const styleValue = vals[2];
      if (styleValue !== undefined && typeof styleValue !== 'string')
        throw new NeedlescriptError(
          `chalk style must be a string, got ${describeVal(styleValue)}`,
          st.line,
        );
      const style = (styleValue ?? 'auto').toLowerCase();
      const styles: ChalkStyle[] = ['auto', 'dots', 'line'];
      if (!styles.includes(style as ChalkStyle))
        throw new NeedlescriptError(
          `chalk doesn't know style '${style}'${didYouMean(style, styles)} — expected 'auto', 'dots', or 'line'`,
          st.line,
        );
      const inspected = inspectChalkValue(vals[0], { mode: 'loud', line: st.line });
      if (!inspected) {
        ctx.m.warnings.push('chalk ignored an empty list');
        return;
      }
      if (ctx.chalk.length >= ctx.m.effectiveLimits.maxChalks)
        throw new NeedlescriptError(
          `chalks budget reached — ${ctx.m.effectiveLimits.maxChalks.toLocaleString('en-US')} overlays (use override 'chalks' N)`,
          st.line,
        );
      if (ctx.chalkVertices + inspected.vertexCount > ctx.m.effectiveLimits.maxChalkVerts)
        throw new NeedlescriptError(
          `chalkverts budget reached — ${ctx.m.effectiveLimits.maxChalkVerts.toLocaleString('en-US')} vertices (use override 'chalkverts' N)`,
          st.line,
        );
      ctx.tickN(inspected.vertexCount, st.line);
      ctx.chalkVertices += inspected.vertexCount;
      // Chalk follows only the affine CTM. Nonlinear warps and penetration
      // effects are deliberately excluded so this command remains drawless.
      const strokes = inspected.strokes.map((stroke) => ({
        ...stroke,
        vertices: stroke.vertices.map(([x, y]) => apply(ctx.m.ctm, x, y)),
      }));
      ctx.chalk.push({
        ...inspected,
        strokes,
        label: labelValue,
        style: style as ChalkStyle,
        sourceLine: st.line,
        sequence: ctx.chalk.length,
        stitchIndexAtEmit: 0,
        eventIndexAtEmit: ctx.m.events.length,
      });
      return;
    }
    // `satin @fn` — engage programmable satin reporter
    if (st.name === 'satin' && isFuncRef(vals[0])) {
      ctx.traceNote('satin', 'note: satin inside trace has no effect on the captured path');
      const ref = vals[0];
      ctx.applyShapeReporterArity(ref, st.line);
      ctx.m.flushSatin();
      ctx.m.satinReporter = (t, s, i, u) => ctx.applyShapeReporter(ref, t, s, i, u, st.line);
      ctx.m.mode = 'satin';
      if (ctx.m.satinSpacing !== 0.4 && !ctx.m.satinDensityNoted) {
        ctx.m.warnings.push(
          `density is ignored while satin @${ref.name} is engaged — the reporter's advance return controls penetration spacing`,
        );
        ctx.m.satinDensityNoted = true;
      }
      return;
    }
    // `stitchlen [list]` — list-cycling form (§4).
    // `stitchlen @fn` — reporter form (§5).
    if (st.name === 'stitchlen' && (isFuncRef(vals[0]) || isList(vals[0]))) {
      ctx.traceNote('stitchlen', 'note: stitchlen inside trace has no effect on the captured path');
      ctx.m.flushSatin(); // flushes running-stitch buffer too
      if (isFuncRef(vals[0])) {
        const ref = vals[0];
        ctx.applyStitchLenReporterArity(ref, st.line);
        ctx.m.stitchLenList = null;
        ctx.m.stitchLenListPhase = 0;
        ctx.m.stitchLenReporter = (t, s, i, p) =>
          ctx.applyStitchLenReporter(ref, t, s, i, p, st.line);
      } else {
        const raw = vals[0];
        if (raw.items.length === 0)
          throw new NeedlescriptError('stitchlen list must not be empty', st.line);
        const clamped: number[] = raw.items.map((el, idx) => {
          if (typeof el !== 'number' || isList(el))
            throw new NeedlescriptError(
              `stitchlen list element ${idx} must be a number, got ${describeVal(el)}`,
              st.line,
            );
          const v = el as number;
          if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
            ctx.m.warnings.push(
              `stitchlen list element ${idx} (${v}) clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm`,
            );
          return Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
        });
        const phase = vals.length > 1 ? Math.round(num(vals[1], 'stitchlen', st.line)) : 0;
        ctx.m.stitchLenReporter = null;
        ctx.m.stitchLenList = clamped;
        ctx.m.stitchLenListPhase = ((phase % clamped.length) + clamped.length) % clamped.length;
      }
      ctx.m.stitchLenStretchStart = true;
      ctx.m.stitchLenStretchIndex = 0;
      return;
    }
    // `filllen [list]` / `filllen @fn`
    if (st.name === 'filllen' && (isFuncRef(vals[0]) || isList(vals[0]))) {
      ctx.traceNote('filllen', 'note: filllen inside trace has no effect on the captured path');
      if (isFuncRef(vals[0])) {
        const ref = vals[0];
        ctx.applyFillLenReporterArity(ref, st.line);
        ctx.m.fillLenList = null;
        ctx.m.fillLenListPhase = 0;
        ctx.m.fillLen = null;
        ctx.m.fillLenReporter = (t, s, i, p) => ctx.applyFillLenReporter(ref, t, s, i, p, st.line);
      } else {
        const raw = vals[0];
        if (raw.items.length === 0)
          throw new NeedlescriptError('filllen list must not be empty', st.line);
        const FILL_MIN = 1,
          FILL_MAX = 7;
        const clamped: number[] = raw.items.map((el, idx) => {
          if (typeof el !== 'number' || isList(el))
            throw new NeedlescriptError(
              `filllen list element ${idx} must be a number, got ${describeVal(el)}`,
              st.line,
            );
          const v = el as number;
          if (v < FILL_MIN || v > FILL_MAX)
            ctx.m.warnings.push(
              `filllen list element ${idx} (${v}) clamped to ${Math.min(Math.max(v, FILL_MIN), FILL_MAX)} mm`,
            );
          return Math.min(Math.max(v, FILL_MIN), FILL_MAX);
        });
        const phase = vals.length > 1 ? Math.round(num(vals[1], 'filllen', st.line)) : 0;
        ctx.m.fillLenReporter = null;
        ctx.m.fillLen = null;
        ctx.m.fillLenList = clamped;
        ctx.m.fillLenListPhase = ((phase % clamped.length) + clamped.length) % clamped.length;
      }
      return;
    }
    if (st.name === 'underlaypasses') {
      ctx.traceNote(
        'underlaypasses',
        'note: underlaypasses inside trace has no effect on the captured path',
      );
      const value = vals[0];
      if (!isList(value))
        throw new NeedlescriptError(
          `underlaypasses expects a list of pass names, got ${describeVal(value)} — e.g. underlaypasses ['center', 'edge']`,
          st.line,
        );
      if (value.items.length > SATIN_UNDERLAY_MAX_PASSES)
        throw new NeedlescriptError(
          `underlaypasses accepts at most ${SATIN_UNDERLAY_MAX_PASSES} passes`,
          st.line,
        );
      const passKinds = value.items.map((entry, index) => {
        if (typeof entry !== 'string')
          throw new NeedlescriptError(
            `underlaypasses entry ${index + 1} must be a pass name string, got ${describeVal(entry)}`,
            st.line,
          );
        const pass = resolveMode(entry, SATIN_UNDERLAY_PASS_KINDS);
        if (pass === undefined)
          throw new NeedlescriptError(
            `underlaypasses entry ${index + 1}: ${unknownModeMessage('underlay pass', entry, SATIN_UNDERLAY_PASS_KINDS)}`,
            st.line,
          );
        return pass;
      });
      ctx.m.flushSatin();
      ctx.m.satinUnderlayCustomization = {
        ...ctx.m.satinUnderlayCustomization,
        passKinds,
      };
      return;
    }
    if (st.name === 'fillunderlaypasses') {
      ctx.traceNote(
        'fillunderlaypasses',
        'note: fillunderlaypasses inside trace has no effect on the captured path',
      );
      const value = vals[0];
      if (!isList(value))
        throw new NeedlescriptError(
          `fillunderlaypasses expects a list of pass names, got ${describeVal(value)} — e.g. fillunderlaypasses ['edge', 'tatami']`,
          st.line,
        );
      if (value.items.length > FILL_UNDERLAY_MAX_PASSES)
        throw new NeedlescriptError(
          `fillunderlaypasses accepts at most ${FILL_UNDERLAY_MAX_PASSES} passes`,
          st.line,
        );
      const passKinds = value.items.map((entry, index) => {
        if (typeof entry !== 'string')
          throw new NeedlescriptError(
            `fillunderlaypasses entry ${index + 1} must be a pass name string, got ${describeVal(entry)}`,
            st.line,
          );
        const pass = resolveMode(entry, FILL_UNDERLAY_PASS_KINDS);
        if (pass === undefined)
          throw new NeedlescriptError(
            `fillunderlaypasses entry ${index + 1}: ${unknownModeMessage('fill underlay pass', entry, FILL_UNDERLAY_PASS_KINDS)}`,
            st.line,
          );
        return pass;
      });
      ctx.m.fillUnderlayCustomization = {
        ...ctx.m.fillUnderlayCustomization,
        passKinds,
      };
      return;
    }
    if (st.name === 'fillstagger') {
      ctx.traceNote(
        'fillstagger',
        'note: fillstagger inside trace has no effect on the captured path',
      );
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `fillstagger expects a string mode, got ${describeVal(modeVal)} — e.g. fillstagger 'progressive'`,
          st.line,
        );
      const allowed = FILL_CONSTRUCTION_MODE_REGISTRIES.fillstagger;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('fillstagger', modeVal, allowed), st.line);
      ctx.m.fillStagger = mode;
      return;
    }
    if (st.name === 'fillconnect') {
      ctx.traceNote(
        'fillconnect',
        'note: fillconnect inside trace has no effect on the captured path',
      );
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `fillconnect expects a string mode, got ${describeVal(modeVal)} — e.g. fillconnect 'inside'`,
          st.line,
        );
      const allowed = FILL_CONSTRUCTION_MODE_REGISTRIES.fillconnect;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('fillconnect', modeVal, allowed), st.line);
      ctx.m.fillConnect = mode;
      return;
    }
    if (st.name === 'satincap') {
      ctx.traceNote('satincap', 'note: satincap inside trace has no effect on the captured path');
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `satincap expects a string mode, got ${describeVal(modeVal)} — e.g. satincap 'taper'`,
          st.line,
        );
      const allowed = SATIN_CONSTRUCTION_MODE_REGISTRIES.satincap;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('satincap', modeVal, allowed), st.line);
      ctx.m.flushSatin();
      ctx.m.satinCapStart = mode;
      ctx.m.satinCapEnd = mode;
      return;
    }
    if (st.name === 'satinjoin') {
      ctx.traceNote('satinjoin', 'note: satinjoin inside trace has no effect on the captured path');
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `satinjoin expects a string mode, got ${describeVal(modeVal)} — e.g. satinjoin 'fan'`,
          st.line,
        );
      const allowed = SATIN_CONSTRUCTION_MODE_REGISTRIES.satinjoin;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('satinjoin', modeVal, allowed), st.line);
      ctx.m.flushSatin();
      ctx.m.satinJoin = mode;
      return;
    }
    if (st.name === 'satinwide') {
      ctx.traceNote('satinwide', 'note: satinwide inside trace has no effect on the captured path');
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `satinwide expects a string mode, got ${describeVal(modeVal)} — e.g. satinwide 'split'`,
          st.line,
        );
      const allowed = SATIN_CONSTRUCTION_MODE_REGISTRIES.satinwide;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('satinwide', modeVal, allowed), st.line);
      ctx.m.flushSatin();
      ctx.m.satinWide = mode;
      return;
    }
    if (st.name === 'compensation') {
      ctx.traceNote(
        'compensation',
        'note: compensation inside trace has no effect on the captured path',
      );
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `compensation expects a string mode, got ${describeVal(modeVal)} — e.g. compensation 'directional'`,
          st.line,
        );
      const allowed = EMBROIDERY_MODE_REGISTRIES.compensation;
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('compensation', modeVal, allowed), st.line);
      ctx.m.flushSatin();
      ctx.m.compensationMode = mode;
      return;
    }
    // Material profile selectors — handled before the bulk num() conversion.
    if (st.name === 'threadprofile' || st.name === 'stabilizer') {
      ctx.traceNote(st.name, `note: ${st.name} inside trace has no effect on the captured path`);
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `${st.name} expects a string profile, got ${describeVal(modeVal)} — e.g. ${st.name} '${QWORD_BUILTINS[st.name][0]}'`,
          st.line,
        );
      if (st.name === 'threadprofile') {
        const allowed = EMBROIDERY_MODE_REGISTRIES.threadprofile;
        const mode = resolveMode(modeVal, allowed);
        if (mode === undefined)
          throw new NeedlescriptError(
            unknownModeMessage('thread profile', modeVal, allowed),
            st.line,
          );
        ctx.m.materialIntent = {
          ...ctx.m.materialIntent,
          threadProfile: mode,
          threadWidthMM: THREAD_PROFILES[mode].widthMM,
        };
        ctx.m.density.setThreadWidthMM(ctx.m.materialIntent.threadWidthMM);
      } else {
        const allowed = EMBROIDERY_MODE_REGISTRIES.stabilizer;
        const mode = resolveMode(modeVal, allowed);
        if (mode === undefined)
          throw new NeedlescriptError(unknownModeMessage('stabilizer', modeVal, allowed), st.line);
        ctx.m.materialIntent = {
          ...ctx.m.materialIntent,
          stabilizer: STABILIZER_PROFILES[mode].category,
        };
      }
      return;
    }
    // String-argument construction mode commands — handled before bulk num() conversion.
    if (st.name === 'fabric' || st.name === 'underlay' || st.name === 'fillunderlay') {
      ctx.traceNote(st.name, `note: ${st.name} inside trace has no effect on the captured path`);
      const modeVal = vals[0];
      if (typeof modeVal !== 'string')
        throw new NeedlescriptError(
          `${st.name} expects a string mode, got ${describeVal(modeVal)} — e.g. ${st.name} '${QWORD_BUILTINS[st.name][0]}'`,
          st.line,
        );
      const allowed = EMBROIDERY_MODE_REGISTRIES[st.name];
      const mode = resolveMode(modeVal, allowed);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage(st.name, modeVal, allowed), st.line);
      if (st.name === 'underlay') {
        if (ctx.m.satinUnderlayCustomization) ctx.m.flushSatin();
        ctx.m.underlayMode = mode as typeof ctx.m.underlayMode;
        ctx.m.satinUnderlayCustomization = null;
      } else if (st.name === 'fillunderlay') {
        ctx.m.fillUnderlayMode = mode as typeof ctx.m.fillUnderlayMode;
        ctx.m.fillUnderlayCustomization = null;
      } else {
        // fabric
        const profile = FABRIC_PROFILES[mode as FabricMode];
        const f: FabricPreset = profile.construction;
        if (ctx.m.compensationMode === 'directional') ctx.m.flushSatin();
        if (ctx.m.satinUnderlayCustomization) ctx.m.flushSatin();
        ctx.m.pullComp = f.pull;
        ctx.m.pullCompExplicit = false;
        ctx.m.underlayMode = f.underlay.satin;
        ctx.m.satinUnderlayCustomization = null;
        ctx.m.fillUnderlayMode = f.underlay.fill;
        ctx.m.fillUnderlayCustomization = null;
        ctx.m.maxDensity = f.maxDensity;
        ctx.m.doubleUnderlay = f.underlay.doubled;
        if (f.densityFloor && ctx.m.satinSpacing < f.densityFloor)
          ctx.m.satinSpacing = f.densityFloor;
        if (f.note && !ctx.m.warnings.includes(f.note)) ctx.m.warnings.push(f.note);
        ctx.m.materialIntent = {
          ...ctx.m.materialIntent,
          fabricPreset: mode,
          ...profile.material,
        };
      }
      return;
    }
    // ---------- preflight — select the post-run diagnostic policy ----------
    if (st.name === 'preflight') {
      if (ctx.insideTrace > 0)
        throw new NeedlescriptError(
          'preflight is a program directive — add it to the top of the editor and re-run',
          st.line,
        );
      if (ctx.structuralDepth > 0 || depth > 0)
        throw new NeedlescriptError(
          'preflight must be at the top level — not inside a loop, if branch, or procedure; put it near the top of the program',
          st.line,
        );
      if (ctx.m.started)
        throw new NeedlescriptError(
          'preflight must run before the first stitch; move it to the top of the program',
          st.line,
        );
      if (ctx.preflightLine !== undefined)
        throw new NeedlescriptError(
          `preflight already set on line ${ctx.preflightLine} — only one preflight directive is allowed per program`,
          st.line,
        );
      const modeValue = vals[0];
      if (typeof modeValue !== 'string')
        throw new NeedlescriptError(
          `preflight expects a string mode, got ${describeVal(modeValue)} — e.g. preflight 'warn'`,
          st.line,
        );
      const mode = resolveMode(modeValue, PREFLIGHT_MODES);
      if (mode === undefined)
        throw new NeedlescriptError(
          unknownModeMessage('preflight', modeValue, PREFLIGHT_MODES),
          st.line,
        );
      ctx.preflightMode = mode;
      ctx.preflightLine = st.line;
      return;
    }
    // ---------- plan — configure the post-run travel strategy ----------
    if (st.name === 'plan') {
      if (ctx.insideTrace > 0)
        throw new NeedlescriptError(
          'plan is a program directive — add it to the top of the editor and re-run',
          st.line,
        );
      if (ctx.structuralDepth > 0 || depth > 0)
        throw new NeedlescriptError(
          'plan must be at the top level — not inside a loop, if branch, or procedure; put it near the top of the program',
          st.line,
        );
      if (ctx.m.started)
        throw new NeedlescriptError(
          'plan must run before the first stitch; move it to the top of the program',
          st.line,
        );
      if (ctx.planMode !== null)
        throw new NeedlescriptError(
          `plan already set${ctx.planLine !== undefined ? ` on line ${ctx.planLine}` : ''} — only one plan directive is allowed per program`,
          st.line,
        );
      const modeValue = vals[0];
      if (typeof modeValue !== 'string')
        throw new NeedlescriptError(
          `plan expects a string mode, got ${describeVal(modeValue)} — e.g. plan 'nearest'`,
          st.line,
        );
      const mode = resolveMode(modeValue, PLAN_MODES);
      if (mode === undefined)
        throw new NeedlescriptError(unknownModeMessage('plan', modeValue, PLAN_MODES), st.line);
      ctx.planMode = mode;
      ctx.planLine = st.line;
      return;
    }
    // ---------- planbarrier — start a new authored planner segment ----------
    if (st.name === 'planbarrier') {
      if (ctx.insideTrace > 0)
        throw new NeedlescriptError(
          'planbarrier is not allowed inside trace — place the barrier in the sewing program',
          st.line,
        );
      // A disabled or absent planner must be a true construction no-op. In
      // particular, do not flush buffered satin/reporter-running output.
      if (ctx.planMode === null || ctx.planMode === 'off') return;
      if (ctx.atomicDepth > 0)
        throw new NeedlescriptError(
          'planbarrier cannot appear inside atomic — an atomic span must stay within one planner segment',
          st.line,
        );
      if (ctx.m.recording)
        throw new NeedlescriptError(
          'planbarrier cannot split a beginfill…endfill recording — place it before beginfill or after endfill',
          st.line,
        );
      ctx.m.flushSatin();
      ctx.planBarrierOffsets.push(ctx.m.events.length);
      return;
    }
    // ---------- hoop — configure the sewable field (§hoop) ----------
    if (st.name === 'hoop') {
      const directiveGuard = (cmdName: string) => {
        if (ctx.insideTrace > 0)
          throw new NeedlescriptError(
            `${cmdName} and override are program directives — add them to the top of the editor and re-run`,
            st.line,
          );
        if (ctx.structuralDepth > 0 || depth > 0)
          throw new NeedlescriptError(
            `${cmdName} must be at the top level — not inside a loop, if branch, or procedure; put it on line 1`,
            st.line,
          );
        if (ctx.m.started)
          throw new NeedlescriptError(
            `${cmdName} must run before the first stitch — ${ctx.m.events.filter((e) => e.t === 'stitch').length.toLocaleString('en-US')} stitch${ctx.m.events.filter((e) => e.t === 'stitch').length === 1 ? '' : 'es'} already sewn; move it to the top of the program`,
            st.line,
          );
      };
      directiveGuard('hoop');
      if (ctx.m.hoopSet)
        throw new NeedlescriptError(
          `hoop already set${ctx.m.hoopSetLine !== undefined ? ` on line ${ctx.m.hoopSetLine}` : ''} — only one hoop directive is allowed per program`,
          st.line,
        );
      if (ctx.m.fieldLocked)
        throw new NeedlescriptError(
          `hoop must be set before scatter/voronoi/relax uses the field — a generator already ran with the default field; move hoop to line 1`,
          st.line,
        );

      const arg = vals[0];
      let info: HoopInfo;
      if (typeof arg === 'string') {
        const preset = lookupHoopPreset(arg);
        if (!preset) {
          const allNames = Array.from(HOOP_PRESET_NAMES);
          throw new NeedlescriptError(
            `Unknown hoop preset '${arg}'${didYouMean(arg.toLowerCase(), allNames)} — known presets: ${allNames.map((n) => `'${n}'`).join(', ')}. Or: hoop <diameter mm>  or  hoop [width, height]`,
            st.line,
          );
        }
        info = preset;
      } else if (typeof arg === 'number') {
        if (arg < 20 || arg > 400)
          throw new NeedlescriptError(
            `hoop ${formatNum(arg)} — diameter out of range (must be 20–400 mm)`,
            st.line,
          );
        info = buildHoopInfo(arg, arg, 'circle');
      } else if (isList(arg) && (arg.items.length === 2 || arg.items.length === 3)) {
        const w = num(arg.items[0], 'hoop', st.line);
        const h = num(arg.items[1], 'hoop', st.line);
        if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0)
          throw new NeedlescriptError(
            `hoop [${formatNum(w)}, ${formatNum(h)}] — each dimension must be a positive finite number`,
            st.line,
          );
        if (w < 20 || w > 400 || h < 20 || h > 400)
          throw new NeedlescriptError(
            `hoop [${formatNum(w)}, ${formatNum(h)}] — each dimension must be 20–400 mm`,
            st.line,
          );
        let shape: HoopInfo['shape'] = 'rectangle';
        if (arg.items.length === 3) {
          const rawShape = arg.items[2];
          if (!isString(rawShape))
            throw new NeedlescriptError(
              `hoop shape must be a string — expected ${HOOP_SHAPES.map((item) => `'${item}'`).join(', ')}`,
              st.line,
            );
          const resolved = resolveMode(rawShape, HOOP_SHAPES);
          if (!resolved)
            throw new NeedlescriptError(
              unknownModeMessage('hoop shape', rawShape, HOOP_SHAPES),
              st.line,
            );
          shape = resolved;
        }
        if (shape === 'circle' && Math.abs(w - h) > 1e-9)
          throw new NeedlescriptError(
            `hoop [${formatNum(w)}, ${formatNum(h)}, 'circle'] — circle width and height must match`,
            st.line,
          );
        info = buildHoopInfo(w, h, shape);
      } else {
        throw new NeedlescriptError(
          `hoop expects a preset name (e.g. hoop '5x7'), a diameter (e.g. hoop 130), [width, height], or [width, height, shape] (e.g. hoop [120, 75, 'oval'])`,
          st.line,
        );
      }

      ctx.m.hoopInfo = info;
      ctx.m.hoopSet = true;
      ctx.m.hoopSetLine = st.line;
      return;
    }

    // ---------- override — raise or lower a run-envelope budget (§override) ----------
    if (st.name === 'override') {
      if (ctx.insideTrace > 0)
        throw new NeedlescriptError(
          `hoop and override are program directives — add them to the top of the editor and re-run`,
          st.line,
        );
      if (ctx.structuralDepth > 0 || depth > 0)
        throw new NeedlescriptError(
          `override must be at the top level — not inside a loop, if branch, or procedure; put it near the top of the program`,
          st.line,
        );
      if (ctx.m.started)
        throw new NeedlescriptError(
          `override must run before the first stitch; move it to the top of the program`,
          st.line,
        );

      const keyVal = vals[0];
      if (typeof keyVal !== 'string')
        throw new NeedlescriptError(
          `override: first argument must be a limit name string, e.g. override 'stitches' 120000`,
          st.line,
        );
      const keyStr = keyVal.toLowerCase() as OverrideKey;

      const KEY_MAP: Record<OverrideKey, BudgetKey> = {
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
      };
      const PHYSICS_KEYS: Record<string, string> = {
        stitchlen: 'stitch length bounds protect the machine and fabric',
        minstitch: 'stitch length bounds protect the machine and fabric',
        maxstitch: 'stitch length bounds protect the machine and fabric',
      };

      if (keyStr in PHYSICS_KEYS) {
        throw new NeedlescriptError(
          `override '${keyStr}' — ${PHYSICS_KEYS[keyStr]}; they are not a computational budget and cannot be changed`,
          st.line,
        );
      }

      const budgetKey = KEY_MAP[keyStr];
      if (!budgetKey) {
        const allKeys = Object.keys(KEY_MAP);
        throw new NeedlescriptError(
          `override: unknown limit '${keyStr}'${didYouMean(keyStr, allKeys)} — valid keys: ${allKeys.map((k) => `'${k}'`).join(', ')}`,
          st.line,
        );
      }

      if (ctx.m.activeOverrides.has(keyStr))
        throw new NeedlescriptError(
          `'${keyStr}' already overridden on line ${ctx.m.activeOverrides.get(keyStr)!.line}`,
          st.line,
        );

      const rawValue = num(vals[1], 'override', st.line);
      const value = Math.floor(rawValue);
      const floor = OVERRIDE_FLOORS[budgetKey];
      const ceiling = OVERRIDE_CEILINGS[budgetKey];

      if (value < floor || value > ceiling)
        throw new NeedlescriptError(
          `override '${keyStr}' ${value.toLocaleString('en-US')} — out of range (${floor.toLocaleString('en-US')}–${ceiling.toLocaleString('en-US')}; stock is ${STOCK_LIMITS[budgetKey].toLocaleString('en-US')})`,
          st.line,
        );

      ctx.m.effectiveLimits[budgetKey] = value;
      ctx.m.activeOverrides.set(keyStr, { value, line: st.line });

      const stock = STOCK_LIMITS[budgetKey];
      if (value < stock) {
        ctx.m.warnings.push(
          `note: override '${keyStr}' set to ${value.toLocaleString('en-US')} (below stock ${stock.toLocaleString('en-US')}). Hitting it will produce: ${keyStr} budget reached — ${value.toLocaleString('en-US')} (lowered by override; stock is ${stock.toLocaleString('en-US')})`,
        );
      }
      return;
    }
    if (st.name === 'mark') {
      ctx.traceNote(
        'mark',
        'note: mark inside trace has no effect — pins mark sewn positions; nothing is sewn',
      );
      if (st.args.length === 1) {
        const labelVal = vals[0];
        if (typeof labelVal !== 'string')
          throw new NeedlescriptError(
            `mark label must be a string, got ${describeVal(labelVal)}`,
            st.line,
          );
        ctx.m.markHere(labelVal);
      } else {
        ctx.m.markHere();
      }
      return;
    }
    // Every other command is scalar — a string or list argument is a type error.
    const a = vals.map((v) => num(v, st.name, st.line));
    if (
      ctx.insideFillGenerator > 0 &&
      [
        'fd',
        'bk',
        'rt',
        'lt',
        'up',
        'down',
        'home',
        'setxy',
        'setx',
        'sety',
        'seth',
        'arc',
        'moveto',
        'gohome',
        'circle',
      ].includes(st.name)
    )
      ctx.traceNote(
        'fill-generator-motion',
        'note: machine commands inside a fill path generator are discarded',
      );
    switch (st.name) {
      case 'fd':
        ctx.m.forward(a[0]);
        return;
      case 'bk':
        ctx.m.forward(-a[0]);
        return;
      case 'rt':
        ctx.m.heading = (ctx.m.heading + a[0]) % 360;
        return;
      case 'lt':
        ctx.m.heading = (ctx.m.heading - a[0]) % 360;
        return;
      case 'up':
        ctx.m.flushSatin();
        ctx.m.penDown = false;
        return;
      case 'down':
        ctx.m.penDown = true;
        return;
      case 'home':
        ctx.m.setXY(0, 0);
        ctx.m.heading = 0;
        return;
      case 'cs':
        return;
      case 'setxy':
        ctx.m.setXY(a[0], a[1]);
        return;
      case 'setx':
        ctx.m.setXY(a[0], ctx.m.y);
        return;
      case 'sety':
        ctx.m.setXY(ctx.m.x, a[0]);
        return;
      case 'seth':
        ctx.m.heading = a[0] % 360;
        return;
      case 'arc':
        ctx.m.arc(a[0], a[1]);
        return;
      case 'moveto': {
        const wasDown = ctx.m.penDown;
        ctx.m.flushSatin();
        ctx.m.penDown = false;
        ctx.m.setXY(a[0], a[1]);
        ctx.m.penDown = wasDown;
        return;
      }
      case 'gohome': {
        const wasDown = ctx.m.penDown;
        ctx.m.flushSatin();
        ctx.m.penDown = false;
        ctx.m.setXY(0, 0);
        ctx.m.penDown = wasDown;
        return;
      }
      case 'circle':
        ctx.m.arc(360, a[0]);
        return;
      case 'push':
        ctx.m.pushState();
        return;
      case 'pop':
        ctx.m.popState();
        return;
      case 'stitchlen': {
        ctx.traceNote(
          'stitchlen',
          'note: stitchlen inside trace has no effect on the captured path',
        );
        ctx.m.flushSatin();
        ctx.m.stitchLenList = null;
        ctx.m.stitchLenListPhase = 0;
        ctx.m.stitchLenReporter = null;
        const v = a[0];
        if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
          ctx.m.warnings.push(
            `stitchlen ${v} clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm (machine-safe range is ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
          );
        ctx.m.stitchLen = Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
        return;
      }
      case 'satin': {
        ctx.traceNote('satin', 'note: satin inside trace has no effect on the captured path');
        ctx.m.flushSatin();
        ctx.m.satinReporter = null;
        const v = Math.max(0, a[0]);
        if (v > 10 && ctx.m.satinWide !== 'split') {
          const index = ctx.m.warnings.length;
          ctx.m.warnings.push(
            `satin ${v} mm is very wide — columns over ~8 mm tend to snag; consider splitting`,
          );
          ctx.m.constructionWarningLocations.push({
            index,
            points: [],
            lines: ctx.m.currentLine === undefined ? [] : [ctx.m.currentLine],
            kind: 'satin',
          });
        }
        ctx.m.satinWidth = v;
        ctx.m.mode = v > 0.05 ? 'satin' : 'run';
        return;
      }
      case 'satincaplen': {
        ctx.traceNote(
          'satincaplen',
          'note: satincaplen inside trace has no effect on the captured path',
        );
        const range = SATIN_CONSTRUCTION_RANGES.capLengthMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `satincaplen must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinCapLength = a[0];
        return;
      }
      case 'satincorner': {
        ctx.traceNote(
          'satincorner',
          'note: satincorner inside trace has no effect on the captured path',
        );
        const range = SATIN_CONSTRUCTION_RANGES.cornerAngleDeg;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `satincorner must be between ${range.min} and ${range.max} degrees`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinCornerAngle = a[0];
        return;
      }
      case 'satinmaxwidth': {
        ctx.traceNote(
          'satinmaxwidth',
          'note: satinmaxwidth inside trace has no effect on the captured path',
        );
        const range = SATIN_CONSTRUCTION_RANGES.maxWidthMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `satinmaxwidth must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinMaxWidth = a[0];
        return;
      }
      case 'satinsplitoverlap': {
        ctx.traceNote(
          'satinsplitoverlap',
          'note: satinsplitoverlap inside trace has no effect on the captured path',
        );
        const range = SATIN_CONSTRUCTION_RANGES.splitOverlapMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `satinsplitoverlap must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinSplitOverlap = a[0];
        return;
      }
      case 'estitch': {
        ctx.traceNote('estitch', 'note: estitch inside trace has no effect on the captured path');
        ctx.m.flushSatin();
        ctx.m.satinReporter = null;
        const v = Math.max(0, a[0]);
        if (v > 10) {
          const index = ctx.m.warnings.length;
          ctx.m.warnings.push(`estitch ${v} mm is very wide — prongs over ~8 mm tend to snag`);
          ctx.m.constructionWarningLocations.push({
            index,
            points: [],
            lines: ctx.m.currentLine === undefined ? [] : [ctx.m.currentLine],
            kind: 'satin',
          });
        }
        ctx.m.eWidth = v;
        ctx.m.mode = v > 0.05 ? 'estitch' : 'run';
        return;
      }
      case 'bean': {
        ctx.traceNote('bean', 'note: bean inside trace has no effect on the captured path');
        let n = Math.round(a[0]);
        if (n <= 1) {
          ctx.m.beanRepeats = 1;
          return;
        }
        if (n % 2 === 0) {
          n += 1;
          ctx.m.warnings.push(`bean must be odd to keep advancing — using ${n}`);
        }
        if (n > 9) {
          n = 9;
          ctx.m.warnings.push('bean clamped to 9 passes');
        }
        ctx.m.beanRepeats = n;
        return;
      }
      case 'lock': {
        ctx.traceNote('lock', 'note: lock inside trace has no effect on the captured path');
        if (a[0] <= 0) {
          ctx.m.lockLen = 0;
          return;
        }
        const v = Math.min(Math.max(a[0], 0.3), 1.5);
        if (v !== a[0]) ctx.m.warnings.push(`lock ${a[0]} clamped to ${v} mm (safe range 0.3–1.5)`);
        ctx.m.lockLen = v;
        return;
      }
      case 'beginfill':
        if (ctx.insideTrace > 0)
          throw new NeedlescriptError(
            'a fill cannot run inside trace — capture the boundary and fill it afterward',
            st.line,
          );
        ctx.m.beginFill();
        return;
      case 'endfill':
        if (ctx.insideTrace > 0)
          throw new NeedlescriptError(
            'a fill cannot run inside trace — capture the boundary and fill it afterward',
            st.line,
          );
        ctx.m.endFill();
        return;
      case 'fillangle':
        ctx.traceNote(
          'fillangle',
          'note: fillangle inside trace has no effect on the captured path',
        );
        ctx.m.fillAngle = a[0];
        return;
      case 'fillspacing': {
        ctx.traceNote(
          'fillspacing',
          'note: fillspacing inside trace has no effect on the captured path',
        );
        const v = Math.min(Math.max(a[0], 0.25), 5);
        if (v !== a[0])
          ctx.m.warnings.push(`fillspacing ${a[0]} clamped to ${v} mm (safe range 0.25–5)`);
        ctx.m.fillSpacing = v;
        return;
      }
      case 'fillinset': {
        ctx.traceNote(
          'fillinset',
          'note: fillinset inside trace has no effect on the captured path',
        );
        const { min, max } = FILL_CONSTRUCTION_RANGES.insetMM;
        if (!Number.isFinite(a[0]) || a[0] < min || a[0] > max)
          throw new NeedlescriptError(`fillinset must be between ${min} and ${max} mm`, st.line);
        ctx.m.fillInset = a[0];
        return;
      }
      case 'filledgerun': {
        ctx.traceNote(
          'filledgerun',
          'note: filledgerun inside trace has no effect on the captured path',
        );
        const { min, max } = FILL_CONSTRUCTION_RANGES.edgeRunInsetMM;
        if (!Number.isFinite(a[0]) || a[0] < min || a[0] > max)
          throw new NeedlescriptError(`filledgerun must be between ${min} and ${max} mm`, st.line);
        ctx.m.fillEdgeRun = a[0];
        return;
      }
      case 'filledgeshort': {
        ctx.traceNote(
          'filledgeshort',
          'note: filledgeshort inside trace has no effect on the captured path',
        );
        const { min, max } = FILL_CONSTRUCTION_RANGES.edgeShortMM;
        if (!Number.isFinite(a[0]) || a[0] < min || a[0] > max)
          throw new NeedlescriptError(
            `filledgeshort must be between ${min} and ${max} mm`,
            st.line,
          );
        ctx.m.fillEdgeShort = a[0];
        return;
      }
      case 'fillstaggeramount': {
        ctx.traceNote(
          'fillstaggeramount',
          'note: fillstaggeramount inside trace has no effect on the captured path',
        );
        const { min, max } = FILL_CONSTRUCTION_RANGES.staggerAmount;
        if (!Number.isFinite(a[0]) || a[0] < min || a[0] > max)
          throw new NeedlescriptError(
            `fillstaggeramount must be between ${min} and ${max}`,
            st.line,
          );
        ctx.m.fillStaggerAmount = a[0];
        return;
      }
      case 'filllen': {
        ctx.traceNote('filllen', 'note: filllen inside trace has no effect on the captured path');
        ctx.m.fillLenList = null;
        ctx.m.fillLenListPhase = 0;
        ctx.m.fillLenReporter = null;
        if (a[0] <= 0) {
          ctx.m.fillLen = null;
          return;
        }
        const v = Math.min(Math.max(a[0], 1), 7);
        if (v !== a[0]) ctx.m.warnings.push(`filllen ${a[0]} clamped to ${v} mm (safe range 1–7)`);
        ctx.m.fillLen = v;
        return;
      }
      case 'density':
        ctx.traceNote('density', 'note: density inside trace has no effect on the captured path');
        ctx.m.flushSatin();
        ctx.m.satinSpacing = Math.min(Math.max(a[0], 0.25), 5);
        return;
      case 'underlaylen': {
        ctx.traceNote(
          'underlaylen',
          'note: underlaylen inside trace has no effect on the captured path',
        );
        const range = SATIN_UNDERLAY_RANGES.runningStitchLengthMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `underlaylen must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinUnderlayCustomization = {
          ...ctx.m.satinUnderlayCustomization,
          runningStitchLengthMM: a[0],
        };
        return;
      }
      case 'underlayinset': {
        ctx.traceNote(
          'underlayinset',
          'note: underlayinset inside trace has no effect on the captured path',
        );
        const range = SATIN_UNDERLAY_RANGES.edgeInsetMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `underlayinset must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinUnderlayCustomization = {
          ...ctx.m.satinUnderlayCustomization,
          edgeInsetMM: a[0],
        };
        return;
      }
      case 'underlayspacing': {
        ctx.traceNote(
          'underlayspacing',
          'note: underlayspacing inside trace has no effect on the captured path',
        );
        const range = SATIN_UNDERLAY_RANGES.zigzagSpacingMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `underlayspacing must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.flushSatin();
        ctx.m.satinUnderlayCustomization = {
          ...ctx.m.satinUnderlayCustomization,
          zigzagSpacingMM: a[0],
        };
        return;
      }
      case 'fillunderlaylen': {
        ctx.traceNote(
          'fillunderlaylen',
          'note: fillunderlaylen inside trace has no effect on the captured path',
        );
        const range = FILL_UNDERLAY_RANGES.stitchLengthMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `fillunderlaylen must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.fillUnderlayCustomization = {
          ...ctx.m.fillUnderlayCustomization,
          stitchLengthMM: a[0],
        };
        return;
      }
      case 'fillunderlayinset': {
        ctx.traceNote(
          'fillunderlayinset',
          'note: fillunderlayinset inside trace has no effect on the captured path',
        );
        const range = FILL_UNDERLAY_RANGES.insetMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `fillunderlayinset must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.fillUnderlayCustomization = {
          ...ctx.m.fillUnderlayCustomization,
          insetMM: a[0],
        };
        return;
      }
      case 'fillunderlayspacing': {
        ctx.traceNote(
          'fillunderlayspacing',
          'note: fillunderlayspacing inside trace has no effect on the captured path',
        );
        const range = FILL_UNDERLAY_RANGES.rowSpacingMM;
        if (!Number.isFinite(a[0]) || a[0] < range.min || a[0] > range.max)
          throw new NeedlescriptError(
            `fillunderlayspacing must be between ${range.min} and ${range.max} mm`,
            st.line,
          );
        ctx.m.fillUnderlayCustomization = {
          ...ctx.m.fillUnderlayCustomization,
          rowSpacingMM: a[0],
        };
        return;
      }
      case 'fillunderlayangle': {
        ctx.traceNote(
          'fillunderlayangle',
          'note: fillunderlayangle inside trace has no effect on the captured path',
        );
        if (!Number.isFinite(a[0]))
          throw new NeedlescriptError(
            'fillunderlayangle must be a finite number of degrees',
            st.line,
          );
        ctx.m.fillUnderlayCustomization = {
          ...ctx.m.fillUnderlayCustomization,
          relativeAngleDegrees: a[0],
        };
        return;
      }
      case 'fabricgrain': {
        ctx.traceNote(
          'fabricgrain',
          'note: fabricgrain inside trace has no effect on the captured path',
        );
        if (!Number.isFinite(a[0]))
          throw new NeedlescriptError('fabricgrain must be a finite heading in degrees', st.line);
        if (ctx.m.compensationMode === 'directional') ctx.m.flushSatin();
        ctx.m.materialIntent = {
          ...ctx.m.materialIntent,
          grainHeading: ((a[0] % 360) + 360) % 360,
        };
        return;
      }
      case 'fabricstretch': {
        ctx.traceNote(
          'fabricstretch',
          'note: fabricstretch inside trace has no effect on the captured path',
        );
        const { min, max } = MATERIAL_RANGES.stretch;
        if (a.some((value) => !Number.isFinite(value) || value < min || value > max))
          throw new NeedlescriptError(
            `fabricstretch values must be finite fractions from ${min} to ${max}`,
            st.line,
          );
        if (ctx.m.compensationMode === 'directional') ctx.m.flushSatin();
        ctx.m.materialIntent = {
          ...ctx.m.materialIntent,
          stretchAlong: a[0],
          stretchAcross: a[1],
        };
        return;
      }
      case 'threadwidth': {
        ctx.traceNote(
          'threadwidth',
          'note: threadwidth inside trace has no effect on the captured path',
        );
        const { min, max } = MATERIAL_RANGES.threadWidthMM;
        if (!Number.isFinite(a[0]) || a[0] < min || a[0] > max)
          throw new NeedlescriptError(`threadwidth must be between ${min} and ${max} mm`, st.line);
        ctx.m.materialIntent = { ...ctx.m.materialIntent, threadWidthMM: a[0] };
        ctx.m.density.setThreadWidthMM(a[0]);
        return;
      }
      case 'needle': {
        ctx.traceNote('needle', 'note: needle inside trace has no effect on the captured path');
        const size = a[0];
        if (size === 0) {
          const next = { ...ctx.m.materialIntent };
          delete next.needleSize;
          ctx.m.materialIntent = next;
          return;
        }
        if (!Number.isInteger(size) || !(NEEDLE_SIZES as readonly number[]).includes(size))
          throw new NeedlescriptError(
            `needle must be 0 (unspecified) or a common NM size: ${NEEDLE_SIZES.join(', ')}`,
            st.line,
          );
        ctx.m.materialIntent = { ...ctx.m.materialIntent, needleSize: size };
        return;
      }
      case 'topping':
        ctx.traceNote('topping', 'note: topping inside trace has no effect on the captured path');
        if (a[0] !== 0 && a[0] !== 1)
          throw new NeedlescriptError('topping expects 0/1 or false/true', st.line);
        ctx.m.materialIntent = { ...ctx.m.materialIntent, topping: a[0] === 1 };
        return;
      case 'pullcomp': {
        ctx.traceNote('pullcomp', 'note: pullcomp inside trace has no effect on the captured path');
        const v = Math.min(Math.max(a[0], 0), 1.5);
        if (v !== a[0])
          ctx.m.warnings.push(`pullcomp ${a[0]} clamped to ${v} mm (safe range 0–1.5)`);
        if (ctx.m.compensationMode === 'directional') ctx.m.flushSatin();
        ctx.m.pullComp = v;
        ctx.m.pullCompExplicit = true;
        return;
      }
      case 'shortstitch':
        ctx.traceNote(
          'shortstitch',
          'note: shortstitch inside trace has no effect on the captured path',
        );
        ctx.m.shortStitch = a[0] !== 0;
        return;
      case 'autotrim': {
        ctx.traceNote('autotrim', 'note: autotrim inside trace has no effect on the captured path');
        if (a[0] <= 0) {
          ctx.m.autoTrim = 0;
          return;
        }
        const v = Math.min(Math.max(a[0], 3), 30);
        if (v !== a[0])
          ctx.m.warnings.push(`autotrim ${a[0]} clamped to ${v} mm (safe range 3–30, 0 = off)`);
        ctx.m.autoTrim = v;
        return;
      }
      case 'maxdensity': {
        ctx.traceNote(
          'maxdensity',
          'note: maxdensity inside trace has no effect on the captured path',
        );
        if (a[0] <= 0) {
          ctx.m.maxDensity = 0;
          return;
        }
        ctx.m.maxDensity = Math.min(Math.max(a[0], 1), 8);
        return;
      }
      case 'stop':
        ctx.traceNote('stop', 'note: stop inside trace has no effect on the captured path');
        ctx.colorOrStopLine ??= st.line;
        ctx.usedColorIndices.add(ctx.m.colorIdx + 1);
        ctx.m.colorChange(ctx.m.colorIdx + 1);
        return;
      case 'trim':
        ctx.traceNote('trim', 'note: trim inside trace has no effect on the captured path');
        ctx.m.trimThread();
        return;
      case 'seed': {
        if (ctx.insideFillGenerator > 0) {
          ctx.traceNote('seed', 'note: seed inside a fill path generator has no effect');
          return;
        }
        if (ctx.insideTrace > 0)
          throw new NeedlescriptError(
            'reseed outside trace — the random stream escapes the sandbox',
            st.line,
          );
        const s = Math.floor(a[0]);
        ctx.rng = makeRNG(s);
        ctx.noise = makeNoise(s);
        ctx.snoise2 = createNoise2D(makeRNG(s));
        ctx.snoise3 = createNoise3D(makeRNG(s ^ 0x9e3779b9));
        return;
      }
    }
    throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
  };
}
