import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
} from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import type { ConsoleMessage } from '../App.tsx';
import type { LineStitchBounds } from '../App.tsx';
import type {
  ChalkDataVar,
  PhysicsDiagnostic,
  PhysicsReport,
  ReferenceDataVar,
  WarningLocation,
} from '../lib/engine.ts';
import type { ParamItem } from '../lib/editor/parameters.ts';
import type { AIModelInfo } from '../hooks/useAI.ts';
import { registerNeedlescript, scheduleNeedlescriptProviders } from '../lib/editor/monaco.ts';
import { fontMono, fsBase, editorLineHeight } from '../theme.ts';
import {
  updateParameter,
  updatePointParameter,
  updatePaletteParameter,
  updateTextParameter,
} from '../lib/editor/parameters.ts';
import type { ParamChange } from './ParametersPanel.tsx';
import Splitter from './Splitter.tsx';
import ParametersPanel from './ParametersPanel.tsx';
import styles from './EditorPane.module.css';
import { Input } from '@/components/ui/input.tsx';
import type { EditorContextActions } from './MachineMenu.tsx';
import PhysicsPanel from './PhysicsPanel.tsx';
import type { PhysicsReportState } from '../physics-analysis-state.ts';
import {
  adjacentPhysicsDiagnostic,
  buildPhysicsMonacoMarkers,
  COMPILER_MARKER_OWNER,
  PHYSICS_MARKER_OWNER,
  physicsCodeActions,
  physicsDiagnosticMarkerMessage,
  physicsDiagnosticsAtPosition,
} from './physics-monaco-model.ts';
import {
  comparePhysicsQuickFix,
  physicsQuickFixForDiagnostic,
  type PhysicsQuickFix,
  type PhysicsQuickFixOutcome,
} from './physics-remedies-model.ts';

interface Props {
  source: string;
  parameterItems: ParamItem[];
  onSourceChange: (src: string) => void;
  onEditorReady?: () => void;
  onRun: (src?: string) => void;
  onAnalysisInteractionChange: (active: boolean) => void;
  messages: ConsoleMessage[];
  physics?: PhysicsReport;
  physicsReportState: PhysicsReportState;
  physicsProjectKey: string;
  selectedDiagnosticId: string | null;
  onDiagnosticHover: (diagnostic: PhysicsDiagnostic | null) => void;
  onDiagnosticSelect: (diagnostic: PhysicsDiagnostic) => void;
  onDiagnosticClear: () => void;
  isDragging: boolean;
  activeLine: number | null; // source line currently sewing (playback), 1-based
  onWarnHover: (loc: WarningLocation | null) => void;
  /** Compiler error markers to display as squiggles in the editor.
   *  Pass an empty array (or omit) to clear any existing markers. */
  errorMarkers?: ReadonlyArray<{ message: string; line: number }>;
  /** Per-line stitch bounds from the current compile. When provided, hovering a
   *  line that produced stitches shows a tooltip with count and mm bounds. */
  lineStitchMap?: Map<number, LineStitchBounds>;
  /** Called when the hovered source line changes (content or gutter). Drives the
   *  canvas bounding-box overlay. Called with null on mouse-leave. */
  onHoverLine?: (line: number | null) => void;
  /** Called when an /ai <command> is entered in the REPL. */
  onAiCommand?: (input: string) => Promise<void>;
  /** Model list from the AI hook — used for /ai model <…> autocomplete. */
  aiModels?: AIModelInfo[];
  /** Currently selected AI model ID. */
  aiSelectedModel?: string;
  /** Whether an AI API key is stored. */
  aiHasApiKey?: boolean;
  /** Whether the AI hook is currently generating. */
  aiIsGenerating?: boolean;
  /** Called when a non-/ai slash command is entered (/share, /save, /load, /remove). */
  onReplCommand?: (line: string) => Promise<void>;
  /** Sorted list of saved snippet names — drives /load and /remove autocomplete. */
  savedSnippetNames?: string[];
  /** The active snippet name (set by /save or /load, cleared by loading external content).
   *  Shown as a badge; non-null means /autosave is available. */
  activeSnippetName?: string | null;
  style?: React.CSSProperties;
  // ── XY handle cross-link ─────────────────────────────────────────────────
  /** Lock state managed here so the stage can also show locked handles */
  lockedParams: Set<string>;
  onToggleLock: (name: string) => void;
  /** Notified when a panel row is hovered or Locate is clicked */
  onHighlightHandle?: (name: string | null) => void;
  /** Which handle name the stage is currently highlighting */
  highlightedHandle?: string | null;
  dataVars: ChalkDataVar[];
  referenceVars: ReferenceDataVar[];
  pinnedDataVars: Set<string>;
  onTogglePinnedDataVar: (name: string) => void;
  onHoverDataVar: (name: string | null) => void;
  /** Opens the shared machine/fabric context menu. */
  onMachineContextMenu?: (x: number, y: number, editorActions?: EditorContextActions) => void;
}

// Font settings — sourced from theme.ts to stay in sync with the design system
const EDITOR_FONT_FAMILY = fontMono;
const EDITOR_FONT_SIZE = fsBase;
const EDITOR_LINE_HEIGHT = editorLineHeight; // 20 px

// CSS class applied to the whole-line decoration while the playback line is
// active. Must be a global (non-hashed) name since Monaco injects the class
// into its own DOM — the matching rule lives in EditorPane.module.css as a
// :global block.
const ACTIVE_LINE_CLASS = 'ns-playback-line';
const PHYSICS_PRIMARY_LINE_CLASS = 'ns-physics-selected-primary';
const PHYSICS_CONTRIBUTOR_LINE_CLASS = 'ns-physics-selected-contributor';
const PHYSICS_RELATED_LINE_CLASS = 'ns-physics-selected-related';
const PHYSICS_PREVIEW_FIX_ACTION = 'needlescript.physics.previewQuickFix';

interface PendingPhysicsQuickFix {
  beforeSource: string;
  expectedSource: string;
  baseline: PhysicsReport;
  diagnostic: PhysicsDiagnostic;
}

interface PhysicsQuickFixUiState {
  preview: PhysicsQuickFix | null;
  outcome: PhysicsQuickFixOutcome | null;
  pending: PendingPhysicsQuickFix | null;
}

type PhysicsQuickFixUiAction =
  | { type: 'preview'; fix: PhysicsQuickFix }
  | { type: 'cancel-preview' }
  | { type: 'apply-started'; pending: PendingPhysicsQuickFix }
  | { type: 'apply-failed'; outcome: PhysicsQuickFixOutcome }
  | { type: 'dismiss-outcome' };

function physicsQuickFixUiReducer(
  state: PhysicsQuickFixUiState,
  action: PhysicsQuickFixUiAction,
): PhysicsQuickFixUiState {
  switch (action.type) {
    case 'preview':
      return { preview: action.fix, outcome: null, pending: null };
    case 'cancel-preview':
      return { ...state, preview: null };
    case 'apply-started':
      return {
        preview: null,
        outcome: {
          status: 'checking',
          message: 'Change applied as one editor transaction. Recompiling and comparing findings…',
          introduced: [],
        },
        pending: action.pending,
      };
    case 'apply-failed':
      return { preview: null, outcome: action.outcome, pending: null };
    case 'dismiss-outcome':
      return { ...state, outcome: null, pending: null };
  }
}

// Prefix that triggers AI command mode in the REPL.
const AI_TRIGGER = '/ai';
// Prefix that triggers model autocomplete.
const MODEL_TRIGGER = '/ai model ';
// Prefixes that trigger snippet name autocomplete.
const LOAD_TRIGGER = '/load ';
const REMOVE_TRIGGER = '/remove ';
// Maximum suggestions shown at once.
const MAX_SUGGESTIONS = 8;
// Keep customizer previews responsive without compiling on every pointer event.
const CUSTOMIZER_PREVIEW_THROTTLE_MS = 250;

export default function EditorPane({
  source,
  parameterItems,
  onSourceChange,
  onEditorReady,
  onRun,
  onAnalysisInteractionChange,
  messages,
  physics,
  physicsReportState,
  physicsProjectKey,
  selectedDiagnosticId,
  onDiagnosticHover,
  onDiagnosticSelect,
  onDiagnosticClear,
  isDragging,
  activeLine,
  onWarnHover,
  errorMarkers,
  lineStitchMap,
  onHoverLine,
  onAiCommand,
  aiModels,
  aiSelectedModel,
  aiHasApiKey,
  aiIsGenerating,
  onReplCommand,
  savedSnippetNames,
  activeSnippetName,
  style,
  lockedParams,
  onToggleLock,
  onHighlightHandle,
  highlightedHandle,
  dataVars,
  referenceVars,
  pinnedDataVars,
  onTogglePinnedDataVar,
  onHoverDataVar,
  onMachineContextMenu,
}: Props) {
  const [replValue, setReplValue] = useState('');
  const replHistoryRef = useRef<string[]>([]);
  const replIdxRef = useRef(-1);

  // ── Suggestion state for /ai model autocomplete ─────────────────
  const [suggestionIdx, setSuggestionIdx] = useState(-1);

  // ── Console panel height (vertical split) ──────────────────────────
  const CONSOLE_DEFAULT = 96;
  const CONSOLE_MIN = 40;
  const CONSOLE_MAX = 360;

  const [consoleHeight, setConsoleHeight] = useState(CONSOLE_DEFAULT);
  const [activeBottomTab, setActiveBottomTab] = useState<'console' | 'physics'>('console');
  const [mobilePhysicsSize, setMobilePhysicsSize] = useState<'collapsed' | 'half' | 'full'>('half');
  const [seenBlockerFingerprints, setSeenBlockerFingerprints] = useState<Set<string>>(
    () => new Set(),
  );
  const [lastAutoOpenReport, setLastAutoOpenReport] = useState<PhysicsReport | undefined>();
  const [quickFixUi, dispatchQuickFixUi] = useReducer(physicsQuickFixUiReducer, {
    preview: null,
    outcome: null,
    pending: null,
  });

  const handleConsoleDrag = useCallback((delta: number) => {
    // Positive delta = dragging the handle down = Monaco grows, console shrinks.
    setConsoleHeight((h) => Math.max(CONSOLE_MIN, Math.min(CONSOLE_MAX, h - delta)));
  }, []);

  // Holds the live Monaco editor instance once mounted.
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // Holds the decoration collection for the playback active-line highlight.
  const decoCollRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Holds the decoration collection for brightened line numbers on stitch lines.
  const stitchLineDecoCollRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Selected physics source attribution is independent from playback decoration.
  const physicsDecoCollRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Ref for the console panel — used to auto-scroll to the latest message.
  const consoleRef = useRef<HTMLDivElement>(null);

  // Stable ref so the keyboard-shortcut handler always calls the latest onRun
  // even after source/design state changes rebuild the callback.
  const onRunRef = useRef(onRun);
  const onEditorReadyRef = useRef(onEditorReady);
  const onDiagnosticClearRef = useRef(onDiagnosticClear);
  const onDiagnosticHoverRef = useRef(onDiagnosticHover);
  const onDiagnosticSelectRef = useRef(onDiagnosticSelect);
  const physicsRef = useRef(physics);
  const physicsReportStateRef = useRef(physicsReportState);
  const selectedDiagnosticIdRef = useRef(selectedDiagnosticId);
  // Stable ref to source so the parameter-change handler never captures a
  // stale closure value.
  const sourceRef = useRef(source);

  // Stable refs for the hover-provider and mouse-listener callbacks so they
  // always read the latest props without re-registering Monaco listeners.
  const lineStitchMapRef = useRef(lineStitchMap);
  const onHoverLineRef = useRef(onHoverLine);
  const onMachineContextMenuRef = useRef(onMachineContextMenu);
  useLayoutEffect(() => {
    onRunRef.current = onRun;
    onEditorReadyRef.current = onEditorReady;
    onDiagnosticClearRef.current = onDiagnosticClear;
    onDiagnosticHoverRef.current = onDiagnosticHover;
    onDiagnosticSelectRef.current = onDiagnosticSelect;
    physicsRef.current = physics;
    physicsReportStateRef.current = physicsReportState;
    selectedDiagnosticIdRef.current = selectedDiagnosticId;
    sourceRef.current = source;
    lineStitchMapRef.current = lineStitchMap;
    onHoverLineRef.current = onHoverLine;
    onMachineContextMenuRef.current = onMachineContextMenu;
  }, [
    lineStitchMap,
    onDiagnosticClear,
    onDiagnosticHover,
    onDiagnosticSelect,
    onEditorReady,
    onHoverLine,
    onMachineContextMenu,
    onRun,
    physics,
    physicsReportState,
    selectedDiagnosticId,
    source,
  ]);

  const quickFixes = useMemo(() => {
    const fixes = new Map<string, PhysicsQuickFix>();
    if (!physics || physicsReportState.status !== 'current') return fixes;
    for (const diagnostic of physics.diagnostics) {
      const fix = physicsQuickFixForDiagnostic(source, diagnostic, physics.profile);
      if (fix) fixes.set(diagnostic.id, fix);
    }
    return fixes;
  }, [physics, physicsReportState.status, source]);

  const completedQuickFixOutcome = (() => {
    const pending = quickFixUi.pending;
    if (!pending || source === pending.beforeSource) return null;
    if (source !== pending.expectedSource) {
      return {
        status: 'error',
        message:
          'The source changed before the comparison completed. Run Physics again to review it.',
        introduced: [],
      } satisfies PhysicsQuickFixOutcome;
    }
    if (physicsReportState.status === 'blocked') {
      return {
        status: 'error',
        message: 'The edited source did not compile. Undo the change or revise it before sewing.',
        introduced: [],
      } satisfies PhysicsQuickFixOutcome;
    }
    if (
      physicsReportState.status !== 'current' ||
      physicsReportState.reportRevision !== physicsReportState.sourceRevision ||
      !physics
    )
      return null;
    const comparison = comparePhysicsQuickFix(pending.baseline, physics, pending.diagnostic);
    const targetMessage = comparison.targetResolved
      ? `${pending.diagnostic.title} is no longer reported.`
      : `${pending.diagnostic.title} is still reported after recompiling.`;
    const introduced = comparison.newEqualOrHigher.map(
      ({ title, severity, count }) =>
        `${count > 1 ? `${count}× ` : ''}${title} (${severity === 'error' ? 'blocker' : severity === 'warning' ? 'risk' : 'note'})`,
    );
    return {
      status: introduced.length > 0 ? 'warning' : comparison.targetResolved ? 'success' : 'warning',
      message:
        introduced.length > 0
          ? `${targetMessage} The change introduced new findings of equal or higher severity.`
          : `${targetMessage} No new findings of equal or higher severity were introduced.`,
      introduced,
    } satisfies PhysicsQuickFixOutcome;
  })();

  // Disposables created in handleMount — cleaned up on unmount.
  const stitchHoverProviderRef = useRef<IDisposable | null>(null);
  const physicsHoverProviderRef = useRef<IDisposable | null>(null);
  const physicsCodeActionProviderRef = useRef<IDisposable | null>(null);
  const mouseMoveRef = useRef<IDisposable | null>(null);
  const mouseLeaveRef = useRef<IDisposable | null>(null);
  const mouseDownRef = useRef<IDisposable | null>(null);
  const keyDownRef = useRef<IDisposable | null>(null);
  const contextMenuRef = useRef<IDisposable | null>(null);
  const physicsActionRefs = useRef<IDisposable[]>([]);

  // Leading + trailing customizer throttle. Background idle analysis remains
  // suspended during slider drags, while these explicit preview runs keep the
  // stage live and the compiler queue discards obsolete queued generations.
  const lastCustomizerRunTimeRef = useRef(0);
  const lastCustomizerRunSourceRef = useRef<string | null>(null);
  const customizerRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCustomizerPreview = useCallback((nextSource: string) => {
    if (customizerRunTimerRef.current !== null) {
      clearTimeout(customizerRunTimerRef.current);
      customizerRunTimerRef.current = null;
    }
    lastCustomizerRunTimeRef.current = Date.now();
    lastCustomizerRunSourceRef.current = nextSource;
    onRunRef.current(nextSource);
  }, []);

  const scheduleCustomizerPreview = useCallback(
    (nextSource: string) => {
      const elapsed = Date.now() - lastCustomizerRunTimeRef.current;
      if (elapsed >= CUSTOMIZER_PREVIEW_THROTTLE_MS) {
        runCustomizerPreview(nextSource);
        return;
      }

      if (customizerRunTimerRef.current !== null)
        clearTimeout(customizerRunTimerRef.current);
      customizerRunTimerRef.current = setTimeout(() => {
        runCustomizerPreview(sourceRef.current);
      }, CUSTOMIZER_PREVIEW_THROTTLE_MS - elapsed);
    },
    [runCustomizerPreview],
  );

  useEffect(
    () => () => {
      if (customizerRunTimerRef.current !== null)
        clearTimeout(customizerRunTimerRef.current);
    },
    [],
  );

  const handleParamChange = useCallback(
    (name: string, line: number, value: number | string) => {
      const updated =
        typeof value === 'string'
          ? updateTextParameter(sourceRef.current, line, name, value)
          : updateParameter(sourceRef.current, line, name, value);
      sourceRef.current = updated;
      onSourceChange(updated);
      scheduleCustomizerPreview(updated);
    },
    [onSourceChange, scheduleCustomizerPreview],
  );

  const handleAllParamsChange = useCallback(
    (changes: ParamChange[]) => {
      // Apply every change sequentially to an accumulating source string so all
      // updates land in a single onSourceChange call (avoids last-write-wins when
      // each patched value is read from the same stale sourceRef.current).
      let src = sourceRef.current;
      for (const { name, line, value } of changes) {
        if (Array.isArray(value)) {
          if (typeof value[0] === 'string')
            src = updatePaletteParameter(src, line, name, value as string[]);
          else {
            const point = value as [number, number];
            src = updatePointParameter(src, line, name, point[0], point[1]);
          }
        } else if (typeof value === 'string') {
          src = updateTextParameter(src, line, name, value);
        } else {
          src = updateParameter(src, line, name, value);
        }
      }
      sourceRef.current = src;
      onSourceChange(src);
      runCustomizerPreview(src);
    },
    [onSourceChange, runCustomizerPreview],
  );

  const handleParameterInteractionStart = useCallback(
    () => onAnalysisInteractionChange(true),
    [onAnalysisInteractionChange],
  );
  const handleParameterInteractionEnd = useCallback(() => {
    onAnalysisInteractionChange(false);
    if (customizerRunTimerRef.current !== null) {
      clearTimeout(customizerRunTimerRef.current);
      customizerRunTimerRef.current = null;
    }
    if (lastCustomizerRunSourceRef.current !== sourceRef.current)
      runCustomizerPreview(sourceRef.current);
  }, [onAnalysisInteractionChange, runCustomizerPreview]);

  const selectPhysicsDiagnostic = useCallback(
    (diagnostic: PhysicsDiagnostic) => {
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (ed && model) {
        const primary =
          diagnostic.sourceLocations.find(({ role }) => role === 'primary') ??
          diagnostic.sourceLocations[0];
        if (primary && primary.line >= 1 && primary.line <= model.getLineCount()) {
          ed.setPosition({ lineNumber: primary.line, column: primary.startColumn ?? 1 });
          ed.revealLineInCenter(primary.line, 0);
          ed.focus();
        }
      }
      onDiagnosticSelect(diagnostic);
    },
    [onDiagnosticSelect],
  );

  // Adjust controlled panel state when a new current report arrives. This is
  // guarded by report identity so React performs at most one adjustment per
  // report and no synchronization effect/cascading render is needed.
  if (physics && physicsReportState.status === 'current' && physics !== lastAutoOpenReport) {
    let hasNewBlocker = false;
    const nextSeen = new Set(seenBlockerFingerprints);
    for (const diagnostic of physics.diagnostics) {
      if (diagnostic.severity !== 'error') continue;
      if (!nextSeen.has(diagnostic.fingerprint)) hasNewBlocker = true;
      nextSeen.add(diagnostic.fingerprint);
    }
    setLastAutoOpenReport(physics);
    setSeenBlockerFingerprints(nextSeen);
    if (hasNewBlocker) {
      setActiveBottomTab('physics');
      setConsoleHeight((height) => Math.max(height, 240));
      setMobilePhysicsSize('half');
    }
  }

  useEffect(() => {
    if (!selectedDiagnosticId) return;
    const clearSelection = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDiagnosticClearRef.current();
    };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, [selectedDiagnosticId]);

  // ── Monaco lifecycle callbacks ──────────────────────────────────────
  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    performance.mark('needlescript:editor-before-mount');
    registerNeedlescript(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((ed, monaco) => {
    performance.mark('needlescript:editor-mounted');
    requestAnimationFrame(() => {
      setTimeout(() => {
        performance.mark('needlescript:editor-first-paint');
        performance.measure(
          'needlescript:editor-mount-to-paint',
          'needlescript:editor-before-mount',
          'needlescript:editor-first-paint',
        );
        onEditorReadyRef.current?.();
      }, 0);
    });
    scheduleNeedlescriptProviders(monaco);
    editorRef.current = ed;
    decoCollRef.current = ed.createDecorationsCollection();
    stitchLineDecoCollRef.current = ed.createDecorationsCollection();
    physicsDecoCollRef.current = ed.createDecorationsCollection();

    // Cmd/Ctrl + Enter → run the program (mirrors the original textarea shortcut).
    // Pass sourceRef.current explicitly so the latest source is used even if
    // React hasn't committed a re-render since the last Monaco onChange.
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current(sourceRef.current);
    });

    // ── Stitch-bounds hover tooltip ───────────────────────────────────────
    // A second hover provider (merged with the built-in docs provider) that
    // shows the stitch count and mm bounding box for lines that produce stitches.
    stitchHoverProviderRef.current = monaco.languages.registerHoverProvider('needlescript', {
      provideHover(_model, position) {
        const ln = position.lineNumber;
        const b = lineStitchMapRef.current?.get(ln);
        if (!b) return null;
        return {
          range: new monaco.Range(ln, 1, ln, 1),
          contents: [
            { value: `**${b.count} stitch${b.count === 1 ? '' : 'es'}**` },
            {
              value: `x: ${b.minX.toFixed(1)} – ${b.maxX.toFixed(1)} mm\n\ny: ${b.minY.toFixed(1)} – ${b.maxY.toFixed(1)} mm`,
            },
          ],
        };
      },
    });

    // Physics hover content is sourced from the same structured finding used
    // by the panel and stage. Multiple findings on one span prefer the current
    // persistent selection, then primary attribution and severity.
    physicsHoverProviderRef.current = monaco.languages.registerHoverProvider('needlescript', {
      provideHover(model, position) {
        const diagnostic = physicsDiagnosticsAtPosition(
          physicsRef.current?.diagnostics ?? [],
          position.lineNumber,
          position.column,
          selectedDiagnosticIdRef.current,
        )[0];
        if (!diagnostic) return null;
        const location =
          diagnostic.sourceLocations.find(
            ({ line, startColumn, endColumn }) =>
              line === position.lineNumber &&
              (startColumn === undefined ||
                (position.column >= startColumn &&
                  position.column < (endColumn ?? startColumn + 1))),
          ) ?? diagnostic.sourceLocations[0];
        if (!location) return null;
        const lineLength = model.getLineLength(location.line);
        const startColumn = Math.max(1, Math.min(location.startColumn ?? 1, lineLength + 1));
        const endColumn = Math.max(
          startColumn + Number(startColumn <= lineLength),
          Math.min(location.endColumn ?? lineLength + 1, lineLength + 1),
        );
        return {
          range: new monaco.Range(location.line, startColumn, location.line, endColumn),
          contents: [
            {
              value: physicsDiagnosticMarkerMessage(diagnostic, location.role),
            },
            { value: `Open Physics and select this finding with **F8**.` },
          ],
        };
      },
    });

    // Register the provider now so PI-8 can add proven, previewable edits
    // without changing editor lifecycle. PI-6 intentionally returns no edits.
    physicsCodeActionProviderRef.current = monaco.languages.registerCodeActionProvider(
      'needlescript',
      {
        provideCodeActions(_model, range) {
          if (physicsReportStateRef.current.status !== 'current')
            return { actions: [], dispose() {} };
          const fixes = physicsCodeActions(
            sourceRef.current,
            physicsRef.current,
            range.startLineNumber,
            range.startColumn,
          );
          return {
            actions: fixes.map((fix) => ({
              title: `Preview: ${fix.title}`,
              kind: 'quickfix',
              command: {
                id: PHYSICS_PREVIEW_FIX_ACTION,
                title: `Preview: ${fix.title}`,
                arguments: [fix.id],
              },
            })),
            dispose() {},
          };
        },
      },
    );

    // ── Canvas overlay trigger ────────────────────────────────────────────
    // Fire onHoverLine whenever the cursor enters a line (content text or the
    // line-number gutter). The hover provider above handles the tooltip;
    // onHoverLine drives the semi-transparent rect drawn on the canvas.
    const GUTTER = monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS; // 3
    const CONTENT = monaco.editor.MouseTargetType.CONTENT_TEXT; // 6
    mouseMoveRef.current = ed.onMouseMove((e) => {
      const t = e.target;
      if (t.type === GUTTER || t.type === CONTENT) {
        const line = t.position?.lineNumber ?? null;
        onHoverLineRef.current?.(line);
        const diagnostic =
          line === null
            ? undefined
            : physicsDiagnosticsAtPosition(
                physicsRef.current?.diagnostics ?? [],
                line,
                t.type === CONTENT ? t.position?.column : undefined,
                selectedDiagnosticIdRef.current,
              )[0];
        onDiagnosticHoverRef.current(diagnostic ?? null);
      } else {
        onHoverLineRef.current?.(null);
        onDiagnosticHoverRef.current(null);
      }
    });
    mouseLeaveRef.current = ed.onMouseLeave(() => {
      onHoverLineRef.current?.(null);
      onDiagnosticHoverRef.current(null);
    });
    mouseDownRef.current = ed.onMouseDown((event) => {
      const target = event.target;
      if (target.type !== GUTTER && target.type !== CONTENT) return;
      const line = target.position?.lineNumber;
      if (line === undefined) return;
      const diagnostic = physicsDiagnosticsAtPosition(
        physicsRef.current?.diagnostics ?? [],
        line,
        target.type === CONTENT ? target.position?.column : undefined,
        selectedDiagnosticIdRef.current,
      )[0];
      if (diagnostic) {
        setActiveBottomTab('physics');
        setConsoleHeight((height) => Math.max(height, 240));
        onDiagnosticSelectRef.current(diagnostic);
      }
    });
    keyDownRef.current = ed.onKeyDown((event) => {
      if (event.keyCode === monaco.KeyCode.Escape && selectedDiagnosticIdRef.current) {
        onDiagnosticClearRef.current();
      }
    });

    const navigatePhysics = (direction: 1 | -1) => {
      const diagnostic = adjacentPhysicsDiagnostic(
        physicsRef.current?.diagnostics ?? [],
        selectedDiagnosticIdRef.current,
        direction,
      );
      if (!diagnostic) return;
      const location =
        diagnostic.sourceLocations.find(({ role }) => role === 'primary') ??
        diagnostic.sourceLocations[0];
      const model = ed.getModel();
      if (location && model && location.line >= 1 && location.line <= model.getLineCount()) {
        ed.setPosition({ lineNumber: location.line, column: location.startColumn ?? 1 });
        ed.revealLineInCenter(location.line, 0);
        ed.focus();
      }
      setActiveBottomTab('physics');
      setConsoleHeight((height) => Math.max(height, 240));
      onDiagnosticSelectRef.current(diagnostic);
    };
    physicsActionRefs.current = [
      ed.addAction({
        id: PHYSICS_PREVIEW_FIX_ACTION,
        label: 'Preview Physics Quick Fix',
        run: (_editor, ...args: unknown[]) => {
          if (physicsReportStateRef.current.status !== 'current') return;
          const position = ed.getPosition();
          if (!position) return;
          const fixes = physicsCodeActions(
            sourceRef.current,
            physicsRef.current,
            position.lineNumber,
            position.column,
          );
          const requestedId = typeof args[0] === 'string' ? args[0] : undefined;
          const fix = fixes.find(({ id }) => id === requestedId) ?? fixes[0];
          if (!fix) return;
          const diagnostic = physicsRef.current?.diagnostics.find(
            ({ id }) => id === fix.diagnosticId,
          );
          if (diagnostic) onDiagnosticSelectRef.current(diagnostic);
          dispatchQuickFixUi({ type: 'preview', fix });
          setActiveBottomTab('physics');
          setConsoleHeight((height) => Math.max(height, 280));
        },
      }),
      ed.addAction({
        id: 'needlescript.physics.next',
        label: 'Next Physics Finding',
        keybindings: [monaco.KeyCode.F8],
        run: () => navigatePhysics(1),
      }),
      ed.addAction({
        id: 'needlescript.physics.previous',
        label: 'Previous Physics Finding',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F8],
        run: () => navigatePhysics(-1),
      }),
    ];
    contextMenuRef.current = ed.onContextMenu((event) => {
      event.event.preventDefault();
      event.event.stopPropagation();
      // Menu buttons take browser focus. Monaco's Change All action is gated on
      // editorTextFocus, so restore it before running any editor command.
      const runEditorAction = (id: string) => {
        ed.focus();
        void ed.getAction(id)?.run();
      };
      onMachineContextMenuRef.current?.(event.event.posx, event.event.posy, {
        cut: () => runEditorAction('editor.action.clipboardCutAction'),
        copy: () => runEditorAction('editor.action.clipboardCopyAction'),
        paste: () => runEditorAction('editor.action.clipboardPasteAction'),
        goToDefinition: () => runEditorAction('editor.action.revealDefinition'),
        changeAll: () => runEditorAction('editor.action.changeAll'),
        formatDocument: () => runEditorAction('editor.action.formatDocument'),
      });
    });
  }, []);

  const applyQuickFix = useCallback(
    (fix: PhysicsQuickFix) => {
      const ed = editorRef.current;
      const model = ed?.getModel();
      const baseline = physicsRef.current;
      const diagnostic = baseline?.diagnostics.find(({ id }) => id === fix.diagnosticId);
      if (!ed || !model || !baseline || !diagnostic || sourceRef.current !== fix.beforeSource) {
        dispatchQuickFixUi({
          type: 'apply-failed',
          outcome: {
            status: 'error',
            message:
              'The source changed after this preview. Preview the remedy again before applying.',
            introduced: [],
          },
        });
        return;
      }
      const start = model.getPositionAt(fix.edit.start);
      const end = model.getPositionAt(fix.edit.end);
      ed.pushUndoStop();
      const applied = ed.executeEdits('needlescript.physics.quickFix', [
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          text: fix.edit.text,
          forceMoveMarkers: true,
        },
      ]);
      ed.pushUndoStop();
      if (!applied) {
        dispatchQuickFixUi({
          type: 'apply-failed',
          outcome: {
            status: 'error',
            message: 'Monaco could not apply this edit. The source was not changed.',
            introduced: [],
          },
        });
        return;
      }
      const updated = model.getValue();
      sourceRef.current = updated;
      dispatchQuickFixUi({
        type: 'apply-started',
        pending: {
          beforeSource: fix.beforeSource,
          expectedSource: updated,
          baseline,
          diagnostic,
        },
      });
      onSourceChange(updated);
      onRunRef.current(updated);
      ed.focus();
    },
    [onSourceChange],
  );

  // Dispose Monaco listeners when the editor pane unmounts.
  useEffect(() => {
    return () => {
      stitchHoverProviderRef.current?.dispose();
      physicsHoverProviderRef.current?.dispose();
      physicsCodeActionProviderRef.current?.dispose();
      mouseMoveRef.current?.dispose();
      mouseLeaveRef.current?.dispose();
      mouseDownRef.current?.dispose();
      keyDownRef.current?.dispose();
      contextMenuRef.current?.dispose();
      physicsActionRefs.current.forEach((action) => action.dispose());
    };
  }, []);

  // ── Playback active-line decoration ────────────────────────────────
  const monaco = useMonaco();

  useEffect(() => {
    const ed = editorRef.current;
    const coll = decoCollRef.current;
    if (!ed || !coll || !monaco) return;

    if (activeLine !== null) {
      coll.set([
        {
          range: new monaco.Range(activeLine, 1, activeLine, 1),
          options: {
            isWholeLine: true,
            className: ACTIVE_LINE_CLASS,
          },
        },
      ]);
      // Reveal the line without jarring the user (ScrollType.Smooth = 0)
      ed.revealLine(activeLine, 0);
    } else {
      coll.clear();
    }
  }, [activeLine, monaco]);

  // ── Stitch-line number highlights ──────────────────────────────────────
  // Apply a gold tint to every line number that produced at least one stitch.
  // Cleared and rebuilt whenever a new compile completes (lineStitchMap changes).
  useEffect(() => {
    const coll = stitchLineDecoCollRef.current;
    if (!coll || !monaco) return;
    if (!lineStitchMap || lineStitchMap.size === 0) {
      coll.clear();
      return;
    }
    coll.set(
      Array.from(lineStitchMap.keys()).map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          lineNumberClassName: 'ns-stitch-line-num',
          description: 'stitch-line-num',
        },
      })),
    );
  }, [lineStitchMap, monaco]);

  // ── Selected physics source attribution ───────────────────────────────
  // The primary line has a stronger whole-line treatment; contributor and
  // related lines remain visible without looking like playback or selection.
  useEffect(() => {
    const ed = editorRef.current;
    const coll = physicsDecoCollRef.current;
    const model = ed?.getModel();
    if (!ed || !coll || !model || !monaco || !selectedDiagnosticId) {
      coll?.clear();
      return;
    }
    const diagnostic = physics?.diagnostics.find(({ id }) => id === selectedDiagnosticId);
    if (!diagnostic) {
      coll.clear();
      return;
    }
    const classByRole = {
      primary: PHYSICS_PRIMARY_LINE_CLASS,
      contributor: PHYSICS_CONTRIBUTOR_LINE_CLASS,
      related: PHYSICS_RELATED_LINE_CLASS,
    } as const;
    coll.set(
      diagnostic.sourceLocations.flatMap((location) =>
        location.line < 1 || location.line > model.getLineCount()
          ? []
          : [
              {
                range: new monaco.Range(location.line, 1, location.line, 1),
                options: {
                  isWholeLine: true,
                  className: classByRole[location.role],
                  description: `physics-${location.role}-line`,
                },
              },
            ],
      ),
    );
    const primary =
      diagnostic.sourceLocations.find(({ role }) => role === 'primary') ??
      diagnostic.sourceLocations[0];
    if (primary && primary.line >= 1 && primary.line <= model.getLineCount()) {
      ed.revealLineInCenterIfOutsideViewport(primary.line, 0);
    }
  }, [monaco, physics, selectedDiagnosticId]);

  // Auto-scroll the console to the bottom whenever a new message arrives.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Error marker squiggles ──────────────────────────────────────
  // Reflects compile errors (populated only after an explicit run) as red
  // underline decorations.  Cleared immediately when a new run succeeds.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;

    if (!errorMarkers || errorMarkers.length === 0) {
      monaco.editor.setModelMarkers(model, COMPILER_MARKER_OWNER, []);
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      COMPILER_MARKER_OWNER,
      errorMarkers.map(({ message, line }) => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineLength(line) + 1,
        message,
        source: 'NeedleScript',
      })),
    );
  }, [errorMarkers, monaco]);

  // Physics markers intentionally use a second owner so an analysis refresh
  // can never clear compiler errors (and vice versa).
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;
    const severity = {
      error: monaco.MarkerSeverity.Error,
      warning: monaco.MarkerSeverity.Warning,
      info: monaco.MarkerSeverity.Hint,
    } as const;
    const markers = buildPhysicsMonacoMarkers(physics?.diagnostics ?? []).flatMap((marker) => {
      if (marker.line < 1 || marker.line > model.getLineCount()) return [];
      const lineLength = model.getLineLength(marker.line);
      const startColumn = Math.max(1, Math.min(marker.startColumn ?? 1, lineLength + 1));
      const endColumn = Math.max(
        startColumn + Number(startColumn <= lineLength),
        Math.min(marker.endColumn ?? lineLength + 1, lineLength + 1),
      );
      return [
        {
          severity: severity[marker.severity],
          startLineNumber: marker.line,
          startColumn,
          endLineNumber: marker.line,
          endColumn,
          message: marker.message,
          source: 'NeedleScript Physics',
          code: marker.code,
        },
      ];
    });
    monaco.editor.setModelMarkers(model, PHYSICS_MARKER_OWNER, markers);
  }, [monaco, physics]);

  // ── Unified suggestion system ─────────────────────────────────────────
  // A single suggestion panel serves multiple triggers:
  //   /ai model  → AI model names (label = model id, description = display name)
  //   /load      → saved snippet names
  //   /remove    → saved snippet names
  interface ReplSuggestion {
    label: string;
    description: string;
    /** The full replacement text to write into the input when applied. */
    completion: string;
  }

  const replSuggestions = useMemo((): ReplSuggestion[] => {
    // /ai model  → filter models
    if (replValue.startsWith(MODEL_TRIGGER) && aiModels?.length) {
      const query = replValue.slice(MODEL_TRIGGER.length).toLowerCase();
      const hits = query
        ? aiModels.filter(
            (m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query),
          )
        : aiModels;
      return hits.slice(0, MAX_SUGGESTIONS).map((m) => ({
        label: m.id,
        description: m.name,
        completion: `${MODEL_TRIGGER}${m.id}`,
      }));
    }

    // /load  → filter snippet names
    if (replValue.startsWith(LOAD_TRIGGER) && savedSnippetNames?.length) {
      const query = replValue.slice(LOAD_TRIGGER.length).toLowerCase();
      const hits = query
        ? savedSnippetNames.filter((n) => n.toLowerCase().includes(query))
        : savedSnippetNames;
      return hits.slice(0, MAX_SUGGESTIONS).map((n) => ({
        label: n,
        description: '',
        completion: `${LOAD_TRIGGER}${n}`,
      }));
    }

    // /remove  → filter snippet names
    if (replValue.startsWith(REMOVE_TRIGGER) && savedSnippetNames?.length) {
      const query = replValue.slice(REMOVE_TRIGGER.length).toLowerCase();
      const hits = query
        ? savedSnippetNames.filter((n) => n.toLowerCase().includes(query))
        : savedSnippetNames;
      return hits.slice(0, MAX_SUGGESTIONS).map((n) => ({
        label: n,
        description: '',
        completion: `${REMOVE_TRIGGER}${n}`,
      }));
    }

    return [];
  }, [replValue, aiModels, savedSnippetNames]);

  // Clamp the suggestion index to the current list length to avoid stale highlights.
  const effectiveSuggestionIdx = Math.min(suggestionIdx, replSuggestions.length - 1);

  // ── REPL ─────────────────────────────────────────────────────────────
  const handleReplKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const showingSuggestions = replSuggestions.length > 0;
      const isSlashMode = replValue.startsWith('/');

      // ── Escape: close suggestion panel ──────────────────────────────
      if (e.key === 'Escape' && showingSuggestions) {
        e.preventDefault();
        setSuggestionIdx(-1);
        return;
      }

      // ── Tab: apply highlighted suggestion ───────────────────────────
      if (e.key === 'Tab' && showingSuggestions) {
        e.preventDefault();
        const target =
          effectiveSuggestionIdx >= 0
            ? replSuggestions[effectiveSuggestionIdx]
            : replSuggestions[0];
        if (target) setReplValue(target.completion);
        setSuggestionIdx(-1);
        return;
      }

      // ── Arrow up/down: navigate suggestions OR history ───────────────
      if (e.key === 'ArrowUp') {
        if (showingSuggestions) {
          e.preventDefault();
          setSuggestionIdx((i) => Math.max(0, Math.min(i, replSuggestions.length - 1) - 1));
          return;
        }
        if (!isSlashMode && replIdxRef.current > 0) {
          replIdxRef.current--;
          setReplValue(replHistoryRef.current[replIdxRef.current]);
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        if (showingSuggestions) {
          e.preventDefault();
          setSuggestionIdx((i) => Math.min(replSuggestions.length - 1, i + 1));
          return;
        }
        if (!isSlashMode) {
          if (replIdxRef.current < replHistoryRef.current.length - 1) {
            replIdxRef.current++;
            setReplValue(replHistoryRef.current[replIdxRef.current]);
          } else {
            replIdxRef.current = replHistoryRef.current.length;
            setReplValue('');
          }
          e.preventDefault();
        }
        return;
      }

      // ── Enter: apply suggestion, dispatch command, or normal REPL ─────
      if (e.key === 'Enter') {
        // If a suggestion is highlighted, apply it and don't submit yet.
        if (showingSuggestions && effectiveSuggestionIdx >= 0) {
          e.preventDefault();
          setReplValue(replSuggestions[effectiveSuggestionIdx].completion);
          setSuggestionIdx(-1);
          return;
        }

        const line = replValue.trim();
        if (!line) return;

        replHistoryRef.current.push(line);
        replIdxRef.current = replHistoryRef.current.length;
        setSuggestionIdx(-1);

        if (line === AI_TRIGGER || line.startsWith(AI_TRIGGER + ' ')) {
          // ── /ai command ──────────────────────────────────────────────
          const cmd =
            line.length > AI_TRIGGER.length ? line.slice(AI_TRIGGER.length + 1).trim() : '';
          setReplValue('');
          void onAiCommand?.(cmd);
        } else if (line.startsWith('/')) {
          // ── other slash command (/share, /save, /load, /remove) ──────
          setReplValue('');
          void onReplCommand?.(line);
        } else {
          // ── Normal REPL — append to source and run ───────────────────
          const next = source + (source && !source.endsWith('\n') ? '\n' : '') + line;
          onSourceChange(next);
          setReplValue('');
          // Scroll Monaco to the last line so the newly-appended command is visible
          requestAnimationFrame(() => {
            const ed = editorRef.current;
            if (ed) {
              const model = ed.getModel();
              if (model) ed.revealLine(model.getLineCount());
            }
          });
          // Pass next explicitly — setSource(next) is async and may not be committed
          // to React state by the time handleRun fires, so we pass the value directly.
          onRun(next);
        }
      }
    },
    [
      replValue,
      source,
      onSourceChange,
      onRun,
      onAiCommand,
      onReplCommand,
      replSuggestions,
      effectiveSuggestionIdx,
    ],
  );

  // ── Dynamic placeholder ────────────────────────────────────────────────
  const replPlaceholder = useMemo(() => {
    if (replValue.startsWith(MODEL_TRIGGER)) {
      return 'type a model name to filter — ↑↓ to navigate · Tab to complete';
    }
    if (replValue.startsWith(LOAD_TRIGGER) || replValue.startsWith(REMOVE_TRIGGER)) {
      return 'type a snippet name to filter — ↑↓ to navigate · Tab to complete';
    }
    if (replValue.startsWith(AI_TRIGGER)) {
      return '/ai create … · /ai improve … · /ai fix … · /ai explain … · /ai help';
    }
    if (replValue.startsWith('/')) {
      return '/share · /save [name] · /load [name] · /autosave · /remove <name> · /ai help';
    }
    if (activeSnippetName) {
      return `editing "${activeSnippetName}" — /autosave to save · press Enter to append and run`;
    }
    if (aiHasApiKey) {
      return 'type a command or /ai · press Enter to append and run (↑ history)';
    }
    return 'type a command · press Enter to append and run (↑ history) · /ai apikey …';
  }, [replValue, activeSnippetName, aiHasApiKey]);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <section className={`${styles.pane} ${isDragging ? styles.dragging : ''}`} style={style}>
      <div className={styles.editorWrap}>
        <Editor
          language="needlescript"
          theme="needlescript-dark"
          value={source}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={(value) => {
            if (value !== undefined) {
              sourceRef.current = value;
              onSourceChange(value);
            }
          }}
          height="100%"
          width="100%"
          loading={<div className={styles.editorLoading}>loading editor…</div>}
          options={{
            // Typography — must match the rest of the app
            fontFamily: EDITOR_FONT_FAMILY,
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: EDITOR_LINE_HEIGHT,
            fontLigatures: false,
            // Indentation
            tabSize: 2,
            insertSpaces: true,
            detectIndentation: false,
            // Visible features to keep
            lineNumbers: 'on',
            lineDecorationsWidth: 8, // remove glyph margin / extra gutter width
            folding: true,
            showFoldingControls: 'mouseover',
            // Disable features that add visual noise for a simple scripting editor
            minimap: { enabled: false },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            // Match original padding
            padding: { top: 8, bottom: 12 },
            // Scrollbars
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              useShadows: false,
            },
            // IntelliSense — completions, hover docs, signature hints
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            wordBasedSuggestions: 'off',
            links: false,
            hover: { enabled: true },
            // The playground owns right-click so the Machine/Fabric menu is the
            // only menu shown at this location.
            contextmenu: false,
          }}
        />
      </div>

      <ParametersPanel
        source={source}
        items={parameterItems}
        onParamChange={handleParamChange}
        onAllParamsChange={handleAllParamsChange}
        onInteractionStart={handleParameterInteractionStart}
        onInteractionEnd={handleParameterInteractionEnd}
        lockedParams={lockedParams}
        onToggleLock={onToggleLock}
        onHighlightHandle={onHighlightHandle}
        highlightedHandle={highlightedHandle}
        dataVars={dataVars}
        referenceVars={referenceVars}
        pinnedDataVars={pinnedDataVars}
        onTogglePinnedDataVar={onTogglePinnedDataVar}
        onHoverDataVar={onHoverDataVar}
        onRevealLine={(line) => {
          const ed = editorRef.current;
          if (!ed) return;
          ed.revealLineInCenter(line, 0);
          ed.setPosition({ lineNumber: line, column: 1 });
          ed.focus();
        }}
      />

      <Splitter
        orientation="vertical"
        onDrag={handleConsoleDrag}
        onReset={() => setConsoleHeight(CONSOLE_DEFAULT)}
      />

      <div
        className={styles.bottomPanel}
        data-active-tab={activeBottomTab}
        data-mobile-size={mobilePhysicsSize}
        style={{ height: consoleHeight }}
      >
        <div className={styles.bottomTabs} role="tablist" aria-label="Editor output">
          <button
            type="button"
            role="tab"
            id="console-tab"
            aria-controls="console-panel"
            aria-selected={activeBottomTab === 'console'}
            onClick={() => setActiveBottomTab('console')}
          >
            Console
          </button>
          <button
            type="button"
            role="tab"
            id="physics-tab"
            aria-controls="physics-panel"
            aria-selected={activeBottomTab === 'physics'}
            onClick={() => {
              setActiveBottomTab('physics');
              setConsoleHeight((height) => Math.max(height, 240));
            }}
          >
            Physics
            {physics && physics.diagnostics.length > 0 && (
              <span className={styles.physicsBadge}>
                <span aria-hidden="true">
                  {physics.summary.error} · {physics.summary.warning}
                </span>
                <span className="sr-only">
                  {physics.summary.error} blockers and {physics.summary.warning} risks
                </span>
              </span>
            )}
          </button>
          <div className={styles.mobileSheetControls} aria-label="Physics sheet height">
            {(['collapsed', 'half', 'full'] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-label={`${size === 'half' ? 'Half-height' : size} Physics sheet`}
                aria-pressed={mobilePhysicsSize === size}
                onClick={() => setMobilePhysicsSize(size)}
              >
                {size === 'collapsed' ? '—' : size === 'half' ? '½' : '□'}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={activeBottomTab === 'console' ? consoleRef : undefined}
          id="console-panel"
          role="tabpanel"
          aria-labelledby="console-tab"
          hidden={activeBottomTab !== 'console'}
          className={styles.console}
          aria-live="polite"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles[msg.type] || ''} ${msg.loc ? styles.locatable : ''}`}
              onMouseEnter={msg.loc ? () => onWarnHover(msg.loc!) : undefined}
              onMouseLeave={msg.loc ? () => onWarnHover(null) : undefined}
            >
              {msg.text}
            </div>
          ))}
        </div>
        <div
          id="physics-panel"
          role="tabpanel"
          aria-labelledby="physics-tab"
          hidden={activeBottomTab !== 'physics'}
          className={styles.physicsContent}
        >
          <PhysicsPanel
            key={physicsProjectKey}
            report={physics}
            reportState={physicsReportState}
            projectKey={physicsProjectKey}
            selectedDiagnosticId={selectedDiagnosticId}
            onDiagnosticHover={onDiagnosticHover}
            onDiagnosticSelect={selectPhysicsDiagnostic}
            quickFixes={quickFixes}
            quickFixPreview={quickFixUi.preview}
            quickFixOutcome={completedQuickFixOutcome ?? quickFixUi.outcome}
            onQuickFixPreview={(fix) => {
              dispatchQuickFixUi({ type: 'preview', fix });
              const diagnostic = physics?.diagnostics.find(({ id }) => id === fix.diagnosticId);
              if (diagnostic) onDiagnosticSelect(diagnostic);
            }}
            onQuickFixCancel={() => dispatchQuickFixUi({ type: 'cancel-preview' })}
            onQuickFixApply={applyQuickFix}
            onQuickFixOutcomeDismiss={() => dispatchQuickFixUi({ type: 'dismiss-outcome' })}
          />
        </div>
      </div>

      <div className={styles.replRow}>
        {/* Autocomplete suggestion panel — serves /ai model, /load, /remove */}
        {replSuggestions.length > 0 && (
          <div className={styles.suggestBox} role="listbox" aria-label="Suggestions">
            {replSuggestions.map((s, i) => (
              <div
                key={s.label}
                role="option"
                aria-selected={i === effectiveSuggestionIdx}
                className={`${styles.suggestItem} ${i === effectiveSuggestionIdx ? styles.suggestItemActive : ''}`}
                onMouseDown={(e) => {
                  // Use mousedown to avoid blur on the input
                  e.preventDefault();
                  setReplValue(s.completion);
                  setSuggestionIdx(-1);
                }}
              >
                <span className={styles.suggestItemId}>{s.label}</span>
                {s.description && <span className={styles.suggestItemName}>{s.description}</span>}
              </div>
            ))}
          </div>
        )}

        {/* AI generating indicator */}
        {aiIsGenerating && <span className={styles.aiSpinner} aria-label="AI generating" />}

        <span className={styles.prompt}>{aiIsGenerating ? '⟳' : '›'}</span>
        <Input
          type="text"
          value={replValue}
          onChange={(e) => setReplValue(e.target.value)}
          onKeyDown={handleReplKeyDown}
          disabled={aiIsGenerating}
          autoComplete="off"
          placeholder={replPlaceholder}
          aria-label="REPL input"
          aria-owns={replSuggestions.length > 0 ? 'repl-suggest-box' : undefined}
          aria-autocomplete={replSuggestions.length > 0 ? 'list' : undefined}
          aria-activedescendant={
            effectiveSuggestionIdx >= 0 ? `repl-suggest-${effectiveSuggestionIdx}` : undefined
          }
          className={`flex-1 h-auto py-[7px] px-[10px] text-ui font-mono bg-secondary border-border text-foreground placeholder:text-faint focus-visible:ring-ring/50 ${
            aiIsGenerating ? 'opacity-50 cursor-not-allowed' : ''
          } ${replValue.startsWith('/') ? styles.aiReplInput : ''}`}
        />

        {/* Selected model badge */}
        {aiSelectedModel && aiHasApiKey && !aiIsGenerating && (
          <span className={styles.modelBadge} title={`AI model: ${aiSelectedModel}`}>
            {aiSelectedModel.split('/').pop()?.split('-').slice(0, 3).join('-') ?? aiSelectedModel}
          </span>
        )}

        {/* Active snippet badge — shows when /autosave is available */}
        {activeSnippetName && (
          <span
            className={styles.snippetBadge}
            title={`Active snippet: "${activeSnippetName}" — /autosave to save changes`}
          >
            {activeSnippetName}
          </span>
        )}
      </div>

      {isDragging && <div className={styles.dropOverlay}>drop SVG or bitmap to import</div>}
    </section>
  );
}
