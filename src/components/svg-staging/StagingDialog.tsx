import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { XIcon } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { HoopConfig } from '@/data';
import type { StagedDocument, StrategyKind } from '@/lib/engine';
import { STRATEGY_ORDER } from '@/lib/engine';
import { useStagedDesign } from './useStagedDesign';
import ElementList from './ElementList';
import PreviewPane from './PreviewPane';
import Inspector from './Inspector';
import GlobalToolbar from './GlobalToolbar';
import ValidationSummary from './ValidationSummary';
import { setElementStrategy, setInclude } from './staging-actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDoc: StagedDocument;
  baseSource: string;
  hoop: HoopConfig;
  onCommit: (source: string) => void;
}

export default function StagingDialog({
  open,
  onOpenChange,
  initialDoc,
  baseSource,
  hoop,
  onCommit,
}: Props) {
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const { doc, update, design, compiling, error, ready, emitCode } = useStagedDesign(
    initialDoc,
    baseSource,
    mode,
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showDensity, setShowDensity] = useState(false);
  const [showSkipped, setShowSkipped] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [hideJumps, setHideJumps] = useState(true);

  const ordered = useMemo(
    () => doc.operations.slice().sort((a, b) => a.order - b.order),
    [doc.operations],
  );
  const hasIncludedOperation = doc.operations.some(
    (operation) => operation.include && operation.strategy.kind !== 'skip',
  );
  const hasBlockingFinding =
    doc.sourceObjects.some((sourceObject) =>
      sourceObject.findings.some((finding) => finding.severity === 'error'),
    ) ||
    doc.operations.some(
      (operation) =>
        operation.include && operation.findings.some((finding) => finding.severity === 'error'),
    );
  const canCommit =
    ready &&
    design.ok &&
    !compiling &&
    error === null &&
    hasIncludedOperation &&
    !hasBlockingFinding;

  const select = useCallback((id: string, additive: boolean) => {
    setFocusedId(id);
    setSelectedIds((prev) => {
      if (!additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
    setFocusedId(ids[0] ?? null);
  }, []);

  const pickElement = useCallback((id: string | null) => {
    if (id) {
      setSelectedIds(new Set([id]));
      setFocusedId(id);
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const commit = useCallback(() => {
    if (!canCommit) return;
    onCommit(emitCode());
    onOpenChange(false);
  }, [canCommit, emitCode, onCommit, onOpenChange]);

  // keyboard shortcuts (spec §15)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        commit();
        return;
      }
      if (typing) return;
      const idx = focusedId ? ordered.findIndex((el) => el.id === focusedId) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = ordered[Math.min(ordered.length - 1, idx + 1)];
        if (next) select(next.id, false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = ordered[Math.max(0, idx - 1)];
        if (prev) select(prev.id, false);
      } else if (e.key === ' ' && focusedId) {
        e.preventDefault();
        const el = doc.operations.find((x) => x.id === focusedId);
        if (el) update((d) => setInclude(d, focusedId, !el.include));
      } else if (/^[1-7]$/.test(e.key) && selectedIds.size > 0) {
        const kind: StrategyKind = STRATEGY_ORDER[Number(e.key) - 1];
        update((d) => setElementStrategy(d, selectedIds, kind));
      }
    },
    [commit, doc.operations, focusedId, ordered, select, selectedIds, update],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[95vh] w-[95vw] max-w-[95vw] flex-col gap-0 p-0"
        showCloseButton={false}
        onKeyDown={onKeyDown}
      >
        <DialogHeader className="flex flex-row items-center gap-4 border-b border-foreground/10 p-3 pr-2">
          <DialogTitle className="shrink-0 font-mono text-[13px]">
            SVG import — {doc.name}.svg
          </DialogTitle>
          <GlobalToolbar doc={doc} mode={mode} update={update} />
          {compiling && <span className="ml-2 text-muted-foreground">compiling…</span>}
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={35} minSize={20}>
            <ElementList
              doc={doc}
              selectedIds={selectedIds}
              focusedId={focusedId}
              filter={filter}
              onFilterChange={setFilter}
              onSelect={select}
              onSelectMany={selectMany}
              update={update}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={47} minSize={30}>
            <PreviewPane
              doc={doc}
              design={design}
              hoop={hoop}
              selectedIds={selectedIds}
              showDensity={showDensity}
              showSkipped={showSkipped}
              showOverlay={showOverlay}
              hideJumps={hideJumps}
              onToggleDensity={() => setShowDensity((v) => !v)}
              onToggleSkipped={() => setShowSkipped((v) => !v)}
              onToggleOverlay={() => setShowOverlay((v) => !v)}
              onToggleJumps={() => setHideJumps((v) => !v)}
              onPickElement={pickElement}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={18} minSize={12}>
            <div className="h-full overflow-auto">
              <Inspector doc={doc} selectedIds={selectedIds} reporters={[]} update={update} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <DialogFooter className="mx-0 mb-0 flex flex-row items-center justify-between gap-4 border-t border-foreground/10 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <ValidationSummary doc={doc} design={design} onSelect={(id) => pickElement(id)} />
            {error && (
              <span className="max-w-[40vw] truncate text-[11px] text-destructive" title={error}>
                Preview failed: {error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox
                checked={mode === 'append'}
                onCheckedChange={(checked) => setMode(checked ? 'append' : 'replace')}
                aria-label="append to current program"
              />
              <Label className="text-[11px]">Append to current program</Label>
            </label>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commit} disabled={!canCommit}>
              Insert as code
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
