import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { HoopConfig } from '../data.ts';
import { HOOPS } from '../data.ts';
import type { MaterialIntent } from '../lib/engine.ts';
import {
  FABRIC_MODES,
  NEEDLE_SIZES,
  STABILIZER_MODES,
  THREAD_PROFILES,
  THREAD_PROFILE_MODES,
} from '../lib/engine.ts';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog.tsx';
import { buttonVariants } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { cn } from '@/utils.ts';

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
  currentHoop: HoopConfig;
  currentBackground: string;
  currentPalette: string[];
  currentMaterial: MaterialIntent;
  onApply: (settings: HoopDialogSettings) => void;
  onClose: () => void;
  /** When true, the `hoop` language directive is active. */
  isSetByCode?: boolean;
}

export interface HoopDialogSettings {
  hoop: HoopConfig;
  background: string;
  palette: string[];
  material: MaterialIntent;
}

const fieldClass =
  'h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

interface PaletteDraftColor {
  id: number;
  color: string;
}

interface HoopDialogDraft extends Omit<HoopDialogSettings, 'palette'> {
  palette: PaletteDraftColor[];
}

let nextPaletteColorId = 0;

function cloneSettings(
  hoop: HoopConfig,
  background: string,
  palette: string[],
  material: MaterialIntent,
): HoopDialogDraft {
  return {
    hoop,
    background,
    palette: palette.map((color) => ({ id: nextPaletteColorId++, color })),
    material: { ...material },
  };
}

interface SetupSectionProps {
  draft: HoopDialogDraft;
  setDraft: Dispatch<SetStateAction<HoopDialogDraft>>;
}

function HoopSizeSection({ draft, setDraft }: SetupSectionProps) {
  return (
    <section className="p-[14px]">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Hoop size &amp; shape
      </h2>
      <div className="grid grid-cols-4 gap-2 max-[480px]:grid-cols-2">
        {HOOPS.map((hoop) => (
          <button
            key={hoop.id}
            type="button"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'flex flex-col items-center gap-2 py-[13px] pb-[11px] px-2 h-auto',
              'font-mono text-[10px] text-muted-foreground',
              'border-[1.5px] transition-colors duration-100',
              hoop.id === draft.hoop.id && 'border-[var(--gold)] text-foreground',
            )}
            onClick={() => setDraft((value) => ({ ...value, hoop }))}
            aria-pressed={hoop.id === draft.hoop.id}
          >
            <HoopIcon hoop={hoop} size={38} />
            <span className="text-center leading-[1.4] text-inherit">{hoop.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ColorSection({ draft, setDraft }: SetupSectionProps) {
  return (
    <section className="border-t border-dashed border-border p-[14px]">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Fabric &amp; thread colors
      </h2>
      <div className="grid gap-3">
        <label className="grid grid-cols-[130px_1fr] items-center gap-3 text-xs">
          Background
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={draft.background}
              onChange={(event) =>
                setDraft((value) => ({ ...value, background: event.target.value }))
              }
              className="h-8 w-12 cursor-pointer rounded border border-input bg-background p-1"
              aria-label="Background color"
            />
            <code className="font-mono text-[11px] text-muted-foreground">{draft.background}</code>
          </span>
        </label>
        <div className="grid grid-cols-[130px_1fr] items-start gap-3 text-xs">
          <span className="pt-1.5">Palette</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.palette.map((entry, index) => (
              <input
                key={entry.id}
                type="color"
                value={entry.color}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    palette: value.palette.map((color) =>
                      color.id === entry.id ? { ...color, color: event.target.value } : color,
                    ),
                  }))
                }
                className="h-8 w-9 cursor-pointer rounded border border-input bg-background p-1"
                aria-label={`Palette color ${index + 1}`}
                title={`Thread ${index + 1}: ${entry.color}`}
              />
            ))}
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'size-8 p-0')}
              onClick={() =>
                setDraft((value) => ({ ...value, palette: value.palette.slice(0, -1) }))
              }
              disabled={draft.palette.length <= 1}
              aria-label="Remove last palette color"
            >
              −
            </button>
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'size-8 p-0')}
              onClick={() =>
                setDraft((value) => ({
                  ...value,
                  palette: [
                    ...value.palette,
                    {
                      id: nextPaletteColorId++,
                      color: value.palette.at(-1)?.color ?? '#000000',
                    },
                  ],
                }))
              }
              disabled={draft.palette.length >= 64}
              aria-label="Add palette color"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MaterialSection({ draft, setDraft }: SetupSectionProps) {
  return (
    <section className="border-t border-dashed border-border p-[14px]">
      <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Material &amp; thread intent
      </h2>
      <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
        Portable, brand-neutral production metadata. Fabric presets also tune construction.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-[540px]:grid-cols-1">
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Fabric preset
          <select
            value={draft.material.fabricPreset}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, fabricPreset: event.target.value },
              }))
            }
            className={fieldClass}
          >
            <option value="unspecified">Unspecified</option>
            {FABRIC_MODES.map((fabric) => (
              <option key={fabric} value={fabric}>
                {fabric}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Thread profile
          <select
            value={draft.material.threadProfile}
            onChange={(event) => {
              const profile = event.target.value as keyof typeof THREAD_PROFILES;
              setDraft((value) => ({
                ...value,
                material: {
                  ...value.material,
                  threadProfile: profile,
                  threadWidthMM: THREAD_PROFILES[profile].widthMM,
                },
              }));
            }}
            className={fieldClass}
          >
            {THREAD_PROFILE_MODES.map((profile) => (
              <option key={profile} value={profile}>
                {profile}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Grain heading (°)
          <input
            type="number"
            min={0}
            max={359.99}
            step={1}
            value={draft.material.grainHeading}
            required
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, grainHeading: event.target.valueAsNumber },
              }))
            }
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Coverage width (mm)
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.01}
            value={draft.material.threadWidthMM}
            required
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, threadWidthMM: event.target.valueAsNumber },
              }))
            }
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Stretch along grain (0–1)
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.material.stretchAlong}
            required
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, stretchAlong: event.target.valueAsNumber },
              }))
            }
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Stretch across grain (0–1)
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.material.stretchAcross}
            required
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, stretchAcross: event.target.valueAsNumber },
              }))
            }
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Needle (NM)
          <select
            value={draft.material.needleSize ?? 0}
            onChange={(event) => {
              const needleSize = Number(event.target.value) || undefined;
              setDraft((value) => ({
                ...value,
                material: { ...value.material, needleSize },
              }));
            }}
            className={fieldClass}
          >
            <option value={0}>Unspecified</option>
            {NEEDLE_SIZES.map((size) => (
              <option key={size} value={size}>
                NM {size}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Stabilizer
          <select
            value={draft.material.stabilizer ?? 'none'}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, stabilizer: event.target.value },
              }))
            }
            className={fieldClass}
          >
            {STABILIZER_MODES.map((stabilizer) => (
              <option key={stabilizer} value={stabilizer}>
                {stabilizer}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs max-[540px]:col-span-1">
          Water-soluble topping planned
          <Switch
            checked={draft.material.topping}
            onCheckedChange={(topping) =>
              setDraft((value) => ({
                ...value,
                material: { ...value.material, topping },
              }))
            }
            aria-label="Water-soluble topping planned"
          />
        </label>
      </div>
    </section>
  );
}

export default function HoopDialog({
  open,
  currentHoop,
  currentBackground,
  currentPalette,
  currentMaterial,
  onApply,
  onClose,
  isSetByCode,
}: Props) {
  const [draft, setDraft] = useState(() =>
    cloneSettings(currentHoop, currentBackground, currentPalette, currentMaterial),
  );
  const draftIsValid =
    Number.isFinite(draft.material.grainHeading) &&
    Number.isFinite(draft.material.stretchAlong) &&
    draft.material.stretchAlong >= 0 &&
    draft.material.stretchAlong <= 1 &&
    Number.isFinite(draft.material.stretchAcross) &&
    draft.material.stretchAcross >= 0 &&
    draft.material.stretchAcross <= 1 &&
    Number.isFinite(draft.material.threadWidthMM) &&
    draft.material.threadWidthMM >= 0.1 &&
    draft.material.threadWidthMM <= 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] max-w-[640px] w-full flex-col p-0 gap-0 rounded-xl overflow-hidden bg-card border border-border"
        aria-label="Hoop and design setup"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[14px] py-[11px] border-b border-dashed border-border">
          <span className="text-[11px] tracking-[0.16em] uppercase text-[var(--gold)] select-none">
            Hoop &amp; design setup
          </span>
          <DialogClose className="text-[14px] font-mono text-muted-foreground bg-transparent border-none cursor-pointer px-[6px] py-[3px] rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ✕
          </DialogClose>
        </div>

        {/* "set by code" banner */}
        {isSetByCode && (
          <div className="px-[14px] py-[8px] border-b border-dashed border-border bg-[var(--gold-08,rgba(180,140,60,0.08))]">
            <span className="font-mono text-[10px] text-[var(--gold)] leading-[1.5]">
              hoop set by{' '}
              <code className="bg-[rgba(0,0,0,0.06)] px-[3px] rounded text-inherit">hoop</code>{' '}
              directive in the source — choosing below updates that directive.
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <HoopSizeSection draft={draft} setDraft={setDraft} />
          <ColorSection draft={draft} setDraft={setDraft} />
          <MaterialSection draft={draft} setDraft={setDraft} />
        </div>

        <div className="flex justify-end gap-2 border-t border-dashed border-border px-[14px] py-[11px]">
          <button
            type="button"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={buttonVariants({ variant: 'default', size: 'sm' })}
            disabled={!draftIsValid}
            onClick={() => {
              onApply({
                ...draft,
                palette: draft.palette.map(({ color }) => color),
              });
              onClose();
            }}
          >
            Apply setup
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
