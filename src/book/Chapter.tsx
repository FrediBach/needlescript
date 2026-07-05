/**
 * src/book/Chapter.tsx
 *
 * Route component for /book/:id — lazy-loads the MDX module for the chapter,
 * renders it inside the MDXProvider with all book components injected globally.
 */
import { Suspense, lazy, useEffect, useRef, type ComponentType } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { CHAPTERS, getChapterById, getPrevNext } from './lib/chapters.ts';
import ChapterNav from './layout/ChapterNav.tsx';
import * as BookComponents from './components/index.ts';

// Build the lazy component map at module initialisation time (not during render)
// so the same component object is reused across navigations.
const LAZY_MAP = new Map(
  CHAPTERS.map((ch) => [ch.id, lazy(ch.load as () => Promise<{ default: ComponentType }>)]),
);

function ChapterFallback() {
  return (
    <div
      style={{
        padding: '3rem 0',
        color: 'var(--bk-text-faint)',
        fontFamily: 'var(--bk-font-mono)',
        fontSize: '0.85rem',
      }}
    >
      Loading…
    </div>
  );
}

export default function Chapter() {
  const { id } = useParams<{ id: string }>();
  const scrolledRef = useRef<string | null>(null);

  const chapter = id ? getChapterById(id) : undefined;
  const { prev, next } = id ? getPrevNext(id) : { prev: null, next: null };

  // Scroll to top when chapter changes
  useEffect(() => {
    if (id && scrolledRef.current !== id) {
      scrolledRef.current = id;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [id]);

  if (!chapter) {
    return <Navigate to="/book" replace />;
  }

  // The lazy component is pre-built in LAZY_MAP at module initialisation (above),
  // not created during this render — the linter can't trace through Map.get().
  const LazyContent = LAZY_MAP.get(chapter.id)!;

  return (
    <article className="book-prose">
      {/* Chapter header */}
      <header style={{ marginBottom: '2rem' }}>
        <div
          style={{
            fontFamily: 'var(--bk-font-mono)',
            fontSize: '0.72rem',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--bk-text-faint)',
            marginBottom: '0.4rem',
          }}
        >
          {chapter.part}
        </div>
        <h1 style={{ marginBottom: chapter.subtitle ? '0.35rem' : 0 }}>{chapter.title}</h1>
        {chapter.subtitle && (
          <p
            style={{
              margin: 0,
              fontSize: '1.1rem',
              color: 'var(--bk-text-muted)',
              fontStyle: 'italic',
            }}
          >
            {chapter.subtitle}
          </p>
        )}
      </header>

      {/* MDX content with all book components available globally */}
      <MDXProvider components={BookComponents}>
        <Suspense fallback={<ChapterFallback />}>
          {/* The lazy component referencing LAZY_MAP is stable (module-level map),
              not created during this render. The linter cannot trace through Map.get(). */}
          {/* eslint-disable-next-line react-hooks/static-components -- module-level lazy */}
          <LazyContent />
        </Suspense>
      </MDXProvider>

      {/* Prev / Next navigation */}
      <ChapterNav prev={prev} next={next} />
    </article>
  );
}
