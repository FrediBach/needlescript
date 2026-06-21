import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Shuffle, Lock, LockOpen, Copy } from 'lucide-react';
import { parseParameters, parsePresets, snapValue } from '../lib/parse-parameters.ts';
import type { ParamItem, ParamDef, Preset } from '../lib/parse-parameters.ts';
import { Slider } from '@/components/ui/slider.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Input } from '@/components/ui/input.tsx';
import { cn } from '@/lib/utils.ts';
import styles from './ParametersPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface ParamChange {
  name: string;
  line: number;
  value: number;
}

interface Props {
  source: string;
  onParamChange: (name: string, line: number, value: number) => void;
  onAllParamsChange: (changes: ParamChange[]) => void;
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

  // Local input state so the field is freely editable while typing.
  const [inputVal, setInputVal] = useState(() => formatSliderValue(value, sliderKind));
  // Keep input display in sync when source changes externally.
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    setInputVal(formatSliderValue(value, sliderKind));
  }

  const commitInput = useCallback(() => {
    const raw = parseFloat(inputVal);
    if (!Number.isFinite(raw)) {
      // Reset to current value on bad input
      setInputVal(formatSliderValue(value, sliderKind));
      return;
    }
    const snapped = snapValue(raw, min, max, step);
    setInputVal(formatSliderValue(snapped, sliderKind));
    onChange(name, line, snapped);
  }, [inputVal, value, min, max, step, sliderKind, name, line, onChange]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = snapValue(value + step, min, max, step);
      setInputVal(formatSliderValue(next, sliderKind));
      onChange(name, line, next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = snapValue(value - step, min, max, step);
      setInputVal(formatSliderValue(next, sliderKind));
      onChange(name, line, next);
    }
  }, [value, step, min, max, sliderKind, name, line, onChange]);

  const handleSliderChange = useCallback((vals: number | readonly number[]) => {
    const raw = Array.isArray(vals) ? (vals as number[])[0] : (vals as number);
    const snapped = snapValue(raw, min, max, step);
    setInputVal(formatSliderValue(snapped, sliderKind));
    onChange(name, line, snapped);
  }, [min, max, step, sliderKind, name, line, onChange]);

  return (
    <div className={styles.paramRow}>
      <span className={styles.paramName} title={name}>{name}</span>
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
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
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
        {isLocked
          ? <Lock     size={11} aria-hidden="true" />
          : <LockOpen size={11} aria-hidden="true" />
        }
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
  const onLabel  = labels?.[1] ?? '1';

  const handleChange = useCallback((checked: boolean) => {
    onChange(name, line, checked ? 1 : 0);
  }, [name, line, onChange]);

  return (
    <div className={styles.paramRow}>
      <span className={styles.paramName} title={name}>{name}</span>
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
        <span className={cn(styles.switchLabel, isOn && styles.switchLabelActive)}>
          {onLabel}
        </span>
      </div>
      <button
        className={cn(styles.lockBtn, isLocked && styles.lockBtnLocked)}
        onClick={onToggleLock}
        type="button"
        title={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
        aria-pressed={isLocked}
      >
        {isLocked
          ? <Lock     size={11} aria-hidden="true" />
          : <LockOpen size={11} aria-hidden="true" />
        }
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ParametersPanel({ source, onParamChange, onAllParamsChange }: Props) {
  const items   = useMemo(() => parseParameters(source), [source]);
  const presets = useMemo(() => parsePresets(source),    [source]);
  const paramCount = items.filter(i => i.kind === 'param').length;

  const [open, setOpen]               = useState(true);
  const [lockedParams, setLockedParams] = useState<Set<string>>(() => new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ── Lock toggle ─────────────────────────────────────────────────────────
  const toggleLock = useCallback((name: string) => {
    setLockedParams(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // ── Wrap onParamChange so any manual edit deselects the active preset ───
  const handleParamChange = useCallback((name: string, line: number, value: number) => {
    setActivePreset(null);
    onParamChange(name, line, value);
  }, [onParamChange]);

  // ── Randomize (respects locks, clears active preset) ────────────────────
  const handleRandomize = useCallback(() => {
    const changes = items
      .filter((item): item is Extract<ParamItem, { kind: 'param' }> => item.kind === 'param')
      .filter(({ def }) => !lockedParams.has(def.name))
      .map(({ def }) => {
        const { name, line, min, max, step } = def;
        const raw = min + Math.random() * (max - min);
        return { name, line, value: snapValue(raw, min, max, step) };
      });
    if (changes.length > 0) {
      setActivePreset(null);
      onAllParamsChange(changes);
    }
  }, [items, lockedParams, onAllParamsChange]);

  // ── Apply preset (overrides locks, sets activePreset) ───────────────────
  const handleApplyPreset = useCallback((presetName: string) => {
    const preset = presets.find((p: Preset) => p.name === presetName);
    if (!preset) return;
    const changes = items
      .filter((item): item is Extract<ParamItem, { kind: 'param' }> => item.kind === 'param')
      .filter(({ def }) => def.name in preset.values)
      .map(({ def }) => ({
        name:  def.name,
        line:  def.line,
        value: snapValue(preset.values[def.name], def.min, def.max, def.step),
      }));
    if (changes.length > 0) {
      setActivePreset(presetName);
      onAllParamsChange(changes);
    }
  }, [presets, items, onAllParamsChange]);

  // ── Copy current param state as a ready-to-paste @preset comment ────────
  const handleCopy = useCallback(() => {
    const paramDefs = items
      .filter((item): item is Extract<ParamItem, { kind: 'param' }> => item.kind === 'param')
      .map(({ def }) => def);
    const assignments = paramDefs
      .map(def => `${def.name}=${formatPresetValue(def.value)}`)
      .join(', ');
    const name = activePreset ?? 'My Preset';
    navigator.clipboard.writeText(`// @preset ${name} : ${assignments}`);
  }, [items, activePreset]);

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
      <div className={styles.header}>
        <button
          className={styles.headerToggle}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          type="button"
        >
          <span className={styles.headerLabel}>Parameters</span>
          <span className={styles.paramCount}>{paramCount}</span>
          <span className={styles.headerSpacer} />
          {open
            ? <ChevronUp  size={12} aria-hidden="true" />
            : <ChevronDown size={12} aria-hidden="true" />
          }
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
              onChange={e => { if (e.target.value) handleApplyPreset(e.target.value); }}
              aria-label="Presets"
            >
              <option value="" disabled>— preset —</option>
              {presets.map((p: Preset) => (
                <option key={p.name} value={p.name}>{p.name}</option>
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
            const { def } = item;
            if (def.controlType === 'switch') {
              return (
                <SwitchRow
                  key={`${def.name}-${def.line}`}
                  def={def}
                  isLocked={lockedParams.has(def.name)}
                  onChange={handleParamChange}
                  onToggleLock={() => toggleLock(def.name)}
                />
              );
            }
            return (
              <SliderRow
                key={`${def.name}-${def.line}`}
                def={def}
                isLocked={lockedParams.has(def.name)}
                onChange={handleParamChange}
                onToggleLock={() => toggleLock(def.name)}
              />
            );
          })}
        </div>
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
