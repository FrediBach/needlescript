import { useRef, useState } from 'react';
import { EXAMPLES, GALLERY_EXAMPLES } from '../data.ts';
import type { HoopConfig } from '../data.ts';
import { HoopIcon } from './HoopDialog.tsx';
import styles from './Header.module.css';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select.tsx';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip.tsx';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export type ExportFormat = 'dst' | 'pes' | 'exp';

interface Props {
  hoop: HoopConfig;
  onOpenHoopDialog: () => void;
  onSVGImport: () => void;
  onExampleSelect: (key: string) => void;
  onRun: () => void;
  onDownload: (format: ExportFormat) => void;
  onShare: () => Promise<void>;
  onOpenReference: () => void;
}

// Inline version of needlescript-logo-icon.svg with:
//   - background rect removed (transparent)
//   - all fills set to currentColor so it inherits the wordmark text colour
function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 692 692" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_9_26)">
        <rect x="123" y="520.009" width="578" height="77" rx="38.5" transform="rotate(-45 123 520.009)" fill="currentColor"/>
        <path d="M557.932 493.786C572.966 508.821 572.967 533.198 557.932 548.233C542.897 563.268 518.52 563.268 503.484 548.233L370.503 415.252L424.95 360.805L557.932 493.786ZM149.224 139.525C164.259 124.49 188.636 124.49 203.671 139.525L337.269 273.123L282.821 327.57L149.224 193.973C134.188 178.938 134.188 154.561 149.224 139.525Z" fill="currentColor"/>
        <path d="M92 208C33.6349 129.275 130.431 30.0039 213.5 82" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M614 208C672.365 129.275 575.569 30.0039 492.5 82" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M92 473C33.6349 551.725 130.431 650.996 213.5 599" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M614 473C672.365 551.725 575.569 650.996 492.5 599" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
      </g>
      <defs>
        <clipPath id="clip0_9_26">
          <rect width="692" height="692" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

// Strip the " — description" suffix from built-in example keys,
// leaving only the short name: "bloom — rose of circles" → "bloom"
function shortName(key: string): string {
  const sep = key.indexOf(' — ');
  return sep >= 0 ? key.slice(0, sep) : key;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  dst: 'Download .DST',
  pes: 'Download .PES',
  exp: 'Download .EXP',
};

// Shared header button height / font sizing so all buttons feel consistent
const hdrBtn = "h-[30px] text-[12.5px] font-mono px-[11px] cursor-pointer";

/** Dropdown export button — opens a small menu with three format options. */
function ExportDropdown({ onDownload }: { onDownload: (fmt: ExportFormat) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'default' }),
          hdrBtn,
          "px-4 relative",
          "after:absolute after:inset-[3px] after:border after:border-dashed after:border-white/55 after:rounded-sm after:pointer-events-none",
        )}
        aria-label="Export embroidery file"
      >
        Export <ChevronDownIcon className="size-3 opacity-80" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[148px] font-mono text-[12.5px]">
        {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(fmt => (
          <DropdownMenuItem key={fmt} onClick={() => onDownload(fmt)}>
            {FORMAT_LABELS[fmt]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Share button — calls onShare, briefly shows "Copied!" on success, "Failed" on error. */
function ShareButton({ onShare }: { onShare: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleClick() {
    if (state === 'pending') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('pending');
    try {
      await onShare();
      setState('copied');
    } catch {
      setState('error');
    }
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }

  const label = state === 'pending' ? '…'
    : state === 'copied' ? 'Copied!'
    : state === 'error'  ? 'Failed'
    : 'Share';

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={state === 'pending'}
      aria-label="Copy shareable link to clipboard"
      className={cn(
        hdrBtn,
        "w-[80px] justify-center",
        state === 'copied' && "bg-[#1e4030] border-[#2e6048] text-[#7ddaab] hover:bg-[#1e4030] hover:border-[#2e6048]",
        state === 'error'  && "bg-[#3d1e1e] border-[#6a2a2a] text-[#f08080] hover:bg-[#3d1e1e] hover:border-[#6a2a2a]",
      )}
    >
      {label}
    </Button>
  );
}

export default function Header({
  hoop, onOpenHoopDialog, onSVGImport, onExampleSelect, onRun, onDownload, onShare, onOpenReference,
}: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.wordmark}>
        <LogoIcon size={24} />
        <h1>NeedleScript</h1>
        <span className={styles.tag}>Logo inspired programming language for generative embroidery</span>
      </div>

      {/* Hoop selector */}
      <Tooltip>
        <TooltipTrigger
          onClick={onOpenHoopDialog}
          aria-label={`Hoop: ${hoop.label}`}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            hdrBtn,
            "gap-[7px]",
          )}
        >
          <HoopIcon hoop={hoop} size={15} />
          <span>{hoop.label}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Change hoop size and shape</TooltipContent>
      </Tooltip>

      {/* Import SVG */}
      <Button variant="outline" onClick={onSVGImport} className={cn(hdrBtn)}>
        Import SVG
      </Button>

      {/* Examples picker */}
      <Select onValueChange={(val: string | null) => { if (val) onExampleSelect(val); }}>
        <SelectTrigger
          aria-label="Example programs"
          className={cn(hdrBtn, "max-w-[140px] bg-secondary gap-1.5 pr-2")}
        >
          <SelectValue placeholder="examples" />
        </SelectTrigger>
        <SelectContent className="font-mono text-[12.5px]">
          <SelectGroup>
            <SelectLabel className="text-[10px] tracking-wider uppercase">Built-in</SelectLabel>
            {Object.keys(EXAMPLES).map(k => (
              <SelectItem key={k} value={k}>{shortName(k)}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-[10px] tracking-wider uppercase">Gallery</SelectLabel>
            {Object.keys(GALLERY_EXAMPLES).map(k => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Run */}
      <button
        type="button"
        onClick={onRun}
        className={cn(
          "inline-flex items-center shrink-0 cursor-pointer select-none font-mono font-semibold",
          hdrBtn,
          "px-4 relative rounded-md",
          "bg-[var(--red)] border border-[var(--red-d)] text-[#FFF4EA]",
          "hover:bg-[#D55036]",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
          "after:absolute after:inset-[3px] after:border after:border-dashed after:border-white/55 after:rounded-sm after:pointer-events-none",
        )}
      >
        Run&nbsp;&nbsp;<kbd>⌘↵</kbd>
      </button>

      <ExportDropdown onDownload={onDownload} />
      <ShareButton onShare={onShare} />

      {/* Help */}
      <Tooltip>
        <TooltipTrigger
          onClick={onOpenReference}
          aria-label="Language reference"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            "size-[28px] rounded-full p-0 flex-shrink-0",
            "text-[13px] font-semibold font-mono text-muted-foreground hover:text-foreground",
          )}
        >
          ?
        </TooltipTrigger>
        <TooltipContent side="bottom">Language reference</TooltipContent>
      </Tooltip>
    </header>
  );
}
