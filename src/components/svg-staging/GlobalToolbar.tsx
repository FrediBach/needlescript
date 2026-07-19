import type {
  Fabric,
  SewOrderKey,
  StagedDocument,
  SvgPlanMode,
  ThreadProfileMode,
} from '@/lib/engine';
import { FABRIC_MODES, PLAN_MODES, THREAD_PROFILE_MODES } from '@/lib/engine';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  setGlobal,
  autoOrder,
  remapSourceColor,
  setGeometryTolerance,
  setScale,
} from './staging-actions';

interface Props {
  doc: StagedDocument;
  mode: 'replace' | 'append';
  update: (fn: (doc: StagedDocument) => StagedDocument) => void;
}

export default function GlobalToolbar({ doc, mode, update }: Props) {
  const sources = Object.keys(doc.threadMap);

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      {/* fabric */}
      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">fabric</span>
        <Select
          value={doc.fabric}
          disabled={mode === 'append'}
          onValueChange={(v: string | null) =>
            v && update((d) => setGlobal(d, { fabric: v as Fabric }))
          }
        >
          <SelectTrigger className="h-7 w-[100px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FABRIC_MODES.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">thread</span>
        <Select
          value={doc.threadProfile}
          disabled={mode === 'append'}
          onValueChange={(value: string | null) =>
            value &&
            update((current) => setGlobal(current, { threadProfile: value as ThreadProfileMode }))
          }
        >
          <SelectTrigger className="h-7 w-[145px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THREAD_PROFILE_MODES.map((profile) => (
              <SelectItem key={profile} value={profile}>
                {profile}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">plan</span>
        <Select
          value={doc.planMode}
          disabled={mode === 'append'}
          onValueChange={(value: string | null) =>
            value && update((current) => setGlobal(current, { planMode: value as SvgPlanMode }))
          }
        >
          <SelectTrigger className="h-7 w-[135px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_MODES.map((plan) => (
              <SelectItem key={plan} value={plan}>
                {plan}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {/* order by */}
      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">order</span>
        <Select
          value={doc.sewOrderKey}
          onValueChange={(v: string | null) => v && update((d) => autoOrder(d, v as SewOrderKey))}
        >
          <SelectTrigger className="h-7 w-[110px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="depth">Depth (area)</SelectItem>
            <SelectItem value="color">Colour</SelectItem>
            <SelectItem value="svg">SVG order</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-2">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">keep groups</span>
        <Switch
          checked={doc.keepGroups}
          onCheckedChange={(c) => update((d) => setGlobal(d, { keepGroups: c }))}
          aria-label="keep groups together"
        />
      </label>

      <label
        className="flex items-center gap-2"
        title="Keep SVG path curves as draggable NeedleScript specs"
      >
        <span className="uppercase tracking-[0.1em] text-muted-foreground">editable curves</span>
        <Switch
          checked={doc.editableCurves ?? false}
          onCheckedChange={(checked) =>
            update((current) => setGlobal(current, { editableCurves: checked }))
          }
          aria-label="import curves as editable specs"
        />
      </label>

      {/* logical geometry detail */}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}>
          detail {doc.geometryToleranceMM.toFixed(2)} mm
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Geometry tolerance
          </Label>
          <Slider
            className="mt-2"
            min={0.05}
            max={2.2}
            step={0.05}
            value={[doc.geometryToleranceMM]}
            onValueChange={(vals) => {
              const raw = Array.isArray(vals) ? vals[0] : (vals as number);
              update((d) => setGeometryTolerance(d, raw));
            }}
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Boundary detail only; stitch spacing stays recipe-specific.
          </p>
        </PopoverContent>
      </Popover>

      {/* scale */}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}>
          scale {doc.scaleFactor.toFixed(2)}×
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Import scale
          </Label>
          <Slider
            className="mt-2"
            min={0.1}
            max={5}
            step={0.05}
            value={[doc.scaleFactor]}
            onValueChange={(vals) => {
              const raw = Array.isArray(vals) ? vals[0] : (vals as number);
              update((d) => setScale(d, raw));
            }}
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            1× = fitted size · adjust if SVG dimensions are wrong
          </p>
        </PopoverContent>
      </Popover>

      {/* seed */}
      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">seed</span>
        <Input
          type="number"
          value={doc.seed}
          disabled={mode === 'append'}
          onChange={(e) => update((d) => setGlobal(d, { seed: Number(e.target.value) || 0 }))}
          className="h-7 w-16 text-[11px]"
          aria-label="seed"
        />
      </label>

      {/* thread mapping */}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}>
          Threads
        </PopoverTrigger>
        <PopoverContent className="w-[320px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">source</TableHead>
                <TableHead className="text-[10px]">thread</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((src) => (
                <TableRow key={src}>
                  <TableCell>
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-foreground/20 align-middle"
                      style={{ background: src }}
                    />
                    <span className="ml-2 font-mono text-[11px]">{src}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {doc.palette.map((hex, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`map ${src} to thread ${i}`}
                          onClick={() => update((d) => remapSourceColor(d, src, i))}
                          className="h-4 w-4 rounded-full border"
                          style={{
                            background: hex,
                            outline:
                              doc.threadMap[src] === i ? '2px solid var(--foreground)' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PopoverContent>
      </Popover>
    </div>
  );
}
