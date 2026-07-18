/**
 * src/book/BookErrorBoundary.tsx
 *
 * Simple class-based error boundary for the /book section.
 * Prevents a rendering error anywhere in the book from collapsing the
 * entire React tree and showing just the dark body background.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class BookErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so it's visible in devtools without crashing
    console.error('[Book] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: 'var(--bk-bg, #fff)',
            color: 'var(--bk-text, #111)',
            fontFamily: 'var(--bk-font-mono, monospace)',
          }}
        >
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.5 }}>
            Something went wrong
          </p>
          <pre
            style={{
              fontSize: '0.78rem',
              color: 'var(--bk-run, #c8472f)',
              maxWidth: '70ch',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '1.5rem',
              padding: '0.4rem 1rem',
              background: 'var(--bk-text, #111)',
              color: 'var(--bk-bg, #fff)',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
