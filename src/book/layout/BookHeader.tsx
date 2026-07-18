import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  theme: 'light' | 'dark';
  setTheme: Dispatch<SetStateAction<'light' | 'dark'>>;
  onMenuToggle: () => void;
  menuOpen: boolean;
}

export default function BookHeader({ theme, setTheme, onMenuToggle, menuOpen }: Props) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bk-bg)',
        borderBottom: '1px solid var(--bk-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1.25rem',
        height: '3rem',
      }}
    >
      {/* Sidebar toggle (mobile) */}
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          color: 'var(--bk-text)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: 18,
            height: 1.5,
            background: 'currentColor',
            transition: 'transform 0.15s, opacity 0.15s',
            transform: menuOpen ? 'translateY(5.5px) rotate(45deg)' : 'none',
          }}
        />
        <span
          style={{
            display: 'block',
            width: 18,
            height: 1.5,
            background: 'currentColor',
            opacity: menuOpen ? 0 : 1,
            transition: 'opacity 0.15s',
          }}
        />
        <span
          style={{
            display: 'block',
            width: 18,
            height: 1.5,
            background: 'currentColor',
            transition: 'transform 0.15s, opacity 0.15s',
            transform: menuOpen ? 'translateY(-5.5px) rotate(-45deg)' : 'none',
          }}
        />
      </button>

      {/* Book title link */}
      <Link
        to="/book"
        style={{
          fontFamily: 'var(--bk-font-prose)',
          fontWeight: 700,
          fontSize: '0.9rem',
          letterSpacing: '-0.01em',
          color: 'var(--bk-text)',
          textDecoration: 'none',
          flexGrow: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        NeedleScript
        <span
          style={{
            fontWeight: 400,
            color: 'var(--bk-text-muted)',
            marginLeft: '0.4rem',
            fontSize: '0.85rem',
          }}
        >
          The Interactive Book
        </span>
      </Link>

      {/* Dark mode toggle */}
      <button
        type="button"
        onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        style={{
          background: 'none',
          border: '1px solid var(--bk-border)',
          borderRadius: 4,
          cursor: 'pointer',
          color: 'var(--bk-text)',
          padding: '4px 8px',
          fontSize: '0.8rem',
          fontFamily: 'var(--bk-font-mono)',
          flexShrink: 0,
        }}
      >
        {theme === 'light' ? '◐' : '◑'}
      </button>

      {/* Playground link */}
      <Link
        to="/"
        style={{
          fontSize: '0.8rem',
          fontFamily: 'var(--bk-font-mono)',
          color: 'var(--bk-text-muted)',
          textDecoration: 'none',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        Playground ↗
      </Link>
    </header>
  );
}
