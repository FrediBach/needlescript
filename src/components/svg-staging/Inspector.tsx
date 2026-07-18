import { useMemo } from 'react';
import type { ElementModel, StagedDocument, Strategy, StrategyKind } from '@/lib/engine';
import { STRATEGIES, STRATEGY_ORDER, eligibleStrategies, type ParamControl } from '@/lib/engine';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  setElementStrategy,
  setElementParams,
  setParamsForSelection,
  setHole,
} from './staging-actions';
import { computeHoleMap, netFillArea } from '@/lib/engine';

interface Props {
  doc: StagedDocument;
  selectedIds: Set<string>;
  reporters: string[];
  update: (fn: (doc: StagedDocument) => StagedDocument) => void;
}

function paramsOf(strategy: Strategy): Record<string, unknown> {
  return strategy.kind === 'skip'
    ? {}
    : ((strategy as Extract<Strategy, { params: object }>).params as unknown as Record<
        string,
        unknown
      >);
}

function ControlRow({
  control,
  value,
  reporters,
  onChange,
}: {
  control: ParamControl;
  value: unknown;
  reporters: string[];
  onChange: (key: string, value: unknown) => void;
}) {
  const label = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground cursor-help" />
        }
      >
        {control.label}
      </TooltipTrigger>
      <TooltipContent>{control.tooltip}</TooltipContent>
    </Tooltip>
  );

  if (control.kind === 'slider') {
    const v = typeof value === 'number' ? value : control.min;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          {label}
          <span className="font-mono text-[11px] tabular-nums text-foreground">
            {v}
            {control.unit ? ` ${control.unit}` : ''}
          </span>
        </div>
        <Slider
          min={control.min}
          max={control.max}
          step={control.step}
          value={[v]}
          onValueChange={(vals) => {
            const raw = Array.isArray(vals) ? vals[0] : (vals as number);
            onChange(control.key, raw);
          }}
          aria-label={control.label}
        />
      </div>
    );
  }

  if (control.kind === 'switch') {
    return (
      <div className="flex items-center justify-between">
        {label}
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(c) => onChange(control.key, c)}
          aria-label={control.label}
        />
      </div>
    );
  }

  // select — directional field gets dynamic options
  let options = control.options;
  if (control.key === 'field') {
    options = [
      { value: '', label: 'insert scaffold' },
      ...reporters.map((r) => ({ value: r, label: `@${r}` })),
    ];
  }
  const current = control.key === 'field' ? ((value as string | null) ?? '') : String(value ?? '');
  return (
    <div className="flex flex-col gap-1">
      {label}
      <Select
        value={current}
        onValueChange={(val: string | null) =>
          onChange(control.key, control.key === 'field' ? val || null : val)
        }
      >
        <SelectTrigger className="h-8 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function HolePanel({ el, update }: { el: ElementModel; update: Props['update'] }) {
  if (el.rings.length < 2) return null;
  return (
    <Accordion>
      <AccordionItem value="holes">
        <AccordionTrigger className="text-[12px]">Holes ({el.rings.length} rings)</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2">
            {el.rings.map((_, i) => {
              const h = el.holeMap[i];
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ring {i} · depth {h?.depth ?? 0} · {h?.orientation ?? 'ccw'}
                  </span>
                  <ToggleGroup
                    value={[h?.hole ? 'hole' : 'solid']}
                    onValueChange={(vals: string[]) => {
                      const v = vals[0];
                      if (v) update((d) => setHole(d, el.id, i, v === 'hole'));
                    }}
                  >
                    <ToggleGroupItem value="solid" className="h-7 px-2 text-[11px]">
                      Solid
                    </ToggleGroupItem>
                    <ToggleGroupItem value="hole" className="h-7 px-2 text-[11px]">
                      Hole
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-[11px]"
              onClick={() =>
                update((d) => ({
                  ...d,
                  operations: d.operations.map((e) => {
                    if (e.id !== el.id) return e;
                    const holeMap = computeHoleMap(e.rings, e.fillRule);
                    return { ...e, holeMap, areaMm2: netFillArea(e.rings, holeMap) };
                  }),
                }))
              }
            >
              Reset to winding rule
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function StrategySelect({
  geomType,
  role,
  value,
  hasGradient,
  onChange,
}: {
  geomType: ElementModel['geomType'];
  role: ElementModel['role'];
  value: StrategyKind;
  hasGradient: boolean;
  onChange: (k: StrategyKind) => void;
}) {
  const eligible = new Set(eligibleStrategies(geomType, role, hasGradient));
  const order = role === 'relation' ? [value] : STRATEGY_ORDER;
  return (
    <Select value={value} onValueChange={(v: string | null) => v && onChange(v as StrategyKind)}>
      <SelectTrigger className="h-8 text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {order.map((k) => (
          <SelectItem key={k} value={k} disabled={!eligible.has(k)}>
            {STRATEGIES[k].label}
            {!eligible.has(k) ? ' — n/a' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Inspector({ doc, selectedIds, reporters, update }: Props) {
  const selected = useMemo(
    () => doc.operations.filter((operation) => selectedIds.has(operation.id)),
    [doc.operations, selectedIds],
  );

  // Nothing selected → document defaults hint.
  if (selected.length === 0) {
    return (
      <div className="p-3 text-[12px] text-muted-foreground">
        Select an element to edit its stitch strategy. Document defaults: fabric{' '}
        <span className="font-mono">{doc.fabric}</span>, geometry tolerance{' '}
        <span className="font-mono">{doc.geometryToleranceMM} mm</span>.
      </div>
    );
  }

  // Multiple selected.
  if (selected.length > 1) {
    const kinds = new Set(selected.map((e) => e.strategy.kind));
    if (kinds.size > 1) {
      return (
        <div className="p-3 flex flex-col gap-3">
          <Alert>
            <AlertTitle>Editing {selected.length} elements</AlertTitle>
            <AlertDescription>Assign a single strategy to edit parameters.</AlertDescription>
          </Alert>
          <StrategySelect
            geomType={selected[0].geomType}
            role={selected[0].role}
            value={selected[0].strategy.kind}
            hasGradient={selected.every((operation) => operation.sourceGradient !== null)}
            onChange={(k) => update((d) => setElementStrategy(d, selectedIds, k))}
          />
        </div>
      );
    }
    const kind = [...kinds][0];
    const def = STRATEGIES[kind];
    const shared = paramsOf(selected[0].strategy);
    return (
      <div className="p-3 flex flex-col gap-3">
        <Alert>
          <AlertTitle>Editing {selected.length} elements</AlertTitle>
          <AlertDescription>Changes apply to all of them.</AlertDescription>
        </Alert>
        <StrategySelect
          geomType={selected[0].geomType}
          role={selected[0].role}
          value={kind}
          hasGradient={selected.every((operation) => operation.sourceGradient !== null)}
          onChange={(k) => update((d) => setElementStrategy(d, selectedIds, k))}
        />
        <div className="flex flex-col gap-3">
          {def.controls.map((c) => (
            <ControlRow
              key={c.key}
              control={c}
              value={shared[c.key]}
              reporters={reporters}
              onChange={(key, value) =>
                update((d) => setParamsForSelection(d, selectedIds, { [key]: value }))
              }
            />
          ))}
        </div>
      </div>
    );
  }

  // Single selection.
  const el = selected[0];
  const def = STRATEGIES[el.strategy.kind];
  const params = paramsOf(el.strategy);
  return (
    <div className="p-3 flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-[13px] font-mono">{el.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <StrategySelect
            geomType={el.geomType}
            role={el.role}
            value={el.strategy.kind}
            hasGradient={el.sourceGradient !== null}
            onChange={(k) => update((d) => setElementStrategy(d, new Set([el.id]), k))}
          />
          {def.controls.map((c) => (
            <ControlRow
              key={c.key}
              control={c}
              value={params[c.key]}
              reporters={reporters}
              onChange={(key, value) => update((d) => setElementParams(d, el.id, { [key]: value }))}
            />
          ))}
          <HolePanel el={el} update={update} />
        </CardContent>
      </Card>
    </div>
  );
}
