import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  CpuIcon,
  FileCode2Icon,
  LocateFixedIcon,
  ReplaceAllIcon,
  ScissorsIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { MACHINES } from '../data.ts';
import type { MachineHoop, MachinePreset } from '../data.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { cn } from '@/utils.ts';

const MACHINE_CLASSES = ['home', 'multi-needle', 'commercial'] as const;

export interface ActiveMachine {
  id: string;
  hoopId: string;
  budgetMode: boolean;
}

export interface EditorContextActions {
  cut: () => void;
  copy: () => void;
  paste: () => void;
  goToDefinition: () => void;
  changeAll: () => void;
  formatDocument: () => void;
  explainWithAi?: () => void;
}

interface Actions {
  active: ActiveMachine | null;
  budgetMode: boolean;
  onApply: (machine: MachinePreset, hoop: MachineHoop) => void;
  onFabric: (fabric: string) => void;
  onBudgetModeChange: (enabled: boolean) => void;
  onRemove: () => void;
}

function MachineItems({
  active,
  budgetMode,
  onApply,
  onFabric,
  onBudgetModeChange,
  onRemove,
}: Actions) {
  return (
    <>
      {MACHINE_CLASSES.map((cls) => {
        const machines = MACHINES.filter((machine) => machine.cls === cls);
        if (!machines.length) return null;
        return (
          <div key={cls}>
            <div className="px-2 pt-1.5 pb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {cls === 'multi-needle' ? 'Multi-needle' : cls}
            </div>
            {machines.map((machine) => (
              <DropdownMenuSub key={machine.id}>
                <DropdownMenuSubTrigger>
                  {active?.id === machine.id && <CheckIcon className="size-3.5 text-gold" />}
                  {machine.brand} {machine.model}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56 font-mono text-ui">
                  {machine.hoops.map((hoop) => (
                    <DropdownMenuItem key={hoop.id} onClick={() => onApply(machine, hoop)}>
                      {active?.id === machine.id && active.hoopId === hoop.id ? (
                        <CheckIcon className="size-3.5 text-gold" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      {hoop.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </div>
        );
      })}
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Fabric</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="font-mono text-ui">
          {['woven', 'knit', 'stretch', 'denim', 'fleece'].map((fabric) => (
            <DropdownMenuItem key={fabric} onClick={() => onFabric(fabric)}>
              {fabric}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onClick={() => onBudgetModeChange(!budgetMode)}>
        <span
          className={cn(
            'inline-flex size-3.5 items-center justify-center rounded border',
            budgetMode && 'border-gold bg-gold text-black',
          )}
        >
          {budgetMode && <CheckIcon className="size-3" />}
        </span>
        Budget mode
      </DropdownMenuItem>
      {active && (
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2Icon className="size-3.5" />
          Remove machine block
        </DropdownMenuItem>
      )}
    </>
  );
}

export function MachineMenu(props: Actions) {
  const chip = props.active
    ? `${MACHINES.find((machine) => machine.id === props.active?.id)?.model ?? props.active.id} · ${props.active.hoopId === 'keep' ? 'custom hoop' : props.active.hoopId}`
    : 'Machine';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="h-[30px] px-2.5 rounded-[6px] border inline-flex items-center gap-1.5 font-mono text-ui cursor-pointer bg-warm-btn border-warm-btn-edge text-gold hover:bg-warm-btn-hi hover:border-warm-btn-edge-hi hover:text-gold-light">
        <CpuIcon className="size-3.5 opacity-65" />
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 max-h-[min(500px,var(--available-height))] font-mono text-ui overflow-y-auto">
        <MachineItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A compact context menu that drills down by brand, then machine and hoop. */
export function MachineContextMenu({
  x,
  y,
  onClose,
  ...props
}: Actions & { x: number; y: number; onClose: () => void; editorActions?: EditorContextActions }) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const selectedMachine = MACHINES.find((machine) => machine.id === selectedMachineId) ?? null;
  const brands = [...new Set(MACHINES.map((machine) => machine.brand))];
  const brandedMachines = selectedBrand
    ? MACHINES.filter((machine) => machine.brand === selectedBrand)
    : [];

  return (
    <div
      role="menu"
      aria-label={props.editorActions ? 'Editor and machine settings' : 'Machine settings'}
      className="fixed z-60 max-h-[calc(100vh-16px)] min-w-56 overflow-y-auto rounded-lg bg-popover p-1 font-mono text-ui shadow-lg ring-1 ring-foreground/10"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.editorActions && (
        <>
          {(
            [
              ['Cut', ScissorsIcon, props.editorActions.cut],
              ['Copy', CopyIcon, props.editorActions.copy],
              ['Paste', ClipboardIcon, props.editorActions.paste],
              ['Go to Definition', LocateFixedIcon, props.editorActions.goToDefinition],
              ['Change All Occurrences', ReplaceAllIcon, props.editorActions.changeAll],
              ['Format Document', FileCode2Icon, props.editorActions.formatDocument],
            ] as const
          ).map(([label, Icon, action]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => {
                action();
                onClose();
              }}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
          {props.editorActions.explainWithAi && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => {
                props.editorActions?.explainWithAi?.();
                onClose();
              }}
            >
              <SparklesIcon className="size-3.5" />
              Explain with AI
            </button>
          )}
          <div className="my-1 border-t border-border" />
        </>
      )}
      <div className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Machine presets
      </div>
      {selectedMachine ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
            onClick={() => setSelectedMachineId(null)}
          >
            <ChevronLeftIcon className="size-3.5" />
            {selectedBrand}
          </button>
          <div className="px-2 py-1 text-muted-foreground">
            {selectedMachine.brand} {selectedMachine.model}
          </div>
          {selectedMachine.hoops.map((hoop) => (
            <button
              key={hoop.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => {
                props.onApply(selectedMachine, hoop);
                onClose();
              }}
            >
              {props.active?.id === selectedMachine.id && props.active.hoopId === hoop.id ? (
                <CheckIcon className="size-3.5 text-gold" />
              ) : (
                <span className="w-3.5" />
              )}
              {hoop.label}
            </button>
          ))}
        </>
      ) : selectedBrand ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
            onClick={() => setSelectedBrand(null)}
          >
            <ChevronLeftIcon className="size-3.5" />
            All brands
          </button>
          <div className="px-2 py-1 text-muted-foreground">{selectedBrand}</div>
          {brandedMachines.map((machine) => (
            <button
              key={machine.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => setSelectedMachineId(machine.id)}
            >
              {props.active?.id === machine.id ? (
                <CheckIcon className="size-3.5 text-gold" />
              ) : (
                <span className="w-3.5" />
              )}
              {machine.model}
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                {machine.hoops.length} hoops
                <ChevronRightIcon className="size-3" />
              </span>
            </button>
          ))}
        </>
      ) : (
        brands.map((brand) => {
          const machines = MACHINES.filter((machine) => machine.brand === brand);
          const hasActiveMachine = machines.some((machine) => machine.id === props.active?.id);
          return (
            <button
              key={brand}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => setSelectedBrand(brand)}
            >
              {hasActiveMachine ? (
                <CheckIcon className="size-3.5 text-gold" />
              ) : (
                <span className="w-3.5" />
              )}
              {brand}
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                {machines.length} {machines.length === 1 ? 'machine' : 'machines'}
                <ChevronRightIcon className="size-3" />
              </span>
            </button>
          );
        })
      )}
      <div className="my-1 border-t border-border" />
      <div className="flex flex-wrap gap-1 px-2 py-1">
        {['woven', 'knit', 'stretch', 'denim', 'fleece'].map((fabric) => (
          <button
            type="button"
            key={fabric}
            className="rounded bg-muted px-1.5 py-0.5 hover:bg-accent"
            onClick={() => {
              props.onFabric(fabric);
              onClose();
            }}
          >
            {fabric}
          </button>
        ))}
      </div>
    </div>
  );
}
