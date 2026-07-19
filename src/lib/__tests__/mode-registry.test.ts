import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COMPENSATION_MODES,
  EMBROIDERY_MODE_REGISTRIES,
  FILL_UNDERLAY_MODES,
  SATIN_UNDERLAY_MODES,
} from '../embroidery/embroidery-registry.ts';
import { resolveMode, unknownModeMessage } from '../core/mode-registry.ts';
import {
  FILL_CONNECT_MODES,
  FILL_CONSTRUCTION_MODE_REGISTRIES,
  FILL_STAGGER_MODES,
} from '../embroidery/fill-profile.ts';
import {
  SATIN_CAP_MODES,
  SATIN_CONSTRUCTION_MODE_REGISTRIES,
  SATIN_JOIN_MODES,
  SATIN_WIDE_MODES,
} from '../embroidery/satin-profile.ts';

describe('shared mode registries', () => {
  it('resolves case-insensitively and retains the registry literal type', () => {
    const mode = resolveMode('ZiGzAg', SATIN_UNDERLAY_MODES);
    expect(mode).toBe('zigzag');
    expectTypeOf(mode).toEqualTypeOf<'auto' | 'center' | 'edge' | 'zigzag' | 'off' | undefined>();
  });

  it('returns undefined for an unknown mode', () => {
    expect(resolveMode('spiral', FILL_UNDERLAY_MODES)).toBeUndefined();
  });

  it('formats choices and did-you-mean text consistently', () => {
    expect(unknownModeMessage('underlay', 'Centre', SATIN_UNDERLAY_MODES)).toBe(
      `Unknown underlay 'centre' — did you mean "center"? — expected 'auto', 'center', 'edge', 'zigzag', 'off'`,
    );
  });

  it('keeps every quoted embroidery command in the focused registry', () => {
    expect(Object.keys(EMBROIDERY_MODE_REGISTRIES)).toEqual([
      'fabric',
      'compensation',
      'threadprofile',
      'stabilizer',
      'underlay',
      'fillunderlay',
    ]);
    expect(EMBROIDERY_MODE_REGISTRIES.compensation).toBe(COMPENSATION_MODES);
    expect(FILL_CONSTRUCTION_MODE_REGISTRIES).toEqual({
      fillstagger: FILL_STAGGER_MODES,
      fillconnect: FILL_CONNECT_MODES,
    });
    expect(SATIN_CONSTRUCTION_MODE_REGISTRIES).toEqual({
      satincap: SATIN_CAP_MODES,
      satinjoin: SATIN_JOIN_MODES,
      satinwide: SATIN_WIDE_MODES,
    });
  });
});
