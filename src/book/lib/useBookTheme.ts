/**
 * src/book/lib/useBookTheme.ts
 *
 * Returns the current book theme ('light' | 'dark') by reading the
 * data-book-theme attribute on the nearest ancestor element.
 *
 * Components use this to pick the correct Monaco theme and canvas background.
 */
import { useState, useEffect } from 'react';

export function useBookTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // During SSR/initial hydration, default to light.
    if (typeof document === 'undefined') return 'light';
    const el = document.querySelector('[data-book-theme]');
    return (el?.getAttribute('data-book-theme') as 'light' | 'dark') ?? 'light';
  });

  useEffect(() => {
    // Watch for attribute changes on the root element.
    const target = document.querySelector('[data-book-theme]');
    if (!target) return;

    const observer = new MutationObserver(() => {
      const val = target.getAttribute('data-book-theme');
      setTheme(val === 'dark' ? 'dark' : 'light');
    });
    observer.observe(target, { attributes: true, attributeFilter: ['data-book-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
