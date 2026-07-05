/**
 * src/book/components/RunLocked.tsx
 *
 * Read-only code cell with a live preview.
 * An "Edit" button forks the cell into a full editable Run instance.
 *
 * Usage in MDX:
 *   <RunLocked>
 *   {`repeat 4 [ fd 15 rt 90 ]`}
 *   </RunLocked>
 */
import { useState, useCallback, useEffect, type ReactNode } from 'react';
import type { RunResult, DesignStats } from '../../lib/types.ts';
import { useCompiler } from '../../hooks/useCompiler.ts';
import BookCanvas from './BookCanvas.tsx';
import Run from './Run.tsx';

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

export default function RunLocked({ children, canvasHeight = 280 }: Props) {
  const [forked, setForked] = useState(false);
  const code = extractCode(children);

  const [result, setResult] = useState<RunResult | null>(null);
  const [stats, setStats] = useState<DesignStats | null>(null);
  const { compile } = useCompiler();

  const run = useCallback(async () => {
    const response = await compile(code);
    if (response === null || !response.ok) return;
    setResult(response.result);
    setStats(response.stats);
  }, [compile, code]);

  // Auto-run once on mount — deferred to avoid setState directly in effect body.
  useEffect(() => {
    queueMicrotask(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After forking, delegate fully to Run which has its own worker
  if (forked) {
    return <Run canvasHeight={canvasHeight}>{code}</Run>;
  }

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
          NeedleScript
        </span>

        <button
          onClick={() => setForked(true)}
          title="Fork into an editable cell"
          style={{
            background: 'none',
            border: '1px solid var(--bk-locked)',
            borderRadius: 3,
            padding: '2px 10px',
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.78rem',
            color: 'var(--bk-locked)',
            cursor: 'pointer',
          }}
        >
          Edit ✎
        </button>
      </div>

      {/* Source displayed as highlighted pre */}
      <pre
        style={{
          margin: 0,
          padding: '0.75rem 1rem',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.82rem',
          lineHeight: 1.55,
          overflowX: 'auto',
          background: 'var(--bk-code-bg)',
          color: 'var(--bk-code-text)',
          border: 'none',
          borderRadius: 0,
        }}
      >
        <code>{code}</code>
      </pre>

      {/* Canvas */}
      <BookCanvas result={result} stats={stats} height={canvasHeight} />
    </div>
  );
}
