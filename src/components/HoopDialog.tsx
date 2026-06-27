import { useEffect } from 'react';
import type { HoopConfig } from '../data.ts';
import { HOOPS } from '../data.ts';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog.tsx';
import { buttonVariants } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

// Hoop shape icon — used in both the dialog and the header button
export function HoopIcon({ hoop, size = 20 }: { hoop: HoopConfig; size?: number }) {
  const pad = size * 0.12;
  const hw = size / 2;
  const aspect = hoop.widthMM / hoop.heightMM;
  const maxW = size - pad * 2;
  const maxH = size - pad * 2;

  let shapeW: number, shapeH: number;
  if (aspect >= 1) {
    shapeW = maxW;
    shapeH = maxW / aspect;
  } else {
    shapeH = maxH;
    shapeW = maxH * aspect;
  }

  const rx = shapeW / 2;
  const ry = shapeH / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {hoop.shape === 'circle' && (
        <circle cx={hw} cy={hw} r={rx} stroke="currentColor" strokeWidth="1.5" />
      )}
      {hoop.shape === 'oval' && (
        <ellipse cx={hw} cy={hw} rx={rx} ry={ry} stroke="currentColor" strokeWidth="1.5" />
      )}
      {hoop.shape === 'rectangle' && (
        <rect
          x={hw - rx}
          y={hw - ry}
          width={shapeW}
          height={shapeH}
          rx={2.5}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

interface Props {
  open: boolean;
  current: HoopConfig;
  onSelect: (hoop: HoopConfig) => void;
  onClose: () => void;
}

export default function HoopDialog({ open, current, onSelect, onClose }: Props) {
  // Keep keyboard shortcut for Escape (also handled natively by base-ui Dialog,
  // but we keep this for belt-and-suspenders consistency)
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[460px] w-full p-0 gap-0 rounded-xl overflow-hidden bg-card border border-border"
        aria-label="Hoop size and shape"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[14px] py-[11px] border-b border-dashed border-border">
          <span className="text-[11px] tracking-[0.16em] uppercase text-[var(--gold)] select-none">
            Hoop size &amp; shape
          </span>
          <DialogClose className="text-[14px] font-mono text-muted-foreground bg-transparent border-none cursor-pointer px-[6px] py-[3px] rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ✕
          </DialogClose>
        </div>

        {/* Grid of hoop options */}
        <div className="grid grid-cols-4 gap-2 p-[14px]">
          {HOOPS.map((hoop) => (
            <button
              key={hoop.id}
              type="button"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'flex flex-col items-center gap-2 py-[13px] pb-[11px] px-2 h-auto',
                'font-mono text-[10px] text-muted-foreground',
                'border-[1.5px] transition-colors duration-100',
                hoop.id === current.id && 'border-[var(--gold)] text-foreground',
              )}
              onClick={() => {
                onSelect(hoop);
                onClose();
              }}
              aria-pressed={hoop.id === current.id}
            >
              <HoopIcon hoop={hoop} size={38} />
              <span className="text-center leading-[1.4] text-inherit">{hoop.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
