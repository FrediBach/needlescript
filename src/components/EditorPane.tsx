import { useRef, useState, useCallback } from 'react';
import type { ConsoleMessage } from '../App.tsx';
import styles from './EditorPane.module.css';

interface Props {
  source: string;
  onSourceChange: (src: string) => void;
  onRun: () => void;
  messages: ConsoleMessage[];
  isDragging: boolean;
}

export default function EditorPane({ source, onSourceChange, onRun, messages, isDragging }: Props) {
  const [replValue, setReplValue] = useState('');
  const replHistoryRef = useRef<string[]>([]);
  const replIdxRef = useRef(-1);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart, end = el.selectionEnd;
      const next = el.value.slice(0, s) + '  ' + el.value.slice(end);
      onSourceChange(next);
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  }, [onRun, onSourceChange]);

  const handleReplKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const line = replValue.trim();
      if (!line) return;
      replHistoryRef.current.push(line);
      replIdxRef.current = replHistoryRef.current.length;
      const v = source;
      const next = v + (v && !v.endsWith('\n') ? '\n' : '') + line;
      onSourceChange(next);
      setReplValue('');
      // Scroll editor to bottom
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight;
      });
      onRun();
    } else if (e.key === 'ArrowUp') {
      if (replIdxRef.current > 0) {
        replIdxRef.current--;
        setReplValue(replHistoryRef.current[replIdxRef.current]);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowDown') {
      if (replIdxRef.current < replHistoryRef.current.length - 1) {
        replIdxRef.current++;
        setReplValue(replHistoryRef.current[replIdxRef.current]);
      } else {
        replIdxRef.current = replHistoryRef.current.length;
        setReplValue('');
      }
      e.preventDefault();
    }
  }, [replValue, source, onSourceChange, onRun]);

  return (
    <section className={`${styles.pane} ${isDragging ? styles.dragging : ''}`}>
      <div className={styles.paneLabel}>pattern</div>
      <textarea
        ref={editorRef}
        className={styles.editor}
        value={source}
        onChange={e => onSourceChange(e.target.value)}
        onKeyDown={handleEditorKeyDown}
        spellCheck={false}
        aria-label="Needlescript program"
      />

      <div className={styles.console} aria-live="polite">
        {messages.map(msg => (
          <div key={msg.id} className={styles[msg.type] || ''}>
            {msg.text}
          </div>
        ))}
      </div>

      <div className={styles.replRow}>
        <span className={styles.prompt}>›</span>
        <input
          type="text"
          className={styles.repl}
          value={replValue}
          onChange={e => setReplValue(e.target.value)}
          onKeyDown={handleReplKeyDown}
          autoComplete="off"
          placeholder="type a command and press Enter — it's appended to the pattern (↑ history)"
          aria-label="REPL input"
        />
      </div>

      {isDragging && (
        <div className={styles.dropOverlay}>drop SVG to convert</div>
      )}
    </section>
  );
}
