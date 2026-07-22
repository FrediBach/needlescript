/**
 * Builds the AI system prompt and message arrays for NeedleScript AI generation.
 * Exported functions are browser-safe (no DOM, no Node APIs).
 */

import rawSystemPrompt from '../../../docs/ai-system-prompt.md?raw';
import type {
  DiagnosticBounds,
  DiagnosticGeometry,
  PhysicsDiagnostic,
  PhysicsReport,
  PreflightSeverity,
} from '../core/types.ts';
import type { AiSpatialContext } from './ai-spatial.ts';

export type AiCommandType = 'create' | 'improve' | 'fix' | 'explain' | 'default';

export type ChatContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; imageUrl: { url: string; detail: 'low' } };

export type ChatMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | ChatContentPart[] };

export interface AiPhysicsFeedback {
  content: string;
  counts: Record<'error' | 'warning', number>;
  fingerprints: string[];
  diagnostics: PhysicsDiagnostic[];
}

const MAX_AI_PHYSICS_FINDINGS = 8;
const MAX_AI_SOURCE_LOCATIONS = 4;
const ACTIONABLE_SEVERITIES: ReadonlySet<PreflightSeverity> = new Set(['error', 'warning']);
const SEVERITY_PRIORITY: Record<PreflightSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = rawSystemPrompt;

// ─── Message builders ─────────────────────────────────────────────────────────

function withSpatialContent(text: string, spatial?: AiSpatialContext): string | ChatContentPart[] {
  if (!spatial) return text;
  const contextualText = `${text}\n\n${spatial.content}`;
  return spatial.imageDataUrl
    ? [
        { type: 'text', text: contextualText },
        {
          type: 'image_url',
          imageUrl: { url: spatial.imageDataUrl, detail: 'low' },
        },
      ]
    : contextualText;
}

/**
 * Extracts plain NeedleScript code from an AI response, stripping markdown fences.
 */
export function extractCode(response: string): string {
  // Try to find a fenced code block
  const fenced = response.match(/```(?:needlescript|ns|text)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // If the whole response looks like plain code (no markdown formatting), return as-is
  // Heuristic: if it doesn't start with typical prose words, treat as code
  const trimmed = response.trim();
  if (
    !trimmed.startsWith('#') &&
    !trimmed.match(/^(here|this|the|i |sure|let me|of course|certainly)/i)
  ) {
    return trimmed;
  }
  // Fall back: strip any ``` fences and return
  return trimmed
    .replace(/^```\w*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

/**
 * Builds the chat messages array for a given command type.
 * The returned messages include the system prompt plus the user request.
 */
export function buildMessages(
  type: AiCommandType,
  instruction: string,
  source?: string,
  lastError?: string,
  spatial?: AiSpatialContext,
): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: SYSTEM_PROMPT };

  const hasSource = source && source.trim().length > 0;
  const codeCtx = hasSource
    ? `\n\nCurrent NeedleScript code:\n\`\`\`\n${source.trim()}\n\`\`\``
    : '';

  const errorCtx = lastError ? `\n\nLast compile error:\n${lastError}` : '';

  const outputInstruction =
    'Return ONLY the complete NeedleScript code. No markdown, no explanation, no code fences. Just the raw code.';

  let userContent: string;

  switch (type) {
    case 'create':
      userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      break;

    case 'improve':
      userContent = `Improve the following NeedleScript code: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      break;

    case 'fix':
      userContent = `Fix the following NeedleScript code: ${instruction}${codeCtx}${errorCtx}\n\n${outputInstruction}`;
      break;

    case 'explain':
      userContent = `Explain the following NeedleScript code: ${instruction}${codeCtx}\n\nAnswer concisely in plain text. Do not produce code unless it directly illustrates your answer.`;
      break;

    case 'default':
    default:
      if (hasSource) {
        // Has existing code — treat as an improvement/modification
        userContent = `Modify the NeedleScript code as follows: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      } else {
        // No code yet — treat as a create
        userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      }
      break;
  }

  return [system, { role: 'user', content: withSpatialContent(userContent, spatial) }];
}

/**
 * Builds a retry message array when generated code fails to compile.
 * Appends an assistant turn (the bad code) plus a user follow-up asking to fix it.
 */
export function buildRetryMessages(
  originalMessages: ChatMessage[],
  badCode: string,
  compileError: string,
  line?: number,
): ChatMessage[] {
  const sourceLine = line === undefined ? undefined : badCode.split(/\r?\n/)[line - 1];
  const lineContext =
    line === undefined
      ? ''
      : `\nReported source line: ${line}${sourceLine === undefined ? '' : `\n${line} | ${sourceLine}`}`;
  return [
    ...originalMessages,
    { role: 'assistant', content: badCode },
    {
      role: 'user',
      content: `The code you generated has a compile error:\n${compileError}${lineContext}\n\nPlease fix it and return ONLY the corrected NeedleScript code. No markdown, no explanation.`,
    },
  ];
}

function formatSourceLocations(diagnostic: PhysicsDiagnostic, lines: readonly string[]): string[] {
  if (diagnostic.sourceLocations.length === 0) {
    return diagnostic.sourceReason ? [`Source: ${diagnostic.sourceReason.explanation}`] : [];
  }

  const locations = diagnostic.sourceLocations.slice(0, MAX_AI_SOURCE_LOCATIONS);
  const formatted = locations.map((location) => {
    const columns =
      location.startColumn === undefined
        ? ''
        : `:${location.startColumn}${
            location.endColumn === undefined ? '' : `-${location.endColumn}`
          }`;
    const sourceLine = lines[location.line - 1];
    return `Source (${location.role}): line ${location.line}${columns}${
      sourceLine === undefined ? '' : `\n${location.line} | ${sourceLine}`
    }`;
  });
  const omitted = diagnostic.sourceLocations.length - locations.length;
  return omitted > 0 ? [...formatted, `Source: ${omitted} related location(s) omitted`] : formatted;
}

function boundsForGeometry(geometry: DiagnosticGeometry): DiagnosticBounds | undefined {
  if (geometry.bounds) return geometry.bounds;
  const points =
    geometry.kind === 'points' || geometry.kind === 'polyline'
      ? geometry.points
      : geometry.kind === 'cell'
        ? [
            { x: geometry.x, y: geometry.y },
            { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
          ]
        : geometry.rings.flat();
  if (!points.length) return undefined;
  return points.reduce<DiagnosticBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function formatCoordinate(value: number): string {
  return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

function formatDiagnosticGeometry(diagnostic: PhysicsDiagnostic): string | null {
  if (!diagnostic.geometry.length) return null;
  const selected = diagnostic.geometry.slice(0, 3);
  const descriptions = selected.map((geometry) => {
    const bounds = boundsForGeometry(geometry);
    const anchor =
      geometry.anchor ??
      (bounds
        ? {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
          }
        : undefined);
    const position = anchor
      ? ` near (${formatCoordinate(anchor.x)}, ${formatCoordinate(anchor.y)}) mm`
      : '';
    const extent = bounds
      ? ` spanning x ${formatCoordinate(bounds.minX)}..${formatCoordinate(bounds.maxX)}, y ${formatCoordinate(bounds.minY)}..${formatCoordinate(bounds.maxY)} mm`
      : '';
    return `${geometry.role} ${geometry.kind}${position}${extent}`;
  });
  const omitted = diagnostic.geometry.length - selected.length;
  return `Geometry: ${descriptions.join('; ')}${omitted > 0 ? `; ${omitted} additional shape(s) omitted` : ''}`;
}

function formatPhysicsDiagnostic(diagnostic: PhysicsDiagnostic, lines: readonly string[]): string {
  const details = [
    `[${diagnostic.severity.toUpperCase()}] ${diagnostic.code} — ${diagnostic.title}`,
    ...formatSourceLocations(diagnostic, lines),
    `Finding: ${diagnostic.explanation}`,
  ];

  const geometry = formatDiagnosticGeometry(diagnostic);
  if (geometry) details.push(geometry);

  if (diagnostic.measurements?.length) {
    details.push(
      `Measurements: ${diagnostic.measurements
        .slice(0, 4)
        .map(
          ({ label, value, unit, comparison, threshold }) =>
            `${label} ${value} ${unit}${
              threshold === undefined
                ? ''
                : ` (${comparison ?? 'vs'} threshold ${threshold} ${unit})`
            }`,
        )
        .join('; ')}`,
    );
  }
  if (diagnostic.methodology) details.push(`Method: ${diagnostic.methodology}`);
  if (diagnostic.limitations?.length) {
    details.push(`Limitations: ${diagnostic.limitations.join(' ')}`);
  }
  if (diagnostic.performanceCap) details.push(`Analysis cap: ${diagnostic.performanceCap}`);
  if (diagnostic.remedies.length) {
    details.push(
      `Suggested remedies: ${diagnostic.remedies
        .slice(0, 2)
        .map(({ title, description }) => `${title} — ${description}`)
        .join('; ')}`,
    );
  }
  const evidenceReferences = diagnostic.evidenceReferences
    .map(({ title, version, status }) => `${title} v${version} [${status}]`)
    .join('; ');
  const hasPendingEvidence = diagnostic.evidenceReferences.some(
    ({ status }) => status === 'pending',
  );
  details.push(
    `Evidence: ${diagnostic.evidence}; threshold set: ${diagnostic.thresholdVersion}${
      evidenceReferences ? `; references: ${evidenceReferences}` : ''
    }${hasPendingEvidence ? '; physical validation is pending' : ''}`,
  );
  return details.join('\n');
}

/**
 * Converts the structured physics report into compact, source-linked model feedback.
 * Informational notes remain visible in the UI but do not trigger automatic source changes.
 */
export function buildPhysicsFeedback(
  report: PhysicsReport | undefined,
  source: string,
): AiPhysicsFeedback | null {
  if (!report) return null;
  const actionable = report.diagnostics
    .filter(({ severity }) => ACTIONABLE_SEVERITIES.has(severity))
    .toSorted(
      (a, b) =>
        SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity] ||
        Number(b.sourceLocations.length > 0) - Number(a.sourceLocations.length > 0) ||
        a.code.localeCompare(b.code),
    );
  if (actionable.length === 0) return null;

  const selected = actionable.slice(0, MAX_AI_PHYSICS_FINDINGS);
  const lines = source.split(/\r?\n/);
  const omitted = actionable.length - selected.length;
  const assumptions = report.assumptions
    .map(({ label, value, source: assumptionSource }) => `${label}=${value} (${assumptionSource})`)
    .join('; ');
  const content = [
    `Physics review found ${report.summary.error} blocker(s) and ${report.summary.warning} risk(s).`,
    `Report v${report.version}; threshold set ${report.thresholdVersion}; machine profile ${report.profile.name}.`,
    assumptions ? `Analysis assumptions: ${assumptions}` : '',
    ...selected.map(
      (diagnostic, index) =>
        `\nFinding ${index + 1}\n${formatPhysicsDiagnostic(diagnostic, lines)}`,
    ),
    omitted > 0 ? `\n${omitted} lower-priority finding(s) omitted from this pass.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    content,
    counts: { error: report.summary.error, warning: report.summary.warning },
    fingerprints: selected.map(({ fingerprint }) => fingerprint),
    diagnostics: selected,
  };
}

/** Adds a successful compile's physics findings as the next revision turn. */
export function buildPhysicsRetryMessages(
  originalMessages: ChatMessage[],
  code: string,
  feedback: AiPhysicsFeedback,
  spatial?: AiSpatialContext,
): ChatMessage[] {
  return [
    ...originalMessages,
    { role: 'assistant', content: code },
    {
      role: 'user',
      content: withSpatialContent(
        `${feedback.content}\n\nRevise the complete program to address these findings, prioritizing blockers and then risks. Preserve the requested design and intentional geometry. Use the source locations, spatial evidence, and construction remedies above. Do not hide findings by weakening limits, removing material intent, adding preflight, or acknowledging/silencing diagnostics. Return ONLY the complete corrected NeedleScript code. No markdown or explanation.`,
        spatial,
      ),
    },
  ];
}

/** Adds one bounded review of the compiled spatial result, even when physics is clean. */
export function buildSpatialReviewMessages(
  originalMessages: ChatMessage[],
  code: string,
  spatial: AiSpatialContext,
): ChatMessage[] {
  const instruction =
    'Review the compiled design against the original request using the spatial context and rendered preview. Check composition, placement, scale, balance, negative space, color relationships, and whether the visible result matches the requested intent. The preview shows the actual compiled stitch plan, not a conceptual illustration. If it already satisfies the request, return the complete source unchanged. Otherwise make only purposeful spatial improvements. Return ONLY the complete NeedleScript code. No markdown or explanation.';
  return [
    ...originalMessages,
    { role: 'assistant', content: code },
    { role: 'user', content: withSpatialContent(instruction, spatial) },
  ];
}

/** Help text shown for /ai help */
export const AI_HELP_TEXT = `AI commands (prefix: /ai):
  apikey <key>       — set your OpenRouter API key (stored in browser)
  model <fuzzy>      — select model (e.g. "claude sonnet 4.5" or "gpt-4o")
  credits            — show remaining OpenRouter credit balance
  reset              — clear API key and model selection
  help               — show this message
  create <desc>      — generate new code from description
  improve <desc>     — improve current code
  fix <desc>         — fix current code (includes last error)
  explain <question> — explain the current code or a specific line
  <anything>         — shorthand for create/improve depending on context

Generated code is compiled and reviewed for spatial intent and modeled physics blockers/risks with up to 2 revisions. Vision-capable models also receive rendered previews.
With a key and model selected, right-click selected code or a statement and choose "Explain with AI" for a source- and preview-aware explanation.
Open the AI tab beside Console and Physics to inspect requests, usage, checks, and feedback.

Tip: Start typing "/ai model " to see model suggestions.`;
