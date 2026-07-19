import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BITMAP_HELPERS,
  bitmapPrefix,
  emitBitmapCode,
  processBitmap,
  uniqueBitmapPrefix,
} from '@/lib/formats/bitmap.ts';
import type { BitmapPixels, BitmapSettings } from '@/lib/formats/bitmap.ts';
import { THREADS } from '@/data.ts';
import { Button } from '@/components/ui/button.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Slider } from '@/components/ui/slider.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { cn } from '@/utils.ts';

export interface BitmapImportSource extends BitmapPixels {
  filename: string;
}

interface Props {
  source: BitmapImportSource | null;
  programSource: string;
  onClose: () => void;
  onInsert: (code: string, summary: string) => void;
}

type Section = 'region' | 'resolution' | 'colors' | 'tone' | 'insert';

const IMPORT_TABS: Array<[Section, string]> = [
  ['region', '1 Region'],
  ['resolution', '2 Resolution'],
  ['colors', '3 Colors'],
  ['tone', '4 Tone'],
  ['insert', '5 Insert'],
];

function initialSettings(image: BitmapImportSource): BitmapSettings {
  const aspect = image.width / image.height;
  const width = aspect >= 1 ? image.height : image.width;
  const height = width;
  const x = Math.round((image.width - width) / 2);
  const y = Math.round((image.height - height) / 2);
  return {
    crop: { x, y, width, height },
    columns: 48,
    rows: 48,
    fabric: '#f5efe4',
    threads: ['#2B2B2B'],
    invert: false,
    steps: 8,
    dither: false,
    mm: 60,
  };
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))
        }
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <output className="font-mono text-foreground">
          {value.toLocaleString()} px
          <span className="ml-1.5 text-muted-foreground">
            ({min.toLocaleString()}–{max.toLocaleString()})
          </span>
        </output>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        disabled={min === max}
        aria-label={label}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </div>
  );
}

function CropPreview({
  source,
  crop,
}: {
  source: BitmapImportSource;
  crop: BitmapSettings['crop'];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const longestSide = 560;
    const scale = longestSide / Math.max(source.width, source.height);
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixels = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = source.width;
    imageCanvas.height = source.height;
    const imageCtx = imageCanvas.getContext('2d');
    if (!imageCtx) return;
    imageCtx.putImageData(pixels, 0, 0);
    ctx.drawImage(imageCanvas, 0, 0, canvas.width, canvas.height);

    const x = crop.x * scale;
    const y = crop.y * scale;
    const width = crop.width * scale;
    const height = crop.height * scale;
    ctx.fillStyle = 'rgba(8, 10, 12, 0.56)';
    ctx.fillRect(0, 0, canvas.width, y);
    ctx.fillRect(0, y + height, canvas.width, canvas.height - y - height);
    ctx.fillRect(0, y, x, height);
    ctx.fillRect(x + width, y, canvas.width - x - width, height);
    ctx.strokeStyle = '#f6c558';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
  }, [crop, source]);

  return (
    <figure className="grid gap-1.5">
      <figcaption className="text-[11px] text-muted-foreground">
        Original image · crop highlighted
      </figcaption>
      <canvas
        ref={canvasRef}
        className="max-h-44 w-full rounded-md border border-foreground/10 bg-muted object-contain"
      />
    </figure>
  );
}

function BitmapPreview({
  source,
  settings,
  stitched,
  grid,
  hoop,
}: {
  source: BitmapImportSource;
  settings: BitmapSettings;
  stitched: boolean;
  grid: boolean;
  hoop: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processed = useMemo(() => processBitmap(source, settings), [source, settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 520;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = settings.fabric;
    ctx.fillRect(0, 0, size, size);

    if (!stitched) {
      const scratch = document.createElement('canvas');
      scratch.width = source.width;
      scratch.height = source.height;
      const imageCtx = scratch.getContext('2d');
      if (imageCtx) {
        imageCtx.putImageData(
          new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
          0,
          0,
        );
        const { x, y, width, height } = settings.crop;
        ctx.drawImage(scratch, x, y, width, height, 0, 0, size, size);
      }
    } else {
      const cellW = size / settings.columns;
      const cellH = size / settings.rows;
      for (let row = 0; row < settings.rows; row++) {
        for (let col = 0; col < settings.columns; col++) {
          for (let plate = 0; plate < processed.plates.length; plate++) {
            const intensity = parseInt(processed.plates[plate].rows[row][col], 16) / 15;
            if (!intensity) continue;
            ctx.globalAlpha = intensity;
            ctx.fillStyle = processed.plates[plate].color;
            ctx.fillRect(col * cellW, row * cellH, Math.ceil(cellW), Math.ceil(cellH));
          }
        }
      }
      ctx.globalAlpha = 1;
      if (grid && Math.min(cellW, cellH) >= 4) {
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.18)';
        ctx.lineWidth = 1;
        for (let col = 0; col <= settings.columns; col++) {
          ctx.beginPath();
          ctx.moveTo(col * cellW, 0);
          ctx.lineTo(col * cellW, size);
          ctx.stroke();
        }
        for (let row = 0; row <= settings.rows; row++) {
          ctx.beginPath();
          ctx.moveTo(0, row * cellH);
          ctx.lineTo(size, row * cellH);
          ctx.stroke();
        }
      }
    }
    if (hoop) {
      const diameter = Math.min(size, (47 / settings.mm) * size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, diameter / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [grid, hoop, processed, settings, source, stitched]);

  return (
    <canvas
      ref={canvasRef}
      className="aspect-square w-full max-w-[520px] rounded-lg border border-foreground/10 shadow-sm"
    />
  );
}

export default function BitmapImportDialog({ source, programSource, onClose, onInsert }: Props) {
  const initialSource = source ?? {
    filename: 'bitmap',
    width: 1,
    height: 1,
    data: new Uint8ClampedArray(4),
  };
  const [section, setSection] = useState<Section>('region');
  const [settings, setSettings] = useState<BitmapSettings>(() => initialSettings(initialSource));
  const [prefix, setPrefix] = useState(() =>
    uniqueBitmapPrefix(initialSource.filename, programSource),
  );
  const [stitched, setStitched] = useState(true);
  const [grid, setGrid] = useState(true);
  const [hoop, setHoop] = useState(true);
  const [includeHelpers, setIncludeHelpers] = useState(
    () => !/\bdef\s+(?:bmpixel|bmsample)\b/.test(programSource),
  );

  const processed = useMemo(
    () => (source && settings ? processBitmap(source, settings) : null),
    [settings, source],
  );
  const helpersPresent = /\bdef\s+(?:bmpixel|bmsample)\b/.test(programSource);
  const emitted = useMemo(
    () =>
      source && settings && processed
        ? emitBitmapCode(processed, settings, {
            filename: source.filename,
            prefix: bitmapPrefix(prefix),
            source: programSource,
            includeHelpers,
          })
        : '',
    [includeHelpers, prefix, processed, programSource, settings, source],
  );

  if (!source || !processed) return null;
  const mmPerCell = settings.mm / Math.max(settings.columns, settings.rows);
  const update = (next: Partial<BitmapSettings>) =>
    setSettings((current) => ({ ...current!, ...next }));
  const setCrop = (next: Partial<BitmapSettings['crop']>) =>
    update({ crop: { ...settings.crop, ...next } });
  const setColumns = (columns: number) => {
    const safe = Math.min(96, Math.max(8, columns));
    update({
      columns: safe,
      rows: Math.min(
        96,
        Math.max(8, Math.round((safe * settings.crop.height) / settings.crop.width)),
      ),
    });
  };
  const setThreadCount = (count: number) => {
    const threads = Array.from(
      { length: count },
      (_, index) => settings.threads[index] ?? THREADS[index],
    );
    update({ threads });
  };
  const insert = () => {
    localStorage.setItem('ns-bitmap-import-pref', JSON.stringify({ ...settings, crop: undefined }));
    onInsert(
      emitted,
      `Inserted bitmap '${source.filename}' — ${settings.columns}×${settings.rows}, ${processed.plates.length} plate${processed.plates.length === 1 ? '' : 's'}, ~${processed.estimatedStitches.toLocaleString()} st (est.)`,
    );
  };
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[min(92vh,780px)] w-[min(1120px,96vw)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-foreground/10 px-5 py-4 pr-12">
          <DialogTitle className="font-mono text-[13px]">
            Import bitmap — {source.filename}
          </DialogTitle>
          <DialogDescription>
            Turn image pixels into editable NeedleScript data. Tune the sewn result before inserting
            it.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-foreground/10 px-4 pt-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Bitmap import sections">
            {IMPORT_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                onClick={() => setSection(id)}
                className={cn(
                  'rounded-t-md px-3 py-2 font-mono text-[11px] transition-colors',
                  section === id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="border-b border-foreground/10 p-5 lg:border-r lg:border-b-0">
            {section === 'region' && (
              <div className="grid gap-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Pan and size the crop with sliders. Each range updates to keep the selected area
                  inside the source image.
                </p>
                <div className="grid gap-3">
                  <RangeField
                    label="Horizontal position"
                    value={settings.crop.x}
                    min={0}
                    max={source.width - settings.crop.width}
                    onChange={(x) => setCrop({ x })}
                  />
                  <RangeField
                    label="Vertical position"
                    value={settings.crop.y}
                    min={0}
                    max={source.height - settings.crop.height}
                    onChange={(y) => setCrop({ y })}
                  />
                  <RangeField
                    label="Crop width"
                    value={settings.crop.width}
                    min={1}
                    max={source.width - settings.crop.x}
                    onChange={(width) => setCrop({ width })}
                  />
                  <RangeField
                    label="Crop height"
                    value={settings.crop.height}
                    min={1}
                    max={source.height - settings.crop.y}
                    onChange={(height) => setCrop({ height })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update({ crop: initialSettings(source).crop })}
                  >
                    Center square
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update({ crop: { x: 0, y: 0, width: source.width, height: source.height } })
                    }
                  >
                    Full image
                  </Button>
                </div>
                <CropPreview source={source} crop={settings.crop} />
              </div>
            )}

            {section === 'resolution' && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Cells wide"
                    value={settings.columns}
                    min={8}
                    max={96}
                    onChange={setColumns}
                  />
                  <NumberField
                    label="Cells high"
                    value={settings.rows}
                    min={8}
                    max={96}
                    onChange={(rows) => update({ rows })}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[24, 32, 48, 64, 96].map((size) => (
                    <Button
                      key={size}
                      variant={settings.columns === size ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setColumns(size)}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
                <NumberField
                  label="Printed size (mm)"
                  value={settings.mm}
                  min={10}
                  max={90}
                  onChange={(mm) => update({ mm })}
                />
                <p
                  className={cn(
                    'text-xs text-muted-foreground',
                    mmPerCell < 0.8 && 'text-amber-600',
                  )}
                >
                  {mmPerCell.toFixed(2)} mm per cell
                  {mmPerCell < 0.8 && ' — below ~0.8 mm/cell, line pitch limits detail.'}
                </p>
              </div>
            )}

            {section === 'colors' && (
              <div className="grid gap-4">
                <label className="grid gap-1 text-[11px] text-muted-foreground">
                  Mode
                  <select
                    value={settings.threads.length}
                    onChange={(event) => setThreadCount(Number(event.target.value))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  >
                    <option value={1}>Grayscale · one thread</option>
                    <option value={2}>Plates · two threads</option>
                    <option value={3}>Plates · three threads</option>
                    <option value={4}>Plates · four threads</option>
                  </select>
                </label>
                {settings.threads.map((thread, index) => (
                  <label key={index} className="flex items-center justify-between gap-3 text-xs">
                    Thread {index + 1}
                    <select
                      value={thread}
                      onChange={(event) =>
                        update({
                          threads: settings.threads.map((color, i) =>
                            i === index ? event.target.value : color,
                          ),
                        })
                      }
                      className="h-8 min-w-36 rounded-md border border-input bg-background px-2 font-mono text-xs"
                    >
                      {THREADS.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="flex items-center justify-between gap-3 text-xs">
                  Fabric
                  <input
                    aria-label="Fabric color"
                    type="color"
                    value={settings.fabric}
                    onChange={(event) => update({ fabric: event.target.value })}
                    className="h-8 w-12 cursor-pointer rounded border border-input bg-background p-1"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <Switch
                    checked={settings.invert}
                    onCheckedChange={(invert) => update({ invert })}
                  />{' '}
                  Invert coverage
                </label>
                {settings.threads.length > 1 && (
                  <p className="rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                    Plates overlap. Give each color its own hatch angle or spiral phase to avoid
                    density hotspots.
                  </p>
                )}
              </div>
            )}

            {section === 'tone' && (
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label className="text-xs">Tone steps: {settings.steps}</Label>
                  <Slider
                    value={[settings.steps]}
                    min={2}
                    max={16}
                    step={1}
                    onValueChange={(value) =>
                      update({ steps: Array.isArray(value) ? value[0] : value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={settings.dither}
                    onCheckedChange={(dither) => update({ dither })}
                  />{' '}
                  Ordered Bayer dither
                </label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Steps control the number of visible tones. Dither trades smooth gradients for a
                  deliberate stitched grain.
                </p>
              </div>
            )}

            {section === 'insert' && (
              <div className="grid gap-4">
                <label className="grid gap-1 text-[11px] text-muted-foreground">
                  Variable prefix
                  <input
                    value={prefix}
                    onChange={(event) => setPrefix(bitmapPrefix(event.target.value))}
                    className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={includeHelpers}
                    disabled={helpersPresent}
                    onCheckedChange={(checked: boolean) => setIncludeHelpers(checked)}
                  />{' '}
                  Include sampler helpers
                </label>
                {helpersPresent && (
                  <p className="text-xs text-muted-foreground">
                    bmpixel/bmsample already defined — reusing them.
                  </p>
                )}
                <pre className="max-h-52 overflow-auto rounded-md bg-muted p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {emitted}
                </pre>
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-col items-center justify-center gap-3 bg-muted/25 p-5">
            <BitmapPreview
              source={source}
              settings={settings}
              stitched={stitched}
              grid={grid}
              hoop={hoop}
            />
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <Switch checked={stitched} onCheckedChange={setStitched} /> Stitched preview
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={grid} onCheckedChange={(checked: boolean) => setGrid(checked)} />{' '}
                Grid
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={hoop} onCheckedChange={(checked: boolean) => setHoop(checked)} />{' '}
                47 mm hoop
              </label>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>
                {settings.columns}×{settings.rows} cells
              </span>
              <span>{mmPerCell.toFixed(2)} mm/cell</span>
              <span>~{processed.estimatedStitches.toLocaleString()} st</span>
              <span>~{((processed.sourceBytes + emitted.length) / 1024).toFixed(1)} KB source</span>
            </div>
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between p-4">
          <span className="text-[11px] text-muted-foreground">
            {BITMAP_HELPERS ? 'Data stays in your program; the original image is not stored.' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={insert}>
              Insert bitmap data
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
