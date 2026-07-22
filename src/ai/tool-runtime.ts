import type { CompileResponse } from '../compiler.worker.types.ts';
import { buildSpatialDigest } from '../lib/editor/ai-spatial.ts';
import { eventSourceLine, type PhysicsDiagnostic, type StitchEvent } from '../lib/engine.ts';
import type {
  AiChatThread,
  AiDraftState,
  AiQuestionSet,
  AiToolDisplay,
  AiWorkPlan,
} from './chat-types.ts';
import { applySourceEdits, createDraft, hashSource, type AiSourceEdit } from './source-edits.ts';
import {
  hasOnlyKeys,
  parseToolArguments,
  validatePlanSteps,
  validateQuestionSet,
} from './tool-validation.ts';

type SuccessfulCompile = Extract<CompileResponse, { ok: true }>;

export interface ToolRuntimeOptions {
  liveSource: () => { text: string; revision: number };
  compile: (source: string, seed?: number) => Promise<CompileResponse | null>;
  getThread: () => AiChatThread;
  updateDraft: (draft: AiDraftState) => void;
  updatePlan: (plan: AiWorkPlan, explanation?: string) => void;
  incrementCompileCount: () => void;
}

export interface ToolExecution {
  content?: string;
  display?: AiToolDisplay;
  pause?: AiQuestionSet;
}

interface Envelope {
  ok: boolean;
  tool: string;
  source?: { target: 'live' | 'draft'; revision: number; hash: string };
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  truncated?: boolean;
}

const MAX_TOOL_RESULT = 32_000;

function serialize(envelope: Envelope): string {
  const raw = JSON.stringify(envelope, (_key, value: unknown) =>
    typeof value === 'number' && !Number.isFinite(value) ? null : value,
  );
  if (raw.length <= MAX_TOOL_RESULT) return raw;
  return JSON.stringify({
    ok: envelope.ok,
    tool: envelope.tool,
    source: envelope.source,
    truncated: true,
    data: {
      summary: raw.slice(0, MAX_TOOL_RESULT - 400),
      omittedCharacters: raw.length - MAX_TOOL_RESULT + 400,
    },
  });
}

function failure(tool: string, code: string, message: string, retryable = true): ToolExecution {
  return {
    content: serialize({ ok: false, tool, error: { code, message, retryable } }),
    display: { title: tool.replaceAll('_', ' '), summary: message, status: 'error' },
  };
}

function sourceTarget(
  options: ToolRuntimeOptions,
  rawTarget: unknown,
): { target: 'live' | 'draft'; text: string; revision: number; hash: string } {
  const thread = options.getThread();
  const target =
    rawTarget === 'live'
      ? 'live'
      : rawTarget === 'draft'
        ? 'draft'
        : thread.draft
          ? 'draft'
          : 'live';
  if (target === 'draft') {
    const draft =
      thread.draft ?? createDraft(options.liveSource().text, options.liveSource().revision);
    if (!thread.draft) options.updateDraft(draft);
    return { target, text: draft.text, revision: draft.revision, hash: draft.hash };
  }
  const live = options.liveSource();
  return { target, text: live.text, revision: live.revision, hash: hashSource(live.text) };
}

function sourceEnvelope(target: ReturnType<typeof sourceTarget>): Envelope['source'] {
  return { target: target.target, revision: target.revision, hash: target.hash };
}

function compileSummary(result: SuccessfulCompile): Record<string, unknown> {
  const physics = result.result.physics;
  return {
    stitches: result.stats.stitches,
    jumps: result.stats.jumps,
    trims: result.stats.trims,
    colorChanges: result.stats.colorChanges,
    colorsUsed: result.stats.colorsUsed,
    dimensionsMM: { width: result.stats.width, height: result.stats.height },
    boundsMM: {
      minX: result.stats.minX,
      minY: result.stats.minY,
      maxX: result.stats.maxX,
      maxY: result.stats.maxY,
    },
    hoop: result.result.activeHoop,
    machineProfile: result.result.machineProfile.name,
    material: result.result.material,
    warnings: result.result.warnings.length,
    physics: physics?.summary ?? { error: 0, warning: 0, info: 0 },
    timingMs: result.timings.roundTripMs ?? result.timings.workerMs,
  };
}

function lineSpatial(events: readonly StitchEvent[], lines: readonly number[]): unknown[] {
  return lines.map((line) => {
    const matches = events.filter(
      (event) => event.t === 'stitch' && eventSourceLine(event) === line,
    );
    if (!matches.length) return { line, stitches: 0, visible: false };
    const xs = matches.map(({ x }) => x);
    const ys = matches.map(({ y }) => y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    return {
      line,
      stitches: matches.length,
      visible: true,
      bounds,
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      colors: [...new Set(matches.map(({ c }) => c))],
    };
  });
}

function boundedDiagnostic(diagnostic: PhysicsDiagnostic, sourceLines: string[]): unknown {
  return {
    id: diagnostic.id,
    fingerprint: diagnostic.fingerprint,
    code: diagnostic.code,
    severity: diagnostic.severity,
    category: diagnostic.category,
    title: diagnostic.title,
    explanation: diagnostic.explanation,
    evidence: diagnostic.evidence,
    thresholdVersion: diagnostic.thresholdVersion,
    measurements: diagnostic.measurements,
    limitations: diagnostic.limitations?.slice(0, 4),
    sourceLocations: diagnostic.sourceLocations.map((location) => ({
      ...location,
      text: sourceLines[location.line - 1]?.slice(0, 300) ?? '',
    })),
    geometry: diagnostic.geometry.slice(0, 8),
    constructionIds: diagnostic.constructionIds?.slice(0, 20),
    remedies: diagnostic.remedies.slice(0, 5),
  };
}

export function createToolRuntime(options: ToolRuntimeOptions) {
  const compileCache = new Map<string, CompileResponse>();

  const compileTarget = async (
    tool: string,
    target: ReturnType<typeof sourceTarget>,
    seed: number | undefined,
  ): Promise<{ result?: CompileResponse; cached: boolean; error?: ToolExecution }> => {
    const cacheKey = `${target.hash}:${seed ?? 'default'}`;
    const cached = compileCache.get(cacheKey);
    if (cached) return { result: cached, cached: true };
    const thread = options.getThread();
    const turn = thread.turns.at(-1);
    if ((turn?.compiles ?? 0) >= 4)
      return {
        cached: false,
        error: failure(tool, 'compile_budget', 'The four-compile turn budget is exhausted.', false),
      };
    options.incrementCompileCount();
    const response = await options.compile(target.text, seed);
    if (response === null)
      return {
        cached: false,
        error: failure(tool, 'compile_cancelled', 'Compilation was superseded or cancelled.'),
      };
    compileCache.set(cacheKey, response);
    return { result: response, cached: false };
  };

  return async function execute(tool: string, rawArguments: string): Promise<ToolExecution> {
    const parsed = parseToolArguments(rawArguments);
    if (!parsed.ok) return failure(tool, 'invalid_arguments', parsed.error);
    const args = parsed.value;
    if (args.target !== undefined && args.target !== 'live' && args.target !== 'draft') {
      return failure(tool, 'invalid_arguments', 'target must be live or draft.');
    }

    if (tool === 'ask_user_questions') {
      const checked = validateQuestionSet(args);
      return checked.ok
        ? { pause: checked.value }
        : failure(tool, 'invalid_questions', checked.error);
    }

    if (tool === 'create_plan') {
      if (
        !hasOnlyKeys(args, ['title', 'steps']) ||
        typeof args.title !== 'string' ||
        args.title.length > 120
      )
        return failure(tool, 'invalid_plan', 'Plan title or properties are invalid.');
      const existing = options.getThread().activePlan;
      if (existing?.steps.some(({ status }) => status !== 'completed'))
        return failure(
          tool,
          'plan_exists',
          `Update the unfinished plan ${existing.id} version ${existing.version}.`,
        );
      const checked = validatePlanSteps(args.steps, false);
      if (!checked.ok) return failure(tool, 'invalid_plan', checked.error);
      const plan: AiWorkPlan = {
        id: `plan-${Date.now().toString(36)}`,
        version: 1,
        title: args.title.slice(0, 120),
        steps: checked.steps,
      };
      options.updatePlan(plan);
      return {
        content: serialize({ ok: true, tool, data: plan }),
        display: {
          title: 'Created work plan',
          summary: `${plan.steps.length} steps`,
          status: 'success',
        },
      };
    }

    if (tool === 'update_plan') {
      if (!hasOnlyKeys(args, ['planId', 'expectedVersion', 'explanation', 'steps']))
        return failure(tool, 'invalid_plan', 'Unknown plan property.');
      const current = options.getThread().activePlan;
      if (!current || args.planId !== current.id || args.expectedVersion !== current.version)
        return failure(
          tool,
          'plan_conflict',
          current
            ? `Current plan is ${current.id} version ${current.version}.`
            : 'There is no active plan.',
        );
      const checked = validatePlanSteps(args.steps, true);
      if (!checked.ok) return failure(tool, 'invalid_plan', checked.error);
      const oldById = new Map(current.steps.map((step) => [step.id, step]));
      for (const old of current.steps) {
        const next = checked.steps.find(({ id }) => id === old.id);
        if (
          old.status === 'completed' &&
          (!next || next.status !== 'completed') &&
          typeof args.explanation !== 'string'
        )
          return failure(
            tool,
            'invalid_plan',
            'Reopening or removing a completed step requires an explanation.',
          );
      }
      const now = Date.now();
      const plan: AiWorkPlan = {
        ...current,
        version: current.version + 1,
        steps: checked.steps.map((step) => ({
          ...step,
          ...(step.status === 'completed'
            ? { completedAt: oldById.get(step.id)?.completedAt ?? now }
            : {}),
        })),
      };
      options.updatePlan(plan, typeof args.explanation === 'string' ? args.explanation : undefined);
      return {
        content: serialize({ ok: true, tool, data: plan }),
        display: {
          title: 'Updated work plan',
          summary: `Version ${plan.version}`,
          status: 'success',
        },
      };
    }

    if (tool === 'read_source') {
      if (!hasOnlyKeys(args, ['target', 'startLine', 'endLine']))
        return failure(tool, 'invalid_arguments', 'Unknown read_source property.');
      const target = sourceTarget(options, args.target);
      const lines = target.text.split(/\r?\n/);
      const start = Number.isInteger(args.startLine) ? Number(args.startLine) : 1;
      const requestedEnd = Number.isInteger(args.endLine) ? Number(args.endLine) : start + 399;
      if (start < 1 || requestedEnd < start)
        return failure(tool, 'invalid_range', 'Invalid source line range.');
      const end = Math.min(lines.length, requestedEnd, start + 399);
      let chars = 0;
      const returned: Array<{ line: number; text: string }> = [];
      for (let line = start; line <= end; line++) {
        const text = lines[line - 1] ?? '';
        if (chars + text.length > 24_000) break;
        returned.push({ line, text });
        chars += text.length;
      }
      const last = returned.at(-1)?.line ?? start - 1;
      const truncated = last < Math.min(lines.length, requestedEnd);
      return {
        content: serialize({
          ok: true,
          tool,
          source: sourceEnvelope(target),
          data: {
            totalLines: lines.length,
            totalCharacters: target.text.length,
            lines: returned,
            ...(truncated ? { nextStartLine: last + 1 } : {}),
          },
          truncated,
        }),
        display: {
          title: 'Read source',
          summary: `${target.target} lines ${start}–${last}`,
          status: 'success',
          sourceLines: returned.map(({ line }) => line),
        },
      };
    }

    if (tool === 'edit_draft') {
      if (
        !hasOnlyKeys(args, ['expectedRevision', 'expectedHash', 'edits', 'reason']) ||
        !Array.isArray(args.edits) ||
        typeof args.reason !== 'string'
      )
        return failure(tool, 'invalid_arguments', 'Invalid edit_draft properties.');
      const target = sourceTarget(options, 'draft');
      if (args.expectedRevision !== target.revision || args.expectedHash !== target.hash)
        return failure(
          tool,
          'draft_conflict',
          `Current draft is revision ${target.revision}, hash ${target.hash}.`,
        );
      const edits = args.edits as AiSourceEdit[];
      const result = applySourceEdits(target.text, edits);
      if (!result.ok) return failure(tool, 'invalid_edit', result.error);
      const current =
        options.getThread().draft ??
        createDraft(options.liveSource().text, options.liveSource().revision);
      const draft: AiDraftState = {
        ...current,
        text: result.text,
        revision: current.revision + 1,
        hash: hashSource(result.text),
        status:
          current.base.revision === options.liveSource().revision &&
          current.base.hash === hashSource(options.liveSource().text)
            ? 'changed'
            : 'stale',
        lastCompile: undefined,
      };
      options.updateDraft(draft);
      const changedLines = edits.flatMap((edit) => [edit.startLine, edit.endLine]);
      return {
        content: serialize({
          ok: true,
          tool,
          source: { target: 'draft', revision: draft.revision, hash: draft.hash },
          data: {
            reason: args.reason.slice(0, 240),
            addedLines: result.addedLines,
            removedLines: result.removedLines,
            changedLineRange: { start: Math.min(...changedLines), end: Math.max(...changedLines) },
            preview: result.text
              .split(/\r?\n/)
              .slice(Math.max(0, Math.min(...changedLines) - 2), Math.min(...changedLines) + 5)
              .join('\n'),
          },
        }),
        display: {
          title: 'Edited private draft',
          summary: `${edits.length} edit(s) · revision ${draft.revision}`,
          status: 'success',
          sourceLines: changedLines,
        },
      };
    }

    if (!['compile_design', 'inspect_spatial', 'inspect_physics'].includes(tool))
      return failure(tool, 'unknown_tool', `Unknown tool: ${tool}`, false);
    const allowedKeys =
      tool === 'compile_design'
        ? ['target', 'seed']
        : tool === 'inspect_spatial'
          ? ['target', 'scope', 'sourceLines', 'box', 'includeOccupancy']
          : ['target', 'severities', 'codes', 'sourceLines', 'limit', 'cursor'];
    if (!hasOnlyKeys(args, allowedKeys))
      return failure(tool, 'invalid_arguments', `Unknown ${tool} property.`);
    const target = sourceTarget(options, args.target);
    const seed = Number.isInteger(args.seed) ? Number(args.seed) : undefined;
    const compiled = await compileTarget(tool, target, seed);
    if (compiled.error) return compiled.error;
    const response = compiled.result!;
    if (!response.ok) {
      const lines = target.text.split(/\r?\n/);
      return {
        content: serialize({
          ok: false,
          tool,
          source: sourceEnvelope(target),
          error: { code: 'compile_error', message: response.message, retryable: true },
          data:
            response.slLine === undefined
              ? undefined
              : { line: response.slLine, sourceLine: lines[response.slLine - 1] ?? '' },
        }),
        display: {
          title: 'Compile failed',
          summary: response.slLine
            ? `Line ${response.slLine}: ${response.message}`
            : response.message,
          status: 'error',
          sourceLines: response.slLine ? [response.slLine] : undefined,
        },
      };
    }
    if (target.target === 'draft') {
      const draft = options.getThread().draft;
      if (draft && draft.hash === target.hash) {
        const counts = response.result.physics?.summary;
        options.updateDraft({
          ...draft,
          lastCompile: {
            ok: true,
            at: Date.now(),
            summary: `${response.stats.stitches} stitches · ${counts?.error ?? 0} blockers · ${counts?.warning ?? 0} risks`,
            stitches: response.stats.stitches,
            blockers: counts?.error ?? 0,
            risks: counts?.warning ?? 0,
          },
        });
      }
    }
    if (tool === 'compile_design') {
      const summary = compileSummary(response);
      return {
        content: serialize({
          ok: true,
          tool,
          source: sourceEnvelope(target),
          data: { ...summary, cached: compiled.cached },
        }),
        display: {
          title: 'Compiled design',
          summary: `${response.stats.stitches.toLocaleString()} stitches · ${response.result.physics?.summary.error ?? 0} blocker(s) · ${response.result.physics?.summary.warning ?? 0} risk(s)${compiled.cached ? ' · cached' : ''}`,
          status: (response.result.physics?.summary.error ?? 0) > 0 ? 'warning' : 'success',
        },
      };
    }
    if (tool === 'inspect_spatial') {
      const scope = args.scope === 'source-lines' || args.scope === 'box' ? args.scope : 'design';
      let data: unknown;
      let sourceLines: number[] | undefined;
      if (scope === 'source-lines') {
        sourceLines = Array.isArray(args.sourceLines)
          ? args.sourceLines
              .filter((line): line is number => Number.isInteger(line) && Number(line) > 0)
              .slice(0, 24)
          : [];
        data = {
          coordinates: '+x right, +y up, origin at hoop centre, millimetres',
          lines: lineSpatial(response.result.events, sourceLines),
        };
      } else if (scope === 'box' && args.box && typeof args.box === 'object') {
        const box = args.box as { minX: number; minY: number; maxX: number; maxY: number };
        if (
          ![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) ||
          box.maxX < box.minX ||
          box.maxY < box.minY
        )
          return failure(tool, 'invalid_box', 'Spatial box coordinates are invalid.');
        const matches = response.result.events.filter(
          (event) =>
            (event.t === 'stitch' || event.t === 'jump') &&
            event.x >= box.minX &&
            event.x <= box.maxX &&
            event.y >= box.minY &&
            event.y <= box.maxY,
        );
        sourceLines = [
          ...new Set(
            matches.map(eventSourceLine).filter((line): line is number => line !== undefined),
          ),
        ].slice(0, 24);
        data = {
          note: 'This is an event query, not semantic object naming.',
          box,
          events: matches.length,
          stitches: matches.filter(({ t }) => t === 'stitch').length,
          colors: [...new Set(matches.map(({ c }) => c))],
          sourceLines,
        };
      } else {
        data = { digest: buildSpatialDigest(response.result, response.stats) };
      }
      return {
        content: serialize({ ok: true, tool, source: sourceEnvelope(target), data }),
        display: {
          title: 'Inspected spatial layout',
          summary:
            scope === 'design'
              ? `${response.stats.width.toFixed(1)} × ${response.stats.height.toFixed(1)} mm`
              : `${scope} query`,
          status: 'success',
          sourceLines,
        },
      };
    }
    const report = response.result.physics;
    let diagnostics = report?.diagnostics ?? [];
    const severities = Array.isArray(args.severities) ? args.severities : null;
    const codes = Array.isArray(args.codes) ? args.codes : null;
    const requestedLines = Array.isArray(args.sourceLines) ? args.sourceLines : null;
    if (severities)
      diagnostics = diagnostics.filter(({ severity }) => severities.includes(severity));
    if (codes) diagnostics = diagnostics.filter(({ code }) => codes.includes(code));
    if (requestedLines)
      diagnostics = diagnostics.filter(({ sourceLocations }) =>
        sourceLocations.some(({ line }) => requestedLines.includes(line)),
      );
    const offset =
      typeof args.cursor === 'string' ? Math.max(0, Number.parseInt(args.cursor, 10) || 0) : 0;
    const limit = Number.isInteger(args.limit) ? Math.min(20, Number(args.limit)) : 10;
    const page = diagnostics.slice(offset, offset + limit);
    const lines = target.text.split(/\r?\n/);
    return {
      content: serialize({
        ok: true,
        tool,
        source: sourceEnvelope(target),
        data: {
          reportVersion: report?.version,
          catalogVersion: report?.catalogVersion,
          thresholdVersion: report?.thresholdVersion,
          summary: report?.summary,
          assumptions: report?.assumptions,
          material: report?.material,
          findings: page.map((diagnostic) => boundedDiagnostic(diagnostic, lines)),
          nextCursor: offset + limit < diagnostics.length ? String(offset + limit) : undefined,
        },
      }),
      display: {
        title: 'Inspected physics',
        summary: `${page.length} of ${diagnostics.length} finding(s)`,
        status: page.some(({ severity }) => severity === 'error') ? 'warning' : 'success',
        sourceLines: [
          ...new Set(
            page.flatMap(({ sourceLocations }) => sourceLocations.map(({ line }) => line)),
          ),
        ],
        diagnosticIds: page.map(({ id }) => id),
      },
    };
  };
}
