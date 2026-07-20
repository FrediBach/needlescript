import { describe, expect, it } from 'vitest';
import type { HoopConfig } from './data.ts';
import { applyHoopDirective, hoopDirective } from './hoopSource.ts';

const round: HoopConfig = {
  id: 'round-150',
  label: '150 mm round',
  widthMM: 150,
  heightMM: 150,
  shape: 'circle',
};
const oval: HoopConfig = {
  id: 'oval-120x75',
  label: '120×75 mm oval',
  widthMM: 120,
  heightMM: 75,
  shape: 'oval',
};
const rectangle: HoopConfig = {
  id: 'rect-180x130',
  label: '180×130 mm',
  widthMM: 180,
  heightMM: 130,
  shape: 'rectangle',
};

describe('hoopDirective', () => {
  it('encodes the selected size and shape', () => {
    expect(hoopDirective(round)).toBe('hoop 150');
    expect(hoopDirective(oval)).toBe("hoop [120, 75, 'oval']");
    expect(hoopDirective(rectangle)).toBe('hoop [180, 130]');
  });
});

describe('applyHoopDirective', () => {
  it('adds a directive ahead of program code while retaining a header comment', () => {
    expect(applyHoopDirective('// Flower\nfd 20\n', round)).toBe('// Flower\nhoop 150\n\nfd 20\n');
  });

  it('adapts an existing directive and retains its author comment', () => {
    expect(applyHoopDirective("hoop '5x7'  // keep this note\nfd 20", oval)).toBe(
      "hoop [120, 75, 'oval']  // keep this note\nfd 20",
    );
  });

  it('does not mistake commented-out code for the active directive', () => {
    expect(applyHoopDirective('// hoop 100\nfd 20', rectangle)).toBe(
      '// hoop 100\nhoop [180, 130]\n\nfd 20',
    );
  });

  it('removes a stale generated machine comment when adapting its hoop', () => {
    expect(
      applyHoopDirective("hoop '5x7'  // 5×7 (130×180) — sized for the PE800\nautotrim 7", round),
    ).toBe('hoop 150\nautotrim 7');
  });
});
