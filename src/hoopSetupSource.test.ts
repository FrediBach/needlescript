import { describe, expect, it } from 'vitest';
import { run } from './lib/engine.ts';
import type { MaterialIntent } from './lib/engine.ts';
import { applyHoopSetupPatch } from './hoopSetupSource.ts';

const material: MaterialIntent = {
  fabricPreset: 'knit',
  grainHeading: 90,
  stretchAlong: 0.2,
  stretchAcross: 0.35,
  threadProfile: 'rayon-60wt',
  threadWidthMM: 0.32,
  needleSize: 75,
  stabilizer: 'cutaway',
  topping: true,
};

describe('applyHoopSetupPatch', () => {
  it('adds background and palette declarations after a header comment', () => {
    expect(
      applyHoopSetupPatch('// Flower\nfd 20\n', {
        background: '#112233',
        palette: ['#abcdef', '#123456'],
      }),
    ).toBe("// Flower\n\nbackground '#112233'\npalette ['#abcdef', '#123456']\n\nfd 20\n");
  });

  it('replaces existing visual declarations without retaining stale duplicates', () => {
    const source = "background 'linen'\npalette ['red']\nbackground '#fff'\nfd 2";
    expect(applyHoopSetupPatch(source, { background: '#101418', palette: ['#c8472f'] })).toBe(
      "background '#101418'\npalette ['#c8472f']\n\nfd 2",
    );
  });

  it('writes a complete, source-ordered material intent and preserves nested overrides', () => {
    const source = [
      "fabric 'woven'",
      "threadprofile 'polyester-40wt'",
      'stitchscope [',
      "  threadprofile 'rayon-40wt'",
      '  fd 4',
      ']',
    ].join('\n');
    const result = applyHoopSetupPatch(source, { material });

    expect(result).toContain("fabric 'knit'  // material intent");
    expect(result).toContain('fabricgrain 90');
    expect(result).toContain('fabricstretch 0.2 0.35');
    expect(result).toContain("threadprofile 'rayon-60wt'\nthreadwidth 0.32");
    expect(result).toContain("needle 75\nstabilizer 'cutaway'\ntopping 1");
    expect(result).toContain("  threadprofile 'rayon-40wt'");
    expect(result.match(/^threadprofile /gm)).toHaveLength(1);
  });

  it('keeps declarations outside a managed machine block', () => {
    const source = [
      '// @machine brother-pe800 hoop=5x7 v1',
      "hoop '5x7'",
      '// @endmachine',
      '',
      'fd 20',
    ].join('\n');
    const result = applyHoopSetupPatch(source, { background: '#eeeeee' });

    expect(result).toContain("// @endmachine\n\nbackground '#eeeeee'\n\nfd 20");
  });

  it('removes an explicit fabric when intent returns to unspecified', () => {
    const result = applyHoopSetupPatch("fabric 'denim'\nfd 2", {
      material: { ...material, fabricPreset: 'unspecified', needleSize: undefined, topping: false },
    });
    expect(result).not.toMatch(/^fabric /m);
    expect(result).toContain('needle 0');
    expect(result).toContain('topping 0');
  });

  it('emits setup declarations that resolve to the selected runtime intent', () => {
    const source = applyHoopSetupPatch('fd 2', {
      background: '#101418',
      palette: ['#112233', '#abcdef'],
      material,
    });
    const result = run(source);

    expect(result.background).toBe('#101418');
    expect(result.colorTable.map(({ hex }) => hex)).toEqual(['#112233', '#abcdef']);
    expect(result.material).toEqual(material);
  });

  it('returns the original source when no setting changed', () => {
    expect(applyHoopSetupPatch('fd 2\r\n', {})).toBe('fd 2\r\n');
  });
});
