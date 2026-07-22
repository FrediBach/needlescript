import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineContextMenu, type EditorContextActions } from './MachineMenu.tsx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const baseActions: EditorContextActions = {
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  goToDefinition: vi.fn(),
  changeAll: vi.fn(),
  formatDocument: vi.fn(),
};

async function renderMenu(editorActions: EditorContextActions) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MachineContextMenu, {
        x: 10,
        y: 20,
        active: null,
        budgetMode: false,
        onApply: vi.fn(),
        onFabric: vi.fn(),
        onBudgetModeChange: vi.fn(),
        onRemove: vi.fn(),
        onClose: vi.fn(),
        editorActions,
      }),
    );
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe('editor context menu', () => {
  it('shows Explain with AI only when the action is available', async () => {
    await renderMenu(baseActions);
    expect(container?.textContent).not.toContain('Explain with AI');

    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();

    const explainWithAi = vi.fn();
    await renderMenu({ ...baseActions, explainWithAi });
    const explainButton = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Explain with AI',
    );
    expect(explainButton).toBeDefined();

    await act(async () => explainButton?.click());
    expect(explainWithAi).toHaveBeenCalledOnce();
  });
});
