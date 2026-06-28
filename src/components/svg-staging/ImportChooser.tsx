import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Props {
  pending: { text: string; filename: string } | null;
  onChoose: (mode: 'quick' | 'options', remember: boolean) => void;
  onCancel: () => void;
}

/**
 * Shown on drag-and-drop so a stray drop never silently rewrites the program.
 * The "don't ask again" switch pins a preference in localStorage.
 */
export default function ImportChooser({ pending, onChoose, onCancel }: Props) {
  const [remember, setRemember] = useState(false);
  const open = pending !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px]">
            Import {pending?.filename ?? 'SVG'}
          </DialogTitle>
          <DialogDescription>
            Convert immediately, or open the staging workspace to assign a stitch strategy per
            element first.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-[12px]">
          <Switch checked={remember} onCheckedChange={setRemember} aria-label="don't ask again" />
          <Label className="text-[12px]">Don’t ask again</Label>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose('quick', remember)}>
            Quick import
          </Button>
          <Button onClick={() => onChoose('options', remember)}>Import with options…</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
