import { useState } from 'react';
import styles from './Splitter.module.css';

interface Props {
  /**
   * 'horizontal' — a vertical bar between a left and right panel (col-resize cursor).
   * 'vertical'   — a horizontal bar between a top and bottom panel (row-resize cursor).
   */
  orientation: 'horizontal' | 'vertical';
  /**
   * Called on every mousemove while dragging.
   * delta > 0 means the cursor moved right (horizontal) or down (vertical).
   */
  onDrag: (delta: number) => void;
  /** Called on double-click — parent should reset the split to its default. */
  onReset?: () => void;
}

export default function Splitter({ orientation, onDrag, onReset }: Props) {
  const [active, setActive] = useState(false);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    const cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';

    // Full-screen transparent cover — captures all mouse events so the
    // Monaco / canvas iframes cannot swallow them during a drag.
    const cover = document.createElement('div');
    cover.style.cssText =
      `position:fixed;inset:0;z-index:9999;cursor:${cursor}`;
    document.body.appendChild(cover);
    document.body.style.cursor    = cursor;
    document.body.style.userSelect = 'none';

    let lastPos = orientation === 'horizontal' ? e.clientX : e.clientY;
    setActive(true);

    function onMouseMove(ev: MouseEvent) {
      const pos   = orientation === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = pos - lastPos;
      lastPos = pos;
      if (delta !== 0) onDrag(delta);
    }

    function onMouseUp() {
      setActive(false);
      cover.remove();
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  const cls = [
    styles.splitter,
    styles[orientation],
    active ? styles.active : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      role="separator"
      aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
      title="Drag to resize · Double-click to reset"
    />
  );
}
