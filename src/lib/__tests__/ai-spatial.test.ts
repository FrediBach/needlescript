import { describe, expect, it } from 'vitest';
import { designStats, run } from '../engine.ts';
import type { PhysicsDiagnostic } from '../core/types.ts';
import { buildAiPreviewSvg, buildSpatialDigest } from '../editor/ai-spatial.ts';

const source = `
hoop 'round100'
palette ['#d1495b', '#176087']
color '#d1495b'
up setxy -10 -5 seth 90 down fd 20 rt 90 fd 10
color '#176087'
fd 5
`;

describe('NeedleScript AI spatial context', () => {
  const result = run(source);
  const stats = designStats(result.events, result.plan, result.colorTable);

  it('summarizes exact placement, color extents, and a bounded text silhouette', () => {
    const digest = buildSpatialDigest(result, stats);

    expect(digest).toContain('Coordinates are hoop-space millimetres');
    expect(digest).toContain('Visible design bounds: x -10.0 mm..10.0 mm, y -20.0 mm..-5.0 mm');
    expect(digest).toContain('Hoop: circle, 100.0 mm × 100.0 mm outer');
    expect(digest).toContain('slot 1 (#d1495b)');
    expect(digest).toContain('slot 2 (#176087)');
    const silhouette = digest.split('Coarse stitched silhouette')[1];
    expect(silhouette.match(/^\|.{16}\|$/gm)).toHaveLength(10);
  });

  it('renders the compiled design, hoop, axes, and numbered diagnostic overlay', () => {
    const diagnostic = {
      severity: 'warning',
      geometry: [
        {
          kind: 'cell',
          role: 'hotspot',
          x: -2,
          y: 3,
          width: 2,
          height: 2,
        },
      ],
    } as PhysicsDiagnostic;
    const svg = buildAiPreviewSvg(result, stats, [diagnostic]);

    expect(svg).toContain('width="640" height="640"');
    expect(svg).toContain('<circle cx="0" cy="0" r="50.000"');
    expect(svg).toContain('stroke="#d1495b"');
    expect(svg).toContain('stroke="#176087"');
    expect(svg).toContain('data-finding="1"');
    expect(svg).toContain('>1</text>');
  });

  it('keeps the text silhouette bounded for a one-dimensional design', () => {
    const lineResult = run('fd 20');
    const lineStats = designStats(lineResult.events, lineResult.plan, lineResult.colorTable);
    const digest = buildSpatialDigest(lineResult, lineStats);

    expect(digest.split('Coarse stitched silhouette')[1].match(/^\|.{16}\|$/gm)).toHaveLength(10);
  });
});
