import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { parseParameters, snapValue } from '../lib/parse-parameters.ts';
import type { ParamItem, ParamDef } from '../lib/parse-parameters.ts';
import { Slider } from '@/components/ui/slider.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Input } from '@/components/ui/input.tsx';
import { cn } from '@/lib/utils.ts';
import styles from './ParametersPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  source: string;
  onParamChange: (name: string, line: number, value: number) => void;
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
  onChange: (name: string, line: number, value: number) => void;
}

function SliderRow({ def, onChange }: SliderRowProps) {
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
    </div>
  );
}

// ── Switch row ────────────────────────────────────────────────────────────────

interface SwitchRowProps {
  def: ParamDef;
  onChange: (name: string, line: number, value: number) => void;
}

function SwitchRow({ def, onChange }: SwitchRowProps) {
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
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ParametersPanel({ source, onParamChange }: Props) {
  const items = useMemo(() => parseParameters(source), [source]);
  const paramCount = items.filter(i => i.kind === 'param').length;

  const [open, setOpen] = useState(true);

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
      <button
        className={styles.header}
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
                  onChange={onParamChange}
                />
              );
            }
            return (
              <SliderRow
                key={`${def.name}-${def.line}`}
                def={def}
                onChange={onParamChange}
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
