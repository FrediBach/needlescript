import { useRef, useState, useCallback, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ConsoleMessage } from '../App.tsx';
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
  onRun: () => void;
  messages: ConsoleMessage[];
  isDragging: boolean;
  activeLine: number | null; // source line currently sewing (playback), 1-based
  style?: React.CSSProperties;
}

// Font settings — sourced from theme.ts to stay in sync with the design system
const EDITOR_FONT_FAMILY = fontMono;
const EDITOR_FONT_SIZE    = fsBase;
const EDITOR_LINE_HEIGHT  = editorLineHeight; // 20 px

// CSS class applied to the whole-line decoration while the playback line is
// active. Must be a global (non-hashed) name since Monaco injects the class
// into its own DOM — the matching rule lives in EditorPane.module.css as a
// :global block.
const ACTIVE_LINE_CLASS = 'ns-playback-line';

export default function EditorPane({ source, onSourceChange, onRun, messages, isDragging, activeLine, style }: Props) {
  const [replValue, setReplValue] = useState('');
  const replHistoryRef = useRef<string[]>([]);
  const replIdxRef     = useRef(-1);

  // ── Console panel height (vertical split) ──────────────────────────
  const CONSOLE_DEFAULT = 96;
  const CONSOLE_MIN     = 40;
  const CONSOLE_MAX     = 360;

  const [consoleHeight, setConsoleHeight] = useState(CONSOLE_DEFAULT);

  const handleConsoleDrag = useCallback((delta: number) => {
    // Positive delta = dragging the handle down = Monaco grows, console shrinks.
    setConsoleHeight(h => Math.max(CONSOLE_MIN, Math.min(CONSOLE_MAX, h - delta)));
  }, []);

  // Holds the live Monaco editor instance once mounted.
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // Holds the decoration collection for the playback active-line highlight.
  const decoCollRef = useRef<editor.IEditorDecorationsCollection | null>(null);
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

  // ── Parameters panel throttle ───────────────────────────────────────
  // Leading + trailing throttle at 250 ms: fire immediately on first change,
  // then at most once per 250 ms while the slider is being dragged.
  const lastRunTimeRef = useRef(0);
  const runTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParamChange = useCallback((name: string, line: number, value: number) => {
    const updated = updateParameter(sourceRef.current, line, name, value);
    onSourceChange(updated);

    const now     = Date.now();
    const elapsed = now - lastRunTimeRef.current;

    if (runTimerRef.current !== null) clearTimeout(runTimerRef.current);

    if (elapsed >= 250) {
      // First event in this burst — fire immediately.
      lastRunTimeRef.current = now;
      onRunRef.current();
    } else {
      // Mid-burst — schedule a trailing call at the end of the 250 ms window.
      runTimerRef.current = setTimeout(() => {
        runTimerRef.current    = null;
        lastRunTimeRef.current = Date.now();
        onRunRef.current();
      }, 250 - elapsed);
    }
  }, [onSourceChange]);

  const handleAllParamsChange = useCallback((changes: Array<{name: string; line: number; value: number}>) => {
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
    onRunRef.current();
  }, [onSourceChange]);

  // ── Monaco lifecycle callbacks ──────────────────────────────────────
  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    registerNeedlescript(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((ed, monaco) => {
    editorRef.current  = ed;
    decoCollRef.current = ed.createDecorationsCollection();

    // Cmd/Ctrl + Enter → run the program (mirrors the original textarea shortcut)
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current();
    });
  }, []);

  // ── Playback active-line decoration ────────────────────────────────
  const monaco = useMonaco();

  useEffect(() => {
    const ed   = editorRef.current;
    const coll = decoCollRef.current;
    if (!ed || !coll || !monaco) return;

    if (activeLine !== null) {
      coll.set([{
        range: new monaco.Range(activeLine, 1, activeLine, 1),
        options: {
          isWholeLine: true,
          className:   ACTIVE_LINE_CLASS,
        },
      }]);
      // Reveal the line without jarring the user (ScrollType.Smooth = 0)
      ed.revealLine(activeLine, 0);
    } else {
      coll.clear();
    }
  }, [activeLine, monaco]);

  // Auto-scroll the console to the bottom whenever a new message arrives.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── REPL ─────────────────────────────────────────────────────────────
  const handleReplKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const line = replValue.trim();
      if (!line) return;
      replHistoryRef.current.push(line);
      replIdxRef.current = replHistoryRef.current.length;
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
      onRun();
    } else if (e.key === 'ArrowUp') {
      if (replIdxRef.current > 0) {
        replIdxRef.current--;
        setReplValue(replHistoryRef.current[replIdxRef.current]);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowDown') {
      if (replIdxRef.current < replHistoryRef.current.length - 1) {
        replIdxRef.current++;
        setReplValue(replHistoryRef.current[replIdxRef.current]);
      } else {
        replIdxRef.current = replHistoryRef.current.length;
        setReplValue('');
      }
      e.preventDefault();
    }
  }, [replValue, source, onSourceChange, onRun]);

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
            fontFamily:            EDITOR_FONT_FAMILY,
            fontSize:              EDITOR_FONT_SIZE,
            lineHeight:            EDITOR_LINE_HEIGHT,
            fontLigatures:         false,
            // Indentation
            tabSize:               2,
            insertSpaces:          true,
            detectIndentation:     false,
            // Visible features to keep
            lineNumbers:           'on',
            lineDecorationsWidth:  8,  // remove glyph margin / extra gutter width
            folding:               false,
            // Disable features that add visual noise for a simple scripting editor
            minimap:               { enabled: false },
            overviewRulerLanes:    0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder:   false,
            scrollBeyondLastLine:  false,
            wordWrap:              'off',
            // Match original padding
            padding:               { top: 8, bottom: 12 },
            // Scrollbars
            scrollbar: {
              verticalScrollbarSize:   8,
              horizontalScrollbarSize:  8,
              useShadows:              false,
            },
            // IntelliSense — completions, hover docs, signature hints
            quickSuggestions:           { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            parameterHints:             { enabled: true },
            wordBasedSuggestions:       'off',
            links:                      false,
            hover:                      { enabled: true }
          }}
        />
      </div>

      <ParametersPanel source={source} onParamChange={handleParamChange} onAllParamsChange={handleAllParamsChange} />

      <Splitter
        orientation="vertical"
        onDrag={handleConsoleDrag}
        onReset={() => setConsoleHeight(CONSOLE_DEFAULT)}
      />

      <div ref={consoleRef} className={styles.console} aria-live="polite"
           style={{ height: consoleHeight }}>
        {messages.map(msg => (
          <div key={msg.id} className={styles[msg.type] || ''}>
            {msg.text}
          </div>
        ))}
      </div>

      <div className={styles.replRow}>
        <span className={styles.prompt}>›</span>
        <Input
          type="text"
          value={replValue}
          onChange={e => setReplValue(e.target.value)}
          onKeyDown={handleReplKeyDown}
          autoComplete="off"
          placeholder="type a command and press Enter — it's appended to the pattern (↑ history)"
          aria-label="REPL input"
          className="flex-1 h-auto py-[7px] px-[10px] text-ui font-mono bg-secondary border-border text-foreground placeholder:text-faint focus-visible:ring-ring/50"
        />
      </div>

      {isDragging && (
        <div className={styles.dropOverlay}>drop SVG to convert</div>
      )}
    </section>
  );
}
