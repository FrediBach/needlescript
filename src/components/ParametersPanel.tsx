import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Shuffle, Lock, LockOpen, Copy, Crosshair } from 'lucide-react';
import {
  parseParameters,
  parsePresets,
  snapValue,
  projectPoint,
  sampleRegion,
} from '../lib/parse-parameters.ts';
import type {
  ParamItem,
  ParamDef,
  PointParamDef,
  Preset,
  TextParamDef,
} from '../lib/parse-parameters.ts';
import { Slider } from '@/components/ui/slider.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Input } from '@/components/ui/input.tsx';
import { cn } from '@/lib/utils.ts';
import styles from './ParametersPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParamChange {
  name: string;
  line: number;
  value: number | string | [number, number];
}

interface Props {
  source: string;
  onParamChange: (name: string, line: number, value: number | string) => void;
  onAllParamsChange: (changes: ParamChange[]) => void;
  /** Lock state managed by parent (App.tsx) so stage can also show locked handles */
  lockedParams: Set<string>;
  onToggleLock: (name: string) => void;
  /** Cross-link: hovering a row or clicking Locate notifies the stage to highlight that handle */
  onHighlightHandle?: (name: string | null) => void;
  /** Which handle the stage is currently highlighting (from stage hover → back to panel) */
  highlightedHandle?: string | null;
}

// ── Section separator ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className={styles.sectionHeader} aria-hidden="true">
      <span className={styles.sectionLine} />
      <span className={styles.sectionTitle}>{title}</span>
      <span className={styles.sectionLine} />
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────

interface SliderRowProps {
  def: ParamDef;
  isLocked: boolean;
  onChange: (name: string, line: number, value: number) => void;
  onToggleLock: () => void;
}

function SliderRow({ def, onChange, isLocked, onToggleLock }: SliderRowProps) {
  const { name, value, min, max, step, sliderKind, line } = def;

  // When focused, we keep a local draft string so the user can type freely.
  // While not focused we display the prop value directly (no sync needed).
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const display = isEditing ? draft : formatSliderValue(value, sliderKind);

  const handleFocus = useCallback(() => {
    setDraft(formatSliderValue(value, sliderKind));
    setIsEditing(true);
  }, [value, sliderKind]);

  const commitInput = useCallback(() => {
    setIsEditing(false);
    const raw = parseFloat(draft);
    if (!Number.isFinite(raw)) return;
    const snapped = snapValue(raw, min, max, step);
    onChange(name, line, snapped);
  }, [draft, min, max, step, name, line, onChange]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = snapValue(value + step, min, max, step);
        setDraft(formatSliderValue(next, sliderKind));
        onChange(name, line, next);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = snapValue(value - step, min, max, step);
        setDraft(formatSliderValue(next, sliderKind));
        onChange(name, line, next);
      }
    },
    [value, step, min, max, sliderKind, name, line, onChange],
  );

  const handleSliderChange = useCallback(
    (vals: number | readonly number[]) => {
      const raw = Array.isArray(vals) ? (vals as number[])[0] : (vals as number);
      const snapped = snapValue(raw, min, max, step);
      // Keep draft in sync when slider moves while editing
      if (isEditing) setDraft(formatSliderValue(snapped, sliderKind));
      onChange(name, line, snapped);
    },
    [min, max, step, sliderKind, name, line, onChange, isEditing],
  );

  return (
    <div className={styles.paramRow}>
      <span className={styles.paramName} title={name}>
        {name}
      </span>
      <div className={styles.sliderWrap}>
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={handleSliderChange}
          aria-label={name}
          className={styles.slider}
        />
        <div className={styles.sliderBounds}>
          <span>{formatSliderBound(min, sliderKind)}</span>
          <span>{formatSliderBound(max, sliderKind)}</span>
        </div>
      </div>
      <Input
        type="number"
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={handleFocus}
        onBlur={commitInput}
        onKeyDown={handleInputKeyDown}
        className={styles.valueInput}
        aria-label={`${name} value`}
        step={step}
        min={min}
        max={max}
      />
      <button
        className={cn(styles.lockBtn, isLocked && styles.lockBtnLocked)}
        onClick={onToggleLock}
        type="button"
        title={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-pressed={isLocked}
      >
        {isLocked ? (
          <Lock size={11} aria-hidden="true" />
        ) : (
          <LockOpen size={11} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ── Switch row ────────────────────────────────────────────────────────────────

interface SwitchRowProps {
  def: ParamDef;
  isLocked: boolean;
  onChange: (name: string, line: number, value: number) => void;
  onToggleLock: () => void;
}

function SwitchRow({ def, onChange, isLocked, onToggleLock }: SwitchRowProps) {
  const { name, value, labels, line } = def;
  const isOn = value !== 0;
  const offLabel = labels?.[0] ?? '0';
  const onLabel = labels?.[1] ?? '1';

  const handleChange = useCallback(
    (checked: boolean) => {
      onChange(name, line, checked ? 1 : 0);
    },
    [name, line, onChange],
  );

  return (
    <div className={styles.paramRow}>
      <span className={styles.paramName} title={name}>
        {name}
      </span>
      <div className={styles.switchWrap}>
        <span className={cn(styles.switchLabel, !isOn && styles.switchLabelActive)}>
          {offLabel}
        </span>
        <Switch
          checked={isOn}
          onCheckedChange={handleChange}
          aria-label={name}
          className={styles.switch}
        />
        <span className={cn(styles.switchLabel, isOn && styles.switchLabelActive)}>{onLabel}</span>
      </div>
      <button
        className={cn(styles.lockBtn, isLocked && styles.lockBtnLocked)}
        onClick={onToggleLock}
        type="button"
        title={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-pressed={isLocked}
      >
        {isLocked ? (
          <Lock size={11} aria-hidden="true" />
        ) : (
          <LockOpen size={11} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ── Text row ─────────────────────────────────────────────────────────────────

interface TextRowProps {
  def: TextParamDef;
  onChange: (name: string, line: number, value: string) => void;
}

function TextRow({ def, onChange }: TextRowProps) {
  const { name, value, line } = def;

  return (
    <div className={styles.paramRow}>
      <label
        className={cn(styles.paramName, styles.textParamName)}
        htmlFor={`param-${name}-${line}`}
      >
        {name}
      </label>
      <textarea
        id={`param-${name}-${line}`}
        value={value}
        onChange={(event) => onChange(name, line, event.target.value)}
        className={styles.textInput}
        aria-label={`${name} text`}
        rows={Math.min(4, Math.max(1, value.split('\n').length))}
        spellCheck={false}
      />
    </div>
  );
}

// ── Point row ─────────────────────────────────────────────────────────────────

interface PointRowProps {
  def: PointParamDef;
  isLocked: boolean;
  isHighlighted: boolean;
  onChange: (name: string, line: number, x: number, y: number) => void;
  onToggleLock: () => void;
  onLocate: (name: string) => void;
  onHoverEnter: (name: string) => void;
  onHoverLeave: () => void;
}

function PointRow({
  def,
  isLocked,
  onChange,
  onToggleLock,
  onLocate,
  onHoverEnter,
  onHoverLeave,
}: PointRowProps) {
  const { name, valueX, valueY, line, region, snap } = def;

  const xFixed = region.kind === 'axis' && region.axis === 'y'; // x is FIXED when axis='y'
  const yFixed = region.kind === 'axis' && region.axis === 'x'; // y is FIXED when axis='x'

  // While focused we keep a local draft; otherwise display the prop value directly.
  const [xDraft, setXDraft] = useState('');
  const [yDraft, setYDraft] = useState('');
  const [xEditing, setXEditing] = useState(false);
  const [yEditing, setYEditing] = useState(false);
  const displayX = xEditing ? xDraft : formatPointCoord(valueX);
  const displayY = yEditing ? yDraft : formatPointCoord(valueY);

  const commitXInput = useCallback(() => {
    setXEditing(false);
    const raw = parseFloat(xDraft);
    if (!Number.isFinite(raw)) return;
    const { x, y } = projectPoint({ x: raw, y: valueY }, region, snap);
    onChange(name, line, x, y);
  }, [xDraft, valueY, region, snap, name, line, onChange]);

  const commitYInput = useCallback(() => {
    setYEditing(false);
    const raw = parseFloat(yDraft);
    if (!Number.isFinite(raw)) return;
    const { x, y } = projectPoint({ x: valueX, y: raw }, region, snap);
    onChange(name, line, x, y);
  }, [yDraft, valueX, region, snap, name, line, onChange]);

  const handleXKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }, []);

  const handleYKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }, []);

  return (
    <div
      className={styles.paramRow}
      onMouseEnter={() => onHoverEnter(name)}
      onMouseLeave={onHoverLeave}
    >
      <span className={cn(styles.paramName, styles.pointParamName)} title={name}>
        {name}
      </span>
      <div className={styles.pointWrap}>
        <span className={styles.pointLabel}>x</span>
        <Input
          type="number"
          value={displayX}
          onChange={(e) => setXDraft(e.target.value)}
          onFocus={() => {
            setXDraft(formatPointCoord(valueX));
            setXEditing(true);
          }}
          onBlur={commitXInput}
          onKeyDown={handleXKeyDown}
          className={styles.pointInput}
          aria-label={`${name} x`}
          disabled={xFixed}
          step={snap ?? 0.1}
        />
        <span className={styles.pointLabel}>y</span>
        <Input
          type="number"
          value={displayY}
          onChange={(e) => setYDraft(e.target.value)}
          onFocus={() => {
            setYDraft(formatPointCoord(valueY));
            setYEditing(true);
          }}
          onBlur={commitYInput}
          onKeyDown={handleYKeyDown}
          className={styles.pointInput}
          aria-label={`${name} y`}
          disabled={yFixed}
          step={snap ?? 0.1}
        />
        <button
          className={styles.locateBtn}
          type="button"
          title={`Locate ${name} handle on stage`}
          aria-label={`Locate ${name} handle on stage`}
          onClick={() => onLocate(name)}
        >
          <Crosshair size={10} aria-hidden="true" />
        </button>
      </div>
      <button
        className={cn(styles.lockBtn, isLocked && styles.lockBtnLocked)}
        onClick={onToggleLock}
        type="button"
        title={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-pressed={isLocked}
      >
        {isLocked ? (
          <Lock size={11} aria-hidden="true" />
        ) : (
          <LockOpen size={11} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ParametersPanel({
  source,
  onParamChange,
  onAllParamsChange,
  lockedParams,
  onToggleLock,
  onHighlightHandle,
  highlightedHandle,
}: Props) {
  const items = useMemo(() => parseParameters(source), [source]);
  const presets = useMemo(() => parsePresets(source), [source]);
  const paramCount = items.filter(
    (i) => i.kind === 'param' || i.kind === 'point' || i.kind === 'text',
  ).length;

  const [open, setOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ── Flash timer for locate ───────────────────────────────────────────
  const locateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLocate = useCallback(
    (name: string) => {
      if (locateTimerRef.current) clearTimeout(locateTimerRef.current);
      onHighlightHandle?.(name);
      locateTimerRef.current = setTimeout(() => {
        onHighlightHandle?.(null);
        locateTimerRef.current = null;
      }, 1500);
    },
    [onHighlightHandle],
  );

  useEffect(() => {
    return () => {
      if (locateTimerRef.current) clearTimeout(locateTimerRef.current);
    };
  }, []);

  // ── Wrap onParamChange so any manual edit deselects the active preset ───
  const handleParamChange = useCallback(
    (name: string, line: number, value: number | string) => {
      setActivePreset(null);
      onParamChange(name, line, value);
    },
    [onParamChange],
  );

  const handlePointChange = useCallback(
    (name: string, line: number, x: number, y: number) => {
      setActivePreset(null);
      onAllParamsChange([{ name, line, value: [x, y] }]);
    },
    [onAllParamsChange],
  );

  // ── Randomize (respects locks, clears active preset) ────────────────────
  const handleRandomize = useCallback(() => {
    const scalarChanges = items
      .filter((item): item is Extract<ParamItem, { kind: 'param' }> => item.kind === 'param')
      .filter(({ def }) => !lockedParams.has(def.name))
      .map(({ def }) => {
        const { name, line, min, max, step } = def;
        const raw = min + Math.random() * (max - min);
        return { name, line, value: snapValue(raw, min, max, step) };
      });

    const pointChanges = items
      .filter((item): item is Extract<ParamItem, { kind: 'point' }> => item.kind === 'point')
      .filter(({ def }) => !lockedParams.has(def.name))
      .map(({ def }) => {
        const sampled = sampleRegion(def.region, def.snap, Math.random);
        return {
          name: def.name,
          line: def.line,
          value: [sampled.x, sampled.y] as [number, number],
        };
      });

    const changes = [...scalarChanges, ...pointChanges];
    if (changes.length > 0) {
      setActivePreset(null);
      onAllParamsChange(changes);
    }
  }, [items, lockedParams, onAllParamsChange]);

  // ── Apply preset (overrides locks, sets activePreset) ───────────────────
  const handleApplyPreset = useCallback(
    (presetName: string) => {
      const preset = presets.find((p: Preset) => p.name === presetName);
      if (!preset) return;

      const scalarChanges = items
        .filter((item): item is Extract<ParamItem, { kind: 'param' }> => item.kind === 'param')
        .filter(({ def }) => {
          const v = preset.values[def.name];
          return v !== undefined && typeof v === 'number';
        })
        .map(({ def }) => ({
          name: def.name,
          line: def.line,
          value: snapValue(preset.values[def.name] as number, def.min, def.max, def.step),
        }));

      const pointChanges = items
        .filter((item): item is Extract<ParamItem, { kind: 'point' }> => item.kind === 'point')
        .filter(({ def }) => {
          const v = preset.values[def.name];
          return v !== undefined && Array.isArray(v);
        })
        .map(({ def }) => {
          const [px, py] = preset.values[def.name] as [number, number];
          const { x, y } = projectPoint({ x: px, y: py }, def.region, def.snap);
          return { name: def.name, line: def.line, value: [x, y] as [number, number] };
        });

      const changes = [...scalarChanges, ...pointChanges];
      if (changes.length > 0) {
        setActivePreset(presetName);
        onAllParamsChange(changes);
      }
    },
    [presets, items, onAllParamsChange],
  );

  // ── Copy current param state as a ready-to-paste @preset comment ────────
  const handleCopy = useCallback(() => {
    const assignments = items
      .filter(
        (i): i is Extract<ParamItem, { kind: 'param' | 'point' }> =>
          i.kind === 'param' || i.kind === 'point',
      )
      .map((i) => {
        if (i.kind === 'param') return `${i.def.name}=${formatPresetValue(i.def.value)}`;
        return `${i.def.name}=[${formatPointCoord(i.def.valueX)},${formatPointCoord(i.def.valueY)}]`;
      })
      .join(', ');
    const name = activePreset ?? 'My Preset';
    navigator.clipboard.writeText(`// @preset ${name} : ${assignments}`);
  }, [items, activePreset]);

  // ── Header context menu (right-click → "Copy as preset") ────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // Auto-show the panel whenever parameters appear for the first time, but
  // don't fight the user if they've manually collapsed it.
  const hadParamsRef = useRef(paramCount > 0);
  useEffect(() => {
    if (paramCount > 0 && !hadParamsRef.current) {
      setOpen(true);
      hadParamsRef.current = true;
    }
    if (paramCount === 0) hadParamsRef.current = false;
  }, [paramCount]);

  if (paramCount === 0) return null;

  return (
    <div className={styles.panel} role="region" aria-label="Parameters">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className={styles.header} onContextMenu={handleContextMenu}>
        <button
          className={styles.headerToggle}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          type="button"
        >
          <span className={styles.headerLabel}>Parameters</span>
          <span className={styles.paramCount}>{paramCount}</span>
          <span className={styles.headerSpacer} />
          {open ? (
            <ChevronUp size={12} aria-hidden="true" />
          ) : (
            <ChevronDown size={12} aria-hidden="true" />
          )}
        </button>
        <button
          className={styles.randomizeBtn}
          onClick={handleRandomize}
          type="button"
          title="Randomize all parameters"
          aria-label="Randomize all parameters"
        >
          <Shuffle size={11} aria-hidden="true" />
        </button>
      </div>

      {/* ── Preset bar ──────────────────────────────────────────────── */}
      {open && presets.length > 0 && (
        <div className={styles.presetBar}>
          <div className={styles.presetSelectWrap}>
            <select
              className={styles.presetSelect}
              value={activePreset ?? ''}
              onChange={(e) => {
                if (e.target.value) handleApplyPreset(e.target.value);
              }}
              aria-label="Presets"
            >
              <option value="" disabled>
                — preset —
              </option>
              {presets.map((p: Preset) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className={styles.presetChevron} aria-hidden="true" />
          </div>
          <button
            className={styles.copyBtn}
            onClick={handleCopy}
            type="button"
            title="Copy current values as preset"
            aria-label="Copy current values as preset"
          >
            <Copy size={11} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      {open && (
        <div className={styles.body}>
          {items.map((item: ParamItem, idx: number) => {
            if (item.kind === 'section') {
              return <SectionHeader key={`s-${idx}`} title={item.title} />;
            }
            if (item.kind === 'point') {
              const { def } = item;
              return (
                <PointRow
                  key={`${def.name}-${def.line}`}
                  def={def}
                  isLocked={lockedParams.has(def.name)}
                  isHighlighted={highlightedHandle === def.name}
                  onChange={handlePointChange}
                  onToggleLock={() => onToggleLock(def.name)}
                  onLocate={handleLocate}
                  onHoverEnter={(n) => onHighlightHandle?.(n)}
                  onHoverLeave={() => onHighlightHandle?.(null)}
                />
              );
            }
            if (item.kind === 'text') {
              const { def } = item;
              return (
                <TextRow key={`${def.name}-${def.line}`} def={def} onChange={handleParamChange} />
              );
            }
            const { def } = item;
            if (def.controlType === 'switch') {
              return (
                <SwitchRow
                  key={`${def.name}-${def.line}`}
                  def={def}
                  isLocked={lockedParams.has(def.name)}
                  onChange={handleParamChange}
                  onToggleLock={() => onToggleLock(def.name)}
                />
              );
            }
            return (
              <SliderRow
                key={`${def.name}-${def.line}`}
                def={def}
                isLocked={lockedParams.has(def.name)}
                onChange={handleParamChange}
                onToggleLock={() => onToggleLock(def.name)}
              />
            );
          })}
        </div>
      )}

      {/* ── Context menu portal (right-click on header) ───────────────── */}
      {contextMenu &&
        createPortal(
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className={styles.contextMenuItem}
              type="button"
              onClick={() => {
                handleCopy();
                setContextMenu(null);
              }}
            >
              <Copy size={11} aria-hidden="true" />
              Copy as preset
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatSliderValue(value: number, kind: ParamDef['sliderKind']): string {
  if (kind === 'integer') return String(Math.round(value));
  // Show up to 4 significant figures, stripping trailing zeros
  return parseFloat(value.toPrecision(4)).toString();
}

function formatSliderBound(value: number, kind: ParamDef['sliderKind']): string {
  if (kind === 'integer') return String(Math.round(value));
  // Keep bounds compact
  return parseFloat(value.toPrecision(4)).toString();
}

/** Format a number for use in a @preset comment — integer or up to 6 sig-figs. */
function formatPresetValue(value: number): string {
  if (Number.isFinite(value) && Math.floor(value) === value) return String(Math.round(value));
  return parseFloat(value.toPrecision(6)).toString();
}

/** Format a point coordinate for display — 1 decimal place. */
function formatPointCoord(value: number): string {
  return value.toFixed(1);
}
