import { Link } from 'react-router-dom';
import type { Chapter } from '../lib/chapters.ts';

interface Props {
  prev: Chapter | null;
  next: Chapter | null;
}

export default function ChapterNav({ prev, next }: Props) {
  return (
    <nav
      aria-label="Chapter navigation"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        borderTop: '1px solid var(--bk-border)',
        marginTop: '3rem',
        paddingTop: '1.5rem',
        paddingBottom: '3rem',
      }}
    >
      <div style={{ flex: 1 }}>
        {prev && (
          <Link
            to={`/book/${prev.id}`}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              gap: '0.2rem',
              textDecoration: 'none',
              color: 'var(--bk-text)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--bk-font-mono)',
                fontSize: '0.72rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--bk-text-faint)',
              }}
            >
              ← Previous
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{prev.title}</span>
          </Link>
        )}
      </div>

      <div style={{ flex: 1, textAlign: 'right' }}>
        {next && (
          <Link
            to={`/book/${next.id}`}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.2rem',
              textDecoration: 'none',
              color: 'var(--bk-text)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--bk-font-mono)',
                fontSize: '0.72rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--bk-text-faint)',
              }}
            >
              Next →
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
