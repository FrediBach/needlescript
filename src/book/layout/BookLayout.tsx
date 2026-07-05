import { useState, useEffect, type ReactNode } from 'react';
import BookHeader from './BookHeader.tsx';
import TOCSidebar from './TOCSidebar.tsx';

interface Props {
  children: ReactNode;
}

const THEME_KEY = 'ns-book-theme';

function readStoredTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // ignore
  }
  // Default to system preference
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export default function BookLayout({ children }: Props) {
  // Read theme synchronously in the initializer to avoid a flash of wrong theme.
  const [theme, setTheme] = useState<'light' | 'dark'>(readStoredTheme);
  const [menuOpen, setMenuOpen] = useState(false);

  // Persist theme changes
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return (
    <div
      data-book-theme={theme}
      className="book-root"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}
    >
      <BookHeader
        theme={theme}
        setTheme={setTheme}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        menuOpen={menuOpen}
      />

      <TOCSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Main content — offset right on wide screens when sidebar is open */}
      <main
        style={{
          flex: 1,
          paddingTop: '2.5rem',
          paddingBottom: '2rem',
          paddingInline: 'clamp(1rem, 5vw, 3rem)',
          // Shift content right when the sidebar would overlay it on wide viewports.
          // On narrow viewports the sidebar overlays without shifting.
          marginLeft: menuOpen ? 'clamp(0px, 260px, 33vw)' : 0,
          transition: 'margin-left 0.2s ease',
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
