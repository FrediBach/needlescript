/**
 * src/book/components/Scrub.tsx
 *
 * A Run cell with a stitch-by-stitch playback scrubber docked below the canvas.
 * The book's most important teaching widget — shows *which line made which stitch*.
 *
 * Usage in MDX:
 *   <Scrub>
 *   {`repeat 6 [ fd 20 rt 60 ]`}
 *   </Scrub>
 */
import { useState, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import Editor from '@monaco-editor/react';
import type { BeforeMount, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { RunResult, DesignStats, StitchEvent } from '../../lib/types.ts';
import { useCompiler } from '../../hooks/useCompiler.ts';
import { registerNeedlescript } from '../../lib/needlescript-monaco.ts';
import BookCanvas from './BookCanvas.tsx';
import { useBookTheme } from '../lib/useBookTheme.ts';

interface Props {
  children: ReactNode;
  canvasHeight?: number;
}

function extractCode(children: ReactNode): string {
  if (typeof children === 'string') return children.trim();
  const el = children as React.ReactElement<{ children: ReactNode }>;
  if (el && typeof el === 'object' && 'props' in el) return extractCode(el.props.children);
  return String(children ?? '').trim();
}

/** Determine the source line for a given stitch index by scanning backwards. */
function lineAtStitchIndex(pts: StitchEvent[], idx: number): number | null {
  for (let i = Math.min(idx - 1, pts.length - 1); i >= 0; i--) {
    if (pts[i].line !== undefined) return pts[i].line ?? null;
  }
  return null;
}

export default function Scrub({ children, canvasHeight = 280 }: Props) {
  const initialCode = extractCode(children);
  const [source, setSource] = useState(initialCode);
  const sourceRef = useRef(source);
  // Keep the ref current after every render without reading during render
  useLayoutEffect(() => {
    sourceRef.current = source;
  });

  const [result, setResult] = useState<RunResult | null>(null);
  const [stats, setStats] = useState<DesignStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // pts = stitch + jump events only (parallel array to full events)
  const [pts, setPts] = useState<StitchEvent[]>([]);
  const [scrubPos, setScrubPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  const { compile } = useCompiler();
  const theme = useBookTheme();
  const monacoTheme = theme === 'dark' ? 'needlescript-dark' : 'needlescript-light';
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);

  const run = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const response = await compile(sourceRef.current);
    setIsRunning(false);
    if (response === null) return;
    if (!response.ok) {
      setError(response.message);
      setResult(null);
      setStats(null);
      setPts([]);
      setScrubPos(0);
      return;
    }
    const nextPts = response.result.events.filter((e) => e.t === 'stitch' || e.t === 'jump');
    setResult(response.result);
    setStats(response.stats);
    setPts(nextPts);
    setScrubPos(nextPts.length); // show full design initially
  }, [compile]);

  const reset = useCallback(() => {
    setSource(initialCode);
    setError(null);
  }, [initialCode]);

  useEffect(() => {
    queueMicrotask(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Playback animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const total = pts.length;
    if (total === 0) return;

    let pos = scrubPos >= total ? 0 : scrubPos;
    const perFrame = Math.max(1, Math.round(total / 420));

    function step() {
      pos += perFrame;
      if (pos >= total) {
        setScrubPos(total);
        setPlaying(false);
        return;
      }
      setScrubPos(pos);
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // scrubPos is intentionally read once when play starts (the starting position);
    // it must not be in the dep array or the effect would restart on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, pts.length]);

  // ── Source-line highlight ─────────────────────────────────────────────────
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const activeLine = lineAtStitchIndex(pts, scrubPos);
    if (!decorationsRef.current) {
      decorationsRef.current = ed.createDecorationsCollection();
    }
    if (activeLine == null) {
      decorationsRef.current.clear();
      return;
    }
    decorationsRef.current.set([
      {
        range: {
          startLineNumber: activeLine,
          endLineNumber: activeLine,
          startColumn: 1,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'ns-playback-line',
          linesDecorationsClassName: 'ns-playback-line-gutter',
        },
      },
    ]);
    ed.revealLineInCenterIfOutsideViewport(activeLine);
  }, [scrubPos, pts]);

  const lineCount = source.split('\n').length;
  const editorHeight = Math.max(3, lineCount) * 20 + 16;
  const total = pts.length;

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerNeedlescript(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (ed, monaco) => {
      editorRef.current = ed;
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
    },
    [run],
  );

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
          NeedleScript — scrubber
        </span>

        <button
          onClick={reset}
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

      {/* Editor */}
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
      <BookCanvas result={result} stats={stats} height={canvasHeight} scrubPos={scrubPos} />

      {/* Scrubber controls */}
      {total > 0 && !error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.75rem',
            borderTop: '1px solid var(--bk-cell-border)',
            background: 'var(--bk-cell-bg)',
          }}
        >
          <button
            onClick={() => {
              setPlaying((p) => !p);
            }}
            aria-label={playing ? 'Pause' : 'Play stitch sequence'}
            style={{
              background: 'none',
              border: '1px solid var(--bk-border)',
              borderRadius: 3,
              padding: '1px 8px',
              fontFamily: 'var(--bk-font-mono)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              color: 'var(--bk-text)',
              minWidth: 32,
            }}
          >
            {playing ? '❚❚' : '▶'}
          </button>

          <input
            type="range"
            min={0}
            max={total}
            value={scrubPos}
            onChange={(e) => {
              setPlaying(false);
              setScrubPos(Number(e.target.value));
            }}
            aria-label="Stitch playback position"
            style={{ flex: 1, accentColor: 'var(--bk-run)' }}
          />

          <span
            style={{
              fontFamily: 'var(--bk-font-mono)',
              fontSize: '0.72rem',
              color: 'var(--bk-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {scrubPos.toLocaleString()} / {total.toLocaleString()}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '0.4rem 0.75rem',
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.78rem',
            color: 'var(--bk-run)',
            borderTop: '1px solid var(--bk-cell-border)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
