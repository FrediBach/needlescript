/**
 * src/book/components/Checkpoint.tsx
 *
 * End-of-chapter block: wraps a set of quiz items and/or challenge prompts.
 * Completing it (all quizzes answered correctly) marks the chapter done
 * in localStorage via the progress store.
 *
 * Usage in MDX:
 *   <Checkpoint chapterId="ch-0-5">
 *     Run the hello-hoop program, change one number, and re-run it.
 *   </Checkpoint>
 */
import { type ReactNode } from 'react';
import { markChapterDone } from '../lib/progress.ts';

interface Props {
  chapterId: string;
  children?: ReactNode;
  /** Called when the user clicks "Mark complete". */
  onComplete?: () => void;
}

import { useState } from 'react';

export default function Checkpoint({ chapterId, children, onComplete }: Props) {
  const [done, setDone] = useState(false);

  const handleComplete = () => {
    markChapterDone(chapterId);
    setDone(true);
    onComplete?.();
  };

  return (
    <div
      style={{
        border: '2px solid var(--bk-border-strong)',
        borderRadius: 6,
        overflow: 'hidden',
        marginBlock: '2.5rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.5rem 0.9rem',
          background: done ? 'var(--bk-chip-correct-bg)' : 'var(--bk-bg-alt)',
          borderBottom: '1px solid var(--bk-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: done ? 'var(--bk-chip-correct-text)' : 'var(--bk-text-faint)',
            fontWeight: 600,
            flexGrow: 1,
          }}
        >
          {done ? '✓ Checkpoint complete' : 'Checkpoint'}
        </span>
      </div>

      <div style={{ padding: '1rem 1rem 0.75rem' }}>
        {/* Chapter content (quiz items, challenge description) */}
        <div style={{ marginBottom: '1rem' }}>{children}</div>

        {/* Mark complete button */}
        {!done && (
          <button
            onClick={handleComplete}
            style={{
              background: 'var(--bk-text)',
              color: 'var(--bk-bg)',
              border: 'none',
              borderRadius: 4,
              padding: '0.45rem 1.1rem',
              fontFamily: 'var(--bk-font-mono)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Mark complete ✓
          </button>
        )}

        {done && (
          <p
            style={{
              margin: 0,
              color: 'var(--bk-chip-correct-text)',
              fontFamily: 'var(--bk-font-mono)',
              fontSize: '0.82rem',
            }}
          >
            Great work — this chapter is marked done in the sidebar.
          </p>
        )}
      </div>
    </div>
  );
}
