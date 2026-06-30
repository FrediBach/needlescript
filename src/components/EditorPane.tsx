import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import type { ConsoleMessage } from '../App.tsx';
import type { LineStitchBounds } from '../App.tsx';
import type { WarningLocation } from '../lib/engine.ts';
import type { AIModelInfo } from '../hooks/useAI.ts';
import { registerNeedlescript } from '../lib/needlescript-monaco.ts';
import { fontMono, fsBase, editorLineHeight } from '../theme.ts';
import { updateParameter } from '../lib/parse-parameters.ts';
import Splitter from './Splitter.tsx';
import ParametersPanel from './ParametersPanel.tsx';
import styles from './EditorPane.module.css';
import { Input } from '@/components/ui/input.tsx';

interface Props {
  source: string;
  onSourceChange: (src: string) => void;
  onRun: (src?: string) => void;
  messages: ConsoleMessage[];
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
  style?: React.CSSProperties;
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

// Prefix that triggers AI command mode in the REPL.
const AI_TRIGGER = '/ai';
// Prefix that triggers model autocomplete.
const MODEL_TRIGGER = '/ai model ';
// Maximum suggestions shown at once.
const MAX_SUGGESTIONS = 8;

export default function EditorPane({
  source,
  onSourceChange,
  onRun,
  messages,
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
  style,
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
  // Ref for the console panel — used to auto-scroll to the latest message.
  const consoleRef = useRef<HTMLDivElement>(null);

  // Stable ref so the keyboard-shortcut handler always calls the latest onRun
  // even after source/design state changes rebuild the callback.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Stable ref to source so the parameter-change handler never captures a
  // stale closure value.
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Stable refs for the hover-provider and mouse-listener callbacks so they
  // always read the latest props without re-registering Monaco listeners.
  const lineStitchMapRef = useRef(lineStitchMap);
  const onHoverLineRef = useRef(onHoverLine);
  useLayoutEffect(() => {
    lineStitchMapRef.current = lineStitchMap;
    onHoverLineRef.current = onHoverLine;
  });

  // Disposables created in handleMount — cleaned up on unmount.
  const hoverProviderRef = useRef<IDisposable | null>(null);
  const mouseMoveRef = useRef<IDisposable | null>(null);
  const mouseLeaveRef = useRef<IDisposable | null>(null);

  // ── Parameters panel throttle ───────────────────────────────────────
  // Leading + trailing throttle at 250 ms: fire immediately on first change,
  // then at most once per 250 ms while the slider is being dragged.
  const lastRunTimeRef = useRef(0);
  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParamChange = useCallback(
    (name: string, line: number, value: number) => {
      const updated = updateParameter(sourceRef.current, line, name, value);
      onSourceChange(updated);

      const now = Date.now();
      const elapsed = now - lastRunTimeRef.current;

      if (runTimerRef.current !== null) clearTimeout(runTimerRef.current);

      if (elapsed >= 250) {
        // First event in this burst — fire immediately with the fresh source.
        lastRunTimeRef.current = now;
        onRunRef.current(updated);
      } else {
        // Mid-burst — schedule a trailing call at the end of the 250 ms window.
        // Use sourceRef.current (not handleRun's closure) so the latest source
        // is always used even if the React re-render hasn't committed yet.
        runTimerRef.current = setTimeout(() => {
          runTimerRef.current = null;
          lastRunTimeRef.current = Date.now();
          onRunRef.current(sourceRef.current);
        }, 250 - elapsed);
      }
    },
    [onSourceChange],
  );

  const handleAllParamsChange = useCallback(
    (changes: Array<{ name: string; line: number; value: number }>) => {
      // Apply every change sequentially to an accumulating source string so all
      // updates land in a single onSourceChange call (avoids last-write-wins when
      // each patched value is read from the same stale sourceRef.current).
      let src = sourceRef.current;
      for (const { name, line, value } of changes) {
        src = updateParameter(src, line, name, value);
      }
      onSourceChange(src);
      if (runTimerRef.current !== null) clearTimeout(runTimerRef.current);
      lastRunTimeRef.current = Date.now();
      onRunRef.current(src);
    },
    [onSourceChange],
  );

  // ── Monaco lifecycle callbacks ──────────────────────────────────────
  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    registerNeedlescript(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((ed, monaco) => {
    editorRef.current = ed;
    decoCollRef.current = ed.createDecorationsCollection();
    stitchLineDecoCollRef.current = ed.createDecorationsCollection();

    // Cmd/Ctrl + Enter → run the program (mirrors the original textarea shortcut).
    // Pass sourceRef.current explicitly so the latest source is used even if
    // React hasn't committed a re-render since the last Monaco onChange.
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current(sourceRef.current);
    });

    // ── Stitch-bounds hover tooltip ───────────────────────────────────────
    // A second hover provider (merged with the built-in docs provider) that
    // shows the stitch count and mm bounding box for lines that produce stitches.
    hoverProviderRef.current = monaco.languages.registerHoverProvider('needlescript', {
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

    // ── Canvas overlay trigger ────────────────────────────────────────────
    // Fire onHoverLine whenever the cursor enters a line (content text or the
    // line-number gutter). The hover provider above handles the tooltip;
    // onHoverLine drives the semi-transparent rect drawn on the canvas.
    const GUTTER = monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS; // 3
    const CONTENT = monaco.editor.MouseTargetType.CONTENT_TEXT; // 6
    mouseMoveRef.current = ed.onMouseMove((e) => {
      const t = e.target;
      if (t.type === GUTTER || t.type === CONTENT) {
        onHoverLineRef.current?.(t.position?.lineNumber ?? null);
      } else {
        onHoverLineRef.current?.(null);
      }
    });
    mouseLeaveRef.current = ed.onMouseLeave(() => {
      onHoverLineRef.current?.(null);
    });
  }, []);

  // Dispose Monaco listeners when the editor pane unmounts.
  useEffect(() => {
    return () => {
      hoverProviderRef.current?.dispose();
      mouseMoveRef.current?.dispose();
      mouseLeaveRef.current?.dispose();
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
      monaco.editor.setModelMarkers(model, 'needlescript', []);
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      'needlescript',
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

  // ── AI model autocomplete suggestions ──────────────────────────────────
  // Computed from the current REPL value. Only shown when typing "/ai model ".
  const aiSuggestions = useMemo((): AIModelInfo[] => {
    if (!aiModels?.length || !replValue.startsWith(MODEL_TRIGGER)) return [];
    const query = replValue.slice(MODEL_TRIGGER.length).toLowerCase();
    if (!query) return aiModels.slice(0, MAX_SUGGESTIONS);
    return aiModels
      .filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [replValue, aiModels]);

  // Clamp the suggestion index to the current list length to avoid stale highlights.
  const effectiveSuggestionIdx = Math.min(suggestionIdx, aiSuggestions.length - 1);

  // ── REPL ─────────────────────────────────────────────────────────────
  const handleReplKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const showingSuggestions = aiSuggestions.length > 0;
      const isAiMode = replValue.startsWith(AI_TRIGGER);

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
          effectiveSuggestionIdx >= 0 ? aiSuggestions[effectiveSuggestionIdx] : aiSuggestions[0];
        if (target) setReplValue(`${MODEL_TRIGGER}${target.id}`);
        setSuggestionIdx(-1);
        return;
      }

      // ── Arrow up/down: navigate suggestions OR history ───────────────
      if (e.key === 'ArrowUp') {
        if (showingSuggestions) {
          e.preventDefault();
          setSuggestionIdx((i) => Math.max(0, Math.min(i, aiSuggestions.length - 1) - 1));
          return;
        }
        if (!isAiMode && replIdxRef.current > 0) {
          replIdxRef.current--;
          setReplValue(replHistoryRef.current[replIdxRef.current]);
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        if (showingSuggestions) {
          e.preventDefault();
          setSuggestionIdx((i) => Math.min(aiSuggestions.length - 1, i + 1));
          return;
        }
        if (!isAiMode) {
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

      // ── Enter: apply suggestion, dispatch AI command, or normal REPL ─
      if (e.key === 'Enter') {
        // If a suggestion is highlighted, apply it and don't submit yet.
        if (showingSuggestions && effectiveSuggestionIdx >= 0) {
          e.preventDefault();
          setReplValue(`${MODEL_TRIGGER}${aiSuggestions[effectiveSuggestionIdx].id}`);
          setSuggestionIdx(-1);
          return;
        }

        const line = replValue.trim();
        if (!line) return;

        replHistoryRef.current.push(line);
        replIdxRef.current = replHistoryRef.current.length;
        setSuggestionIdx(-1);

        if (line === AI_TRIGGER || line.startsWith(AI_TRIGGER + ' ')) {
          // ── AI command — intercept and dispatch ──────────────────────
          const cmd =
            line.length > AI_TRIGGER.length ? line.slice(AI_TRIGGER.length + 1).trim() : '';
          setReplValue('');
          void onAiCommand?.(cmd);
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
    [replValue, source, onSourceChange, onRun, onAiCommand, aiSuggestions, effectiveSuggestionIdx],
  );

  // ── Dynamic placeholder ────────────────────────────────────────────────
  const replPlaceholder = useMemo(() => {
    if (replValue.startsWith(MODEL_TRIGGER)) {
      return 'type a model name to filter — ↑↓ to navigate · Tab to complete';
    }
    if (replValue.startsWith(AI_TRIGGER)) {
      return '/ai create … · /ai improve … · /ai fix … · /ai explain … · /ai help';
    }
    if (aiHasApiKey) {
      return "type a command and press Enter — it's appended to the pattern (↑ history) · /ai help";
    }
    return "type a command and press Enter — it's appended to the pattern (↑ history) · /ai apikey …";
  }, [replValue, aiHasApiKey]);

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
            if (value !== undefined) onSourceChange(value);
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
          }}
        />
      </div>

      <ParametersPanel
        source={source}
        onParamChange={handleParamChange}
        onAllParamsChange={handleAllParamsChange}
      />

      <Splitter
        orientation="vertical"
        onDrag={handleConsoleDrag}
        onReset={() => setConsoleHeight(CONSOLE_DEFAULT)}
      />

      <div
        ref={consoleRef}
        className={styles.console}
        aria-live="polite"
        style={{ height: consoleHeight }}
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

      <div className={styles.replRow}>
        {/* Model autocomplete suggestion panel */}
        {aiSuggestions.length > 0 && (
          <div className={styles.suggestBox} role="listbox" aria-label="Model suggestions">
            {aiSuggestions.map((m, i) => (
              <div
                key={m.id}
                role="option"
                aria-selected={i === effectiveSuggestionIdx}
                className={`${styles.suggestItem} ${i === effectiveSuggestionIdx ? styles.suggestItemActive : ''}`}
                onMouseDown={(e) => {
                  // Use mousedown to avoid blur on the input
                  e.preventDefault();
                  setReplValue(`${MODEL_TRIGGER}${m.id}`);
                  setSuggestionIdx(-1);
                }}
              >
                <span className={styles.suggestItemId}>{m.id}</span>
                <span className={styles.suggestItemName}>{m.name}</span>
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
          aria-owns={aiSuggestions.length > 0 ? 'ai-suggest-box' : undefined}
          aria-autocomplete={aiSuggestions.length > 0 ? 'list' : undefined}
          aria-activedescendant={
            effectiveSuggestionIdx >= 0 ? `ai-suggest-${effectiveSuggestionIdx}` : undefined
          }
          className={`flex-1 h-auto py-[7px] px-[10px] text-ui font-mono bg-secondary border-border text-foreground placeholder:text-faint focus-visible:ring-ring/50 ${
            aiIsGenerating ? 'opacity-50 cursor-not-allowed' : ''
          } ${replValue.startsWith(AI_TRIGGER) ? styles.aiReplInput : ''}`}
        />

        {/* Selected model badge */}
        {aiSelectedModel && aiHasApiKey && !aiIsGenerating && (
          <span className={styles.modelBadge} title={`AI model: ${aiSelectedModel}`}>
            {aiSelectedModel.split('/').pop()?.split('-').slice(0, 3).join('-') ?? aiSelectedModel}
          </span>
        )}
      </div>

      {isDragging && <div className={styles.dropOverlay}>drop SVG to convert</div>}
    </section>
  );
}
