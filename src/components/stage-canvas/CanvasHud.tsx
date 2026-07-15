import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import {
  canvasDragRectBorder,
  canvasDragRectFill,
  canvasZoomBadgeBg,
  canvasZoomBadgeText,
  fontMono,
  fsBase,
} from '../../theme.ts';
import styles from '../StagePane.module.css';
import { formatPointLiteral } from './sample-point.ts';
import type { DragState, SampleContextMenu } from './types.ts';

interface CanvasHudProps {
  dragRect: DragState | null;
  zoomLevel: number | null;
  sampleContextMenu: SampleContextMenu | null;
  onCopySample: () => void;
}

export function CanvasHud({
  dragRect,
  zoomLevel,
  sampleContextMenu,
  onCopySample,
}: CanvasHudProps) {
  return (
    <>
      {dragRect && <ZoomSelectionRect dragRect={dragRect} />}
      {zoomLevel !== null && <ZoomBadge zoomLevel={zoomLevel} />}
      {sampleContextMenu && (
        <SampleContextMenu menu={sampleContextMenu} onCopySample={onCopySample} />
      )}
    </>
  );
}

function ZoomSelectionRect({ dragRect }: { dragRect: DragState }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.min(dragRect.startX, dragRect.currentX),
        top: Math.min(dragRect.startY, dragRect.currentY),
        width: Math.abs(dragRect.currentX - dragRect.startX),
        height: Math.abs(dragRect.currentY - dragRect.startY),
        border: canvasDragRectBorder,
        background: canvasDragRectFill,
        pointerEvents: 'none',
      }}
    />
  );
}

function ZoomBadge({ zoomLevel }: { zoomLevel: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        right: 10,
        padding: '2px 7px',
        borderRadius: 4,
        background: canvasZoomBadgeBg,
        color: canvasZoomBadgeText,
        fontFamily: fontMono,
        fontSize: fsBase - 2,
        letterSpacing: '0.04em',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {zoomLevel.toFixed(1)}×
    </div>
  );
}

function SampleContextMenu({
  menu,
  onCopySample,
}: {
  menu: SampleContextMenu;
  onCopySample: () => void;
}) {
  return createPortal(
    <div
      className={styles.sampleContextMenu}
      style={{ left: menu.clientX, top: menu.clientY }}
      role="menu"
      aria-label="Sample position"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button className={styles.sampleContextMenuItem} type="button" onClick={onCopySample}>
        <Copy size={13} aria-hidden="true" />
        Copy {formatPointLiteral(menu.mmX, menu.mmY)}
      </button>
    </div>,
    document.body,
  );
}
