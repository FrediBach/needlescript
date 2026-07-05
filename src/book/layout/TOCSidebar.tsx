import { Link, useParams } from 'react-router-dom';
import { groupByPart, CHAPTERS } from '../lib/chapters.ts';
import { isChapterDone } from '../lib/progress.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PARTS = groupByPart(CHAPTERS);

export default function TOCSidebar({ open, onClose }: Props) {
  const { id: activeId } = useParams<{ id: string }>();

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20,
            background: 'rgba(0,0,0,0.35)',
          }}
          aria-hidden
        />
      )}

      <nav
        aria-label="Book navigation"
        style={{
          position: 'fixed',
          top: '3rem', // below the header
          left: 0,
          bottom: 0,
          width: 260,
          zIndex: 30,
          background: 'var(--bk-sidebar-bg)',
          borderRight: '1px solid var(--bk-sidebar-border)',
          overflowY: 'auto',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: '2rem',
        }}
      >
        {/* TOC link */}
        <Link
          to="/book"
          onClick={onClose}
          style={{
            display: 'block',
            padding: '0.75rem 1.25rem',
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--bk-text-muted)',
            textDecoration: 'none',
            borderBottom: '1px solid var(--bk-sidebar-border)',
            marginBottom: '0.5rem',
          }}
        >
          Table of Contents
        </Link>

        {PARTS.map((part) => (
          <div key={part.number} style={{ marginBottom: '0.25rem' }}>
            {/* Part heading */}
            <div
              style={{
                padding: '0.4rem 1.25rem 0.2rem',
                fontFamily: 'var(--bk-font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--bk-text-faint)',
                fontWeight: 600,
              }}
            >
              {part.title}
            </div>

            {/* Chapter links */}
            {part.chapters.map((ch) => {
              const isActive = ch.id === activeId;
              const isDone = isChapterDone(ch.id);
              return (
                <Link
                  key={ch.id}
                  to={`/book/${ch.id}`}
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    padding: '0.4rem 1.25rem',
                    fontFamily: 'var(--bk-font-prose)',
                    fontSize: '0.875rem',
                    color: isActive ? 'var(--bk-sidebar-active-text)' : 'var(--bk-text)',
                    background: isActive ? 'var(--bk-sidebar-active-bg)' : 'transparent',
                    textDecoration: 'none',
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ flexGrow: 1 }}>{ch.title}</span>
                  {isDone && !isActive && (
                    <span
                      aria-label="Completed"
                      style={{ fontSize: '0.7rem', color: 'var(--bk-ok)', flexShrink: 0 }}
                    >
                      ✓
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
