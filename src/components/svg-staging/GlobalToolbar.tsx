import type { Fabric, SewOrderKey, StagedDocument } from '@/lib/engine';
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
import { setGlobal, autoOrder, remapSourceColor, setScale } from './staging-actions';

const FABRICS: Fabric[] = ['woven', 'knit', 'stretch', 'denim', 'canvas', 'fleece'];

interface Props {
  doc: StagedDocument;
  update: (fn: (doc: StagedDocument) => StagedDocument) => void;
}

export default function GlobalToolbar({ doc, update }: Props) {
  const sources = Object.keys(doc.threadMap);

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      {/* fabric */}
      <label className="flex items-center gap-1">
        <span className="uppercase tracking-[0.1em] text-muted-foreground">fabric</span>
        <Select
          value={doc.fabric}
          onValueChange={(v: string | null) =>
            v && update((d) => setGlobal(d, { fabric: v as Fabric }))
          }
        >
          <SelectTrigger className="h-7 w-[100px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FABRICS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
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

      {/* resample */}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}>
          resample {doc.resampleMM.toFixed(2)} mm
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Resample spacing
          </Label>
          <Slider
            className="mt-2"
            min={0.5}
            max={6}
            step={0.1}
            value={[doc.resampleMM]}
            onValueChange={(vals) => {
              const raw = Array.isArray(vals) ? vals[0] : (vals as number);
              update((d) => setGlobal(d, { resampleMM: raw }));
            }}
          />
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
