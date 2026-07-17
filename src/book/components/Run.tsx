/**
 * src/book/components/Run.tsx
 *
 * Editable NeedleScript code cell with a live hoop preview.
 * The book's primary teaching component.
 *
 * Usage in MDX:
 *   <Run>
 *   {`repeat 6 [ fd 20 rt 60 ]`}
 *   </Run>
 */
import { useState, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import Editor from '@monaco-editor/react';
import type { BeforeMount, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { RunResult, DesignStats } from '../../lib/types.ts';
import { useCompiler } from '../../hooks/useCompiler.ts';
import {
  registerNeedlescript,
  scheduleNeedlescriptProviders,
} from '../../lib/needlescript-monaco.ts';
import BookCanvas from './BookCanvas.tsx';
import { useBookTheme } from '../lib/useBookTheme.ts';

interface Props {
  children: ReactNode;
  /** Canvas height in pixels. Default 280. */
  canvasHeight?: number;
  /** Auto-run on mount without requiring a manual Run click. Default true. */
  autoRun?: boolean;
}

function extractCode(children: ReactNode): string {
  // MDX passes code content as a string child (possibly nested in a React element).
  // Trim surrounding newlines that MDX often adds.
  if (typeof children === 'string') return children.trim();
  // React element wrapping (e.g. from remark-code processing) — extract text
  const el = children as React.ReactElement<{ children: ReactNode }>;
  if (el && typeof el === 'object' && 'props' in el) {
    return extractCode(el.props.children);
  }
  return String(children ?? '').trim();
}

/** Minimal book-themed stats row */
function StatsRow({ stats, error }: { stats: DesignStats | null; error: string | null }) {
  if (error) {
    return (
      <div
        style={{
          padding: '0.4rem 0.75rem',
          fontFamily: 'var(--bk-font-mono)',
          fontSize: '0.78rem',
          color: 'var(--bk-run)',
          background: 'var(--bk-cell-bg)',
          borderTop: '1px solid var(--bk-cell-border)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {error}
      </div>
    );
  }
  if (!stats) return null;
  return (
    <div
      style={{
        padding: '0.3rem 0.75rem',
        fontFamily: 'var(--bk-font-mono)',
        fontSize: '0.73rem',
        color: 'var(--bk-text-muted)',
        background: 'var(--bk-cell-bg)',
        borderTop: '1px solid var(--bk-cell-border)',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <span>{stats.stitches.toLocaleString()} stitches</span>
      <span>
        {stats.width.toFixed(1)} × {stats.height.toFixed(1)} mm
      </span>
      {stats.colorsUsed > 1 && <span>{stats.colorsUsed} colours</span>}
      {stats.planMode &&
        stats.travelBeforeMm !== undefined &&
        stats.travelAfterMm !== undefined && (
          <span>
            plan {stats.travelBeforeMm.toFixed(1)} → {stats.travelAfterMm.toFixed(1)} mm
          </span>
        )}
    </div>
  );
}

export default function Run({ children, canvasHeight = 280, autoRun = true }: Props) {
  const initialCode = extractCode(children);
  const [source, setSource] = useState(initialCode);
  const sourceRef = useRef(source);
  // Keep the ref current after every render (without reading it during render)
  useLayoutEffect(() => {
    sourceRef.current = source;
  });

  const [result, setResult] = useState<RunResult | null>(null);
  const [stats, setStats] = useState<DesignStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { compile } = useCompiler();
  const theme = useBookTheme();
  const monacoTheme = theme === 'dark' ? 'needlescript-dark' : 'needlescript-light';

  const run = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    const response = await compile(sourceRef.current);
    setIsRunning(false);
    if (response === null) return; // superseded
    if (!response.ok) {
      setError(response.message);
      setResult(null);
      setStats(null);
    } else {
      setResult(response.result);
      setStats(response.stats);
    }
  }, [compile]);

  const reset = useCallback(() => {
    setSource(initialCode);
    setError(null);
  }, [initialCode]);

  // Auto-run on mount — deferred via queueMicrotask so the effect completes
  // before any setState calls happen (satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    if (autoRun) queueMicrotask(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerNeedlescript(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco) => {
      scheduleNeedlescriptProviders(monaco);
      // Cmd/Ctrl+Enter → Run
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        run();
      });
    },
    [run],
  );

  const lineCount = source.split('\n').length;
  // Monaco line height (px) — 20px matches the IDE setting in EditorPane
  const editorHeight = Math.max(3, lineCount) * 20 + 16; // +16 for top/bottom padding

  return (
    <div
      style={{
        border: '1px solid var(--bk-cell-border)',
        borderRadius: 6,
        overflow: 'hidden',
        marginBlock: '1.75rem',
        background: 'var(--bk-cell-bg)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.5rem 0.35rem 0.75rem',
          borderBottom: '1px solid var(--bk-cell-border)',
          background: 'var(--bk-cell-bg)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--bk-text-faint)',
            flexGrow: 1,
          }}
        >
          NeedleScript
        </span>

        <button
          onClick={reset}
          title="Reset to original code"
          style={{
            background: 'none',
            border: '1px solid var(--bk-border)',
            borderRadius: 3,
            padding: '2px 8px',
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.72rem',
            color: 'var(--bk-text-muted)',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>

        <button
          onClick={run}
          disabled={isRunning}
          title="Run (Cmd/Ctrl+Enter)"
          style={{
            background: isRunning ? 'var(--bk-text-faint)' : 'var(--bk-run)',
            border: 'none',
            borderRadius: 3,
            padding: '3px 12px',
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: 'var(--bk-run-text)',
            cursor: isRunning ? 'wait' : 'pointer',
          }}
        >
          {isRunning ? '…' : 'Run ▶'}
        </button>
      </div>

      {/* Monaco editor */}
      <div style={{ background: theme === 'dark' ? '#252B41' : '#ffffff' }}>
        <Editor
          height={editorHeight}
          language="needlescript"
          theme={monacoTheme}
          value={source}
          onChange={(v) => setSource(v ?? '')}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineDecorationsWidth: 4,
            lineNumbersMinChars: 2,
            glyphMargin: false,
            folding: false,
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            scrollbar: { vertical: 'hidden', horizontal: 'auto' },
            overviewRulerLanes: 0,
            renderLineHighlight: 'line',
            fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 13,
            lineHeight: 20,
            padding: { top: 8, bottom: 8 },
            quickSuggestions: true,
            suggest: { showWords: false },
            contextmenu: false,
          }}
        />
      </div>

      {/* Canvas */}
      <BookCanvas result={result} stats={stats} height={canvasHeight} />

      {/* Stats / error */}
      <StatsRow stats={stats} error={error} />
    </div>
  );
}
