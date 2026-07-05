/**
 * src/book/components/Pitfall.tsx
 *
 * Styled callout for recurring error drills (D1–D6).
 * Appears once as a full introduction, then again as brief reminders in later chapters.
 *
 * Usage in MDX:
 *   <Pitfall drill="D4" title="Negative literals">
 *     `fd 10 -5` is parsed as two arguments, not subtraction.
 *     Use parentheses: `fd 10 (-5)`.
 *   </Pitfall>
 */
import type { ReactNode } from 'react';

interface Props {
  /** Drill identifier, e.g. "D1", "D4" */
  drill?: string;
  title: string;
  children: ReactNode;
}

export default function Pitfall({ drill, title, children }: Props) {
  return (
    <div
      style={{
        border: `1px solid var(--bk-warn)`,
        borderLeft: `4px solid var(--bk-warn)`,
        borderRadius: '0 4px 4px 0',
        padding: '0.75rem 1rem',
        marginBlock: '1.75rem',
        background: 'var(--bk-bg-alt)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          marginBottom: '0.4rem',
        }}
      >
        {drill && (
          <span
            style={{
              fontFamily: 'var(--bk-font-mono)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--bk-warn)',
              background: 'transparent',
              border: '1px solid var(--bk-warn)',
              borderRadius: 3,
              padding: '0 5px',
            }}
          >
            {drill}
          </span>
        )}
        <strong
          style={{
            fontFamily: 'var(--bk-font-prose)',
            fontSize: '0.95rem',
            color: 'var(--bk-warn)',
          }}
        >
          Pitfall: {title}
        </strong>
      </div>
      <div
        style={{
          fontSize: '0.9rem',
          color: 'var(--bk-text)',
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </div>
  );
}
