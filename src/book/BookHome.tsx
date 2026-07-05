/**
 * src/book/BookHome.tsx
 *
 * The book's table-of-contents landing page at /book.
 */
import { Link } from 'react-router-dom';
import { groupByPart, CHAPTERS } from './lib/chapters.ts';
import { isChapterDone } from './lib/progress.ts';

const PARTS = groupByPart(CHAPTERS);

export default function BookHome() {
  return (
    <div className="book-prose">
      {/* Hero */}
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ marginBottom: '0.4rem' }}>NeedleScript</h1>
        <p
          style={{
            fontSize: '1.25rem',
            fontStyle: 'italic',
            color: 'var(--bk-text-muted)',
            margin: '0 0 1rem',
          }}
        >
          From First Stitch to Generative Fabric
        </p>
        <p style={{ maxWidth: '55ch', color: 'var(--bk-text-muted)' }}>
          An interactive book. Every page is a mix of prose and runnable code — edit any cell, see
          the embroidery update live, then export to your machine.
        </p>
        <Link
          to="/book/ch-0-1"
          style={{
            display: 'inline-block',
            marginTop: '1.2rem',
            padding: '0.55rem 1.4rem',
            background: 'var(--bk-text)',
            color: 'var(--bk-bg)',
            borderRadius: 4,
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.95rem',
            fontFamily: 'var(--bk-font-prose)',
          }}
        >
          Start reading →
        </Link>
      </div>

      {/* Parts */}
      {PARTS.map((part) => (
        <section key={part.number} style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>{part.title}</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {part.chapters.map((ch) => {
              const done = isChapterDone(ch.id);
              return (
                <Link
                  key={ch.id}
                  to={`/book/${ch.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    padding: '0.65rem 0.9rem',
                    border: '1px solid var(--bk-border)',
                    borderRadius: 5,
                    textDecoration: 'none',
                    color: 'var(--bk-text)',
                    background: done ? 'var(--bk-chip-correct-bg)' : 'var(--bk-bg)',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {ch.title}
                    {done && <span style={{ marginLeft: '0.4rem', color: 'var(--bk-ok)' }}>✓</span>}
                  </span>
                  {ch.subtitle && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--bk-text-muted)' }}>
                      {ch.subtitle}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
