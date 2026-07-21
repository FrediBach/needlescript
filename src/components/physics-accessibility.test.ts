import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../lib/engine.ts';
import { bgPanel, consoleErr, consoleOk, gold, text, textMuted } from '../theme.ts';
import PhysicsPanel from './PhysicsPanel.tsx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderPanel() {
  const report = run('lock 0\nrepeat 12 [ fd 0.4 bk 0.4 ]', {
    physicsAnalysis: 'full',
  }).physics;
  if (!report) throw new Error('Expected Physics report.');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onDiagnosticSelect = vi.fn();
  const onDiagnosticHover = vi.fn();
  await act(async () => {
    root?.render(
      createElement(PhysicsPanel, {
        report,
        reportState: { sourceRevision: 0, reportRevision: 0, status: 'current' },
        projectKey: 'accessibility-test',
        selectedDiagnosticId: null,
        onDiagnosticSelect,
        onDiagnosticHover,
        quickFixes: new Map(),
        quickFixPreview: null,
        quickFixOutcome: null,
        onQuickFixPreview: vi.fn(),
        onQuickFixCancel: vi.fn(),
        onQuickFixApply: vi.fn(),
        onQuickFixOutcomeDismiss: vi.fn(),
      }),
    );
  });
  return { report, onDiagnosticSelect, onDiagnosticHover };
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  localStorage.clear();
  root = undefined;
  container = undefined;
});

describe('Physics panel accessibility', () => {
  it('exposes named native controls, text severity, and labelled details', async () => {
    const { report } = await renderPanel();
    const panel = container?.querySelector('section[aria-label="Physics findings"]');
    const filters = panel?.querySelector('[aria-label="Physics finding filters"]');
    const cardButton = panel?.querySelector<HTMLButtonElement>('article button[aria-pressed]');
    const detailButton = panel?.querySelector<HTMLButtonElement>('button[aria-controls]');

    expect(filters?.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
    expect(filters?.querySelectorAll('select')).toHaveLength(2);
    expect(cardButton?.textContent).toMatch(/Blocker|Risk|Note/);
    expect(cardButton?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(detailButton?.getAttribute('aria-label')).toContain(report.diagnostics[0].title);

    await act(async () => detailButton?.click());
    const details = panel?.querySelector('[role="region"]');
    expect(detailButton?.getAttribute('aria-expanded')).toBe('true');
    expect(details?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(details?.textContent).toContain('Threshold set:');
    expect(details?.textContent).toContain('Evidence references');
  });

  it('keeps every panel action in the keyboard focus order', async () => {
    await renderPanel();
    const controls = [...(container?.querySelectorAll<HTMLElement>('button, input, select') ?? [])];
    expect(controls.length).toBeGreaterThan(8);
    for (const control of controls) {
      expect(control.getAttribute('tabindex')).not.toBe('-1');
      if (
        (control instanceof HTMLInputElement ||
          control instanceof HTMLButtonElement ||
          control instanceof HTMLSelectElement) &&
        control.disabled
      ) {
        expect(control.matches(':disabled')).toBe(true);
        continue;
      }
      control.focus();
      expect(document.activeElement).toBe(control);
    }
  });

  it('uses WCAG AA contrast for every Physics text and status token', () => {
    for (const foreground of [text, textMuted, gold, consoleErr, consoleOk])
      expect(contrastRatio(foreground, bgPanel), foreground).toBeGreaterThanOrEqual(4.5);
  });
});

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    if (!channels) throw new Error(`Invalid color ${hex}.`);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].toSorted((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
