import { useMemo, useState } from 'react';
import type { DesignState } from '@/App';
import type { StagedDocument } from '@/lib/engine';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface Props {
  doc: StagedDocument;
  design: DesignState;
  onSelect: (id: string) => void;
}

interface Finding {
  id: string;
  name: string;
  reason: string;
}

export default function ValidationSummary({ doc, design, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];
    for (const el of doc.elements) {
      if (el.flags.outsideHoop) out.push({ id: el.id, name: el.name, reason: 'outside hoop' });
      if (el.flags.degenerate) out.push({ id: el.id, name: el.name, reason: 'degenerate' });
      if (el.flags.unsupported) out.push({ id: el.id, name: el.name, reason: 'unsupported' });
      if (el.flags.selfIntersect)
        out.push({ id: el.id, name: el.name, reason: 'self-intersecting' });
    }
    return out;
  }, [doc.elements]);

  const peak = design.density?.peak ?? 0;
  const coverageVariant: 'secondary' | 'outline' | 'destructive' =
    peak >= 3 ? 'destructive' : peak >= 2 ? 'outline' : 'secondary';
  const coverageLabel =
    peak >= 3
      ? `dense · ${peak.toFixed(1)} layers`
      : peak >= 2
        ? `watch · ${peak.toFixed(1)}`
        : `ok · ${peak.toFixed(1)}`;

  return (
    <div className="relative flex flex-col gap-1">
      <button
        type="button"
        className="flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Badge variant={coverageVariant} className="text-[10px]">
          {coverageLabel}
        </Badge>
        {findings.length > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {findings.length} issue{findings.length === 1 ? '' : 's'}
          </Badge>
        )}
      </button>

      {open && findings.length > 0 && (
        <Alert className="absolute bottom-8 left-0 z-50 max-h-64 w-80 overflow-auto">
          <AlertTitle>Validation</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-1">
              {findings.map((f, i) => (
                <Button
                  key={`${f.id}-${i}`}
                  variant="ghost"
                  size="sm"
                  className="h-6 justify-start text-[11px]"
                  onClick={() => {
                    onSelect(f.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono">{f.name}</span> — {f.reason}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
