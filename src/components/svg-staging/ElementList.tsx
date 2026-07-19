import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';
import type { ElementModel, StagedDocument, StrategyKind } from '@/lib/engine';
import { STRATEGIES, STRATEGY_ORDER, eligibleStrategies } from '@/lib/engine';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils';
import {
  reorderElements,
  setElementStrategy,
  setInclude,
  renameElement,
  remapElementThread,
  remapSourceColor,
  canCreateMotifAlong,
  canCreateRailPair,
  createMotifAlong,
  createRailPair,
} from './staging-actions';

interface Props {
  doc: StagedDocument;
  selectedIds: Set<string>;
  focusedId: string | null;
  filter: string;
  onFilterChange: (v: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  update: (fn: (doc: StagedDocument) => StagedDocument) => void;
}

function flagLabel(el: ElementModel): string | null {
  const f = el.flags;
  if (f.unsupported) return 'unsupported';
  if (f.outsideHoop) return 'outside hoop';
  if (f.degenerate) return 'degenerate';
  if (f.densityHot) return 'dense';
  if (f.selfIntersect) return 'self-intersect';
  return null;
}

function ThreadDot({
  doc,
  el,
  update,
}: {
  doc: StagedDocument;
  el: ElementModel;
  update: Props['update'];
}) {
  const gradientStops = el.sourceGradient?.stops ?? [];
  const background = gradientStops.length
    ? `linear-gradient(90deg, ${gradientStops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})`
    : (doc.palette[el.threadIndex] ?? '#000');
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="thread colour"
            className="h-4 w-4 rounded-full border border-foreground/20"
            style={{ background }}
          />
        }
      />
      <PopoverContent className="w-auto p-2">
        <div className="flex flex-col gap-2">
          {(gradientStops.length ? gradientStops : [{ offset: 0, color: null }]).map(
            (stop, stopIndex) => (
              <div key={`${stop.color}-${stopIndex}`} className="flex items-center gap-2">
                {stop.color && (
                  <span
                    className="h-4 w-4 rounded-full border border-foreground/20"
                    style={{ background: stop.color }}
                  />
                )}
                <div className="grid grid-cols-8 gap-1">
                  {doc.palette.map((hex, i) => {
                    const selected = stop.color
                      ? doc.threadMap[stop.color] === i
                      : el.threadIndex === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={
                          stop.color
                            ? `map gradient stop ${stopIndex} to thread ${i}`
                            : `thread ${i}`
                        }
                        onClick={() =>
                          update((d) =>
                            stop.color
                              ? remapSourceColor(d, stop.color, i)
                              : remapElementThread(d, el.id, i),
                          )
                        }
                        className={cn(
                          'h-5 w-5 rounded-full border',
                          selected
                            ? 'border-foreground ring-1 ring-foreground'
                            : 'border-foreground/20',
                        )}
                        style={{ background: hex }}
                      />
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StrategyCell({ el, update }: { el: ElementModel; update: Props['update'] }) {
  const eligible = new Set(eligibleStrategies(el.geomType, el.role, el.sourceGradient !== null));
  const order = el.role === 'relation' ? [el.strategy.kind] : STRATEGY_ORDER;
  return (
    <Select
      value={el.strategy.kind}
      onValueChange={(v: string | null) =>
        v && update((d) => setElementStrategy(d, new Set([el.id]), v as StrategyKind))
      }
    >
      <SelectTrigger className="h-7 text-[11px] w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {order.map((k) => (
          <SelectItem key={k} value={k} disabled={!eligible.has(k)}>
            {STRATEGIES[k].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ElementRow({
  el,
  doc,
  selected,
  focused,
  onSelect,
  update,
}: {
  el: ElementModel;
  doc: StagedDocument;
  selected: boolean;
  focused: boolean;
  onSelect: Props['onSelect'];
  update: Props['update'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: el.id,
  });
  const [editing, setEditing] = useState(false);
  const flag = flagLabel(el);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 px-2 py-1 border-b border-foreground/5 text-[12px]',
        selected && 'bg-primary/10',
        focused && 'ring-1 ring-inset ring-primary/40',
        isDragging && 'opacity-70',
      )}
      onClick={(e) => onSelect(el.id, e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground touch-none"
        aria-label="drag to reorder"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} />
      </button>
      <Checkbox
        checked={el.include}
        onCheckedChange={(c: boolean) => update((d) => setInclude(d, el.id, c))}
        onClick={(e) => e.stopPropagation()}
        aria-label="include"
      />
      <div
        className={cn(
          'flex flex-1 items-center gap-2 overflow-hidden',
          !el.include && 'opacity-40',
        )}
      >
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-[2px] border border-foreground/15"
          style={{
            background: el.sourceGradient
              ? `linear-gradient(90deg, ${el.sourceGradient.stops
                  .map((stop) => `${stop.color} ${stop.offset * 100}%`)
                  .join(', ')})`
              : (doc.palette[el.threadIndex] ?? '#000'),
          }}
        />
        {editing ? (
          <Input
            autoFocus
            defaultValue={el.name}
            className="h-6 flex-1 text-[12px]"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              update((d) => renameElement(d, el.id, e.target.value || el.name));
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span
            className="flex-1 truncate font-mono"
            title={el.name}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {el.name}
          </span>
        )}
        <Badge variant={flag ? 'destructive' : 'secondary'} className="text-[9px] px-1">
          {flag ?? (el.role === 'relation' ? 'relationship' : el.geomType)}
        </Badge>
        <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
          {el.role === 'relation' ? '—' : el.areaMm2.toFixed(0)}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <ThreadDot doc={doc} el={el} update={update} />
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StrategyCell el={el} update={update} />
        </div>
      </div>
    </div>
  );
}

export default function ElementList({
  doc,
  selectedIds,
  focusedId,
  filter,
  onFilterChange,
  onSelect,
  onSelectMany,
  update,
}: Props) {
  const ordered = useMemo(
    () => doc.operations.slice().sort((a, b) => a.order - b.order),
    [doc.operations],
  );
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (e) => e.name.toLowerCase().includes(q) || e.geomType.toLowerCase().includes(q),
    );
  }, [ordered, filter]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      update((d) => reorderElements(d, String(active.id), String(over.id)));
    }
  };

  const applyToSelection = (kind: StrategyKind) =>
    update((d) => setElementStrategy(d, selectedIds, kind));
  const selectedInOrder = Array.from(selectedIds);
  const operationById = new Map(doc.operations.map((operation) => [operation.id, operation]));
  const applicableStrategies = new Set(STRATEGY_ORDER);
  for (const id of selectedInOrder) {
    const operation = operationById.get(id);
    if (!operation) {
      applicableStrategies.clear();
      break;
    }
    const eligible = new Set(
      eligibleStrategies(operation.geomType, operation.role, operation.sourceGradient !== null),
    );
    for (const kind of applicableStrategies) {
      if (!eligible.has(kind)) applicableStrategies.delete(kind);
    }
  }
  const railPairReady = canCreateRailPair(doc, selectedInOrder);
  const motifAlongReady = canCreateMotifAlong(doc, selectedInOrder);

  return (
    <div className="flex h-full flex-col">
      {/* sub-toolbar */}
      <div className="flex flex-col gap-2 border-b border-foreground/10 p-2">
        <Input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter by name / type…"
          className="h-7 text-[12px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}
            >
              Select…
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onSelectMany(visible.map((e) => e.id))}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSelectMany(visible.filter((e) => e.sourceFill).map((e) => e.id))}
              >
                All fills
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onSelectMany(
                    visible.filter((e) => !e.sourceFill && e.sourceStroke).map((e) => e.id),
                  )
                }
              >
                All strokes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSelectMany([])}>None</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}
              disabled={selectedIds.size === 0}
            >
              Apply strategy
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {STRATEGY_ORDER.map((k) => (
                <DropdownMenuItem
                  key={k}
                  disabled={!applicableStrategies.has(k)}
                  onClick={() => applyToSelection(k)}
                >
                  {STRATEGIES[k].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="h-7 text-[11px]" />}
              disabled={selectedIds.size !== 2}
            >
              Create relationship
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={!railPairReady}
                onClick={() => update((d) => createRailPair(d, selectedInOrder))}
              >
                Pair as satin rails
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!motifAlongReady}
                onClick={() => update((d) => createMotifAlong(d, selectedInOrder))}
              >
                Repeat second as motif along first
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {selectedIds.size} selected
          </span>
        </div>
      </div>

      {/* rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const el = visible[vi.index];
                return (
                  <div
                    key={el.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <ElementRow
                      el={el}
                      doc={doc}
                      selected={selectedIds.has(el.id)}
                      focused={focusedId === el.id}
                      onSelect={onSelect}
                      update={update}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
